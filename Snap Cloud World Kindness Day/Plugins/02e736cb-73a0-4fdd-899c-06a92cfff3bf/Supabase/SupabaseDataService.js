import * as Network from "LensStudio:Network";
import { SupabaseProjectCredential } from "./SupabaseProjectCredential.ts";

// Data service managing Supabase API interactions and state
export class SupabaseDataService {
  constructor(snapAuthorization, devConfig) {
    this.managementApiToken = null;
    this.organizations = [];
    this.projects = [];
    this.projectKeys = [];
    this.projectCredentials = new Map(); // Store credentials per project ID
    this.eventListeners = {};
    this.statusMessage = "";
    this.snapAuthorization = snapAuthorization;
    this.signals = [];
    this.devConfig = devConfig;
    this.agreeToTerms = false;
    // (AVALON-54434) prevent multiple organization creation request
    this.newOrganizationCreatingCounter = new Set();
    // (AVALON-54434) prevent multiple project creation dialog
    this.newProjectDialogPopped = false;

    // listen to snap authorization changes
    this.signals.push(this.snapAuthorization.onAuthorizationChange.connect(() => {
      if (!this.snapAuthorization.isAuthorized) {
        // User logged out
        this.emitFailure('SnapAuthorization', 'User logged out');
      } else if (this.snapAuthorization.idToken === "") {
        // User has invalid id_token
        this.emitFailure('SnapAuthorization', 'User has invalid id_token');
      } else {
        this.emit('SnapAuthorization', {
          success: true
        });
      }
    }));
  }

  // exchange snap id_token for supabase access_token
  requestSupabaseAuthorization() {
    if (this.getAgreeToTerms() === false) {
      this.updateStatus("🟡 User must agree to terms");
      this.emitFailure('SupabaseAuthorization', 'User must agree to terms');
      return;
    }
    if (!this.snapAuthorization || !this.snapAuthorization.isAuthorized) {
      // User is not authorized - handle accordingly
      this.updateStatus("🟡 User logged out");
      this.emitFailure('SupabaseAuthorization', 'User logged out');
      return;
    }
    if (this.snapAuthorization.idToken === "") {
      this.updateStatus("🟡 User has invalid id_token");
      this.emitFailure('SupabaseAuthorization', 'User has invalid id_token');
      return;
      }
    // User is snap authorized - oidc token is ready. Use network performHttpRequest to get supabase token
    const request = new Network.HttpRequest();
    request.url = this.devConfig.SUPABASE_AUTH_URL + "?grant_type=id_token";
    request.method = Network.HttpRequest.Method.Post;
    request.contentType = 'application/json';
    // request.authorization = this.snapAuthorization;
    request.body = JSON.stringify({
      id_token: this.snapAuthorization.idToken,
      provider: "snapchat",
    });
    const reply = Network.performHttpRequestWithReply(request);
    let responseString = "";
    reply.onData.connect((data) => {
      responseString += data.toString();
    });
    reply.onEnd.connect((httpResult) => {
      if (httpResult.statusCode !== 200 && httpResult.statusCode !== 201) {
        if (responseString.includes("provider_email_needs_verification") || responseString.includes("email_address_not_provided")) {
          this.updateStatus(`🟡 Supabase token retrieval failed: ${httpResult.statusCode} , ${responseString}`);
          this.emitFailure('SupabaseAuthorization', 'no_verified_email');
          return;
        }
        this.updateStatus(`🟡 Supabase token retrieval failed: ${httpResult.statusCode} , ${responseString}`);
        this.emitFailure('SupabaseAuthorization', `Failed to retrieve Supabase token: ${httpResult.statusCode} , ${responseString}`);
        console.log(`Failed to retrieve Supabase token: ${httpResult.statusCode} , ${responseString}`);
        return;
      }
      // Successful response
      // Parse the JSON response to extract access_token, refresh_token, expires_in
      // Example response: {"access_token":"...","token_type":"bearer","expires_in":3600,"refresh_token":"...","provider_token":"...","provider_refresh_token":"..."}
      const responseJson = JSON.parse(responseString);
      this.updateStatus("🟢");
      this.emit('SupabaseAuthorization', {
        success: true,
        accessToken: responseJson.access_token,
        refreshToken: responseJson.refresh_token,
        expiresIn: responseJson.expires_in,
        email: responseJson.user ? responseJson.user.email : ""
      });
    });
  }

  // auto-refresh supabase access_token using refresh_token
  startSupabaseAuthRefresher() {
    if (!this.refreshToken || !this.expiresIn) {
      this.updateStatus("🟡 No valid refresh token available");
      return;
    }

    if (this.tokenExpirationTimer) {
      clearTimeout(this.tokenExpirationTimer);
    }

    // Set initial timeout to the expiration time
    this.tokenExpirationTimeout = this.expiresIn;

    // Update timeout every second
    this.tokenExpirationTimer = setInterval(() => {
      if (this.tokenExpirationTimeout > 0) {
        this.tokenExpirationTimeout--;
        return;
      }
      clearInterval(this.tokenExpirationTimer);
      this.tokenExpirationTimer = null;
      this.tokenExpirationTimeout = null;
      // auto-refresh token here
      const request = new Network.HttpRequest();
      request.url = this.devConfig.SUPABASE_AUTH_URL + "?grant_type=refresh_token";
      request.method = Network.HttpRequest.Method.Post;
      request.headers = {
        'Content-Type': 'application/json'
      };
      request.body = JSON.stringify({
        refresh_token: this.refreshToken
      });
      const reply = Network.performHttpRequestWithReply(request);
      let responseString = "";
      reply.onData.connect((data) => {
        responseString += data.toString();
      });
      reply.onEnd.connect((httpResult) => {
        if (httpResult.statusCode !== 200 && httpResult.statusCode !== 201) {
          this.updateStatus(`🟡 Supabase token refresh failed: ${httpResult.statusCode} , ${responseString}`);
          this.emitFailure('SupabaseAuthorization', 'Failed to refresh Supabase token');
          return;
        }
        const responseJson = JSON.parse(responseString);
        this.updateStatus("🟢");
        this.setSupabaseAuth(responseJson.access_token, responseJson.refresh_token, responseJson.expires_in, responseJson.user ? responseJson.user.email : "");
      });
    }, 1000); // Update every second
  }

  // check if user profile is setup
  checkProfileSetup() {
    const request = new Network.HttpRequest();
    request.url = this.devConfig.SUPABASE_MANAGEMENT_API_URL + 'platform/profile';
    request.method = Network.HttpRequest.Method.Post;
    request.headers = {
      'Authorization': `Bearer ${this.managementApiToken}`,
      'Content-Type': 'application/json'
    };
    const reply = Network.performHttpRequestWithReply(request);
    let responseString = "";
    reply.onData.connect((data) => {
      responseString += data.toString();
    });
    reply.onEnd.connect((httpResult) => {
      // regardless of profile check result, we proceed to fetch organizations.
      // there is no guarantees about the response payload for /platform endpoints
      this.fetchOrgs();
      // we did not check status code here because even 400 response code can be valid response
      // 409 {"message":"User already exists"}
      // 404 {"message":"User not found"}
      // 201 {"id":...,"auth0_id":"...","primary_email":"...","username":"...","first_name":null,"last_name":null,"mobile":null,"is_alpha_user":false,"gotrue_id":"...","free_project_limit":2}
      // console.log(`Profile setup check returned: ${httpResult.statusCode} , ${responseString}`);
      const responseJson = JSON.parse(responseString);
      if (responseJson.id) {
        this.updateStatus("🟢 First time login. User profile is already set up");
      }
      if (responseJson.message) {
        if (responseJson.message === "User already exists") {
          this.updateStatus("🟢 User profile is not first time login");
        } else if (responseJson.message === "User not found") {
          this.updateStatus("🟡 User profile might not set up properly");
        } else {
          this.updateStatus(`🟢 Profile setup check returned: ${responseJson.message}`);
        }
      }
    });
  }

  // Fetch organizations from Supabase API
  fetchOrgs() {
    this.organizations = [];
    this.emit('organizationsClearing');

    const request = new Network.HttpRequest();
    request.url = this.devConfig.SUPABASE_MANAGEMENT_API_URL + 'v1/organizations';
    request.method = Network.HttpRequest.Method.Get;
    request.headers = {
      'Authorization': `Bearer ${this.managementApiToken}`,
      'Content-Type': 'application/json'
    };

    const reply = Network.performHttpRequestWithReply(request);
    let responseString = "";
    reply.onData.connect((data) => {
      responseString += data.toString();
    });
    reply.onEnd.connect((httpResult) => {
      if (httpResult.statusCode !== 200 && httpResult.statusCode !== 201) {
        this.updateStatus(`🟡 Failed to fetch organizations: ${httpResult.statusCode} , ${responseString}`);
        this.emitFailure('organizationsFetched', 'Failed to fetch organizations');
        if (responseString.includes("jwt expired")) {
          // token expired - force supabase authorization
          console.log("Supabase token expired - force re-authorization");
          this.requestSupabaseAuthorization();
        }
        return;
      }
      this.organizations = JSON.parse(responseString);

      this.organizations.forEach((org, i) => {
        org["display_index"] = i;
      });
      this.updateStatus(`🟢`);
      this.emit('organizationsFetched', {
        success: true,
        organizations: this.organizations
      });
    });
  }

  // Create a new organization by posting to Supabase API
  createOrganization(name) {
    // (AVALON-54434) prevent multiple creation requests for the same organization name
    if (this.newOrganizationCreatingCounter.has(name)) {
      this.updateStatus(`🟡 Organization ${name} is already being created. Please wait for previous creating result or change the name to retry.`);
      return;
    }
    this.newOrganizationCreatingCounter.add(name);
    const request = new Network.HttpRequest();
    request.url = this.devConfig.SUPABASE_MANAGEMENT_API_URL + 'v1/organizations';
    request.method = Network.HttpRequest.Method.Post;
    request.headers = {
      'Authorization': `Bearer ${this.managementApiToken}`,
      'Content-Type': 'application/json'
    };
    request.body = JSON.stringify({ "name": name });

    this.updateStatus(`🟢 Creating new organization ${JSON.stringify(name)}..., which usually takes several seconds.`);

    const reply = Network.performHttpRequestWithReply(request);
    let responseString = "";
    reply.onData.connect((data) => {
      responseString += data.toString();
    });
    reply.onEnd.connect((httpResult) => {
      if (httpResult.statusCode !== 200 && httpResult.statusCode !== 201) {
        this.newOrganizationCreatingCounter.delete(name);
        this.updateStatus(`🟡 Failed to create organization: ${httpResult.statusCode} , ${responseString}`);
        this.emitFailure('organizationCreated', 'Failed to create organization');
        return;
      }
      const org = JSON.parse(responseString);
      this.updateStatus(`🟢`);
      this.emit('organizationCreated', { success: true, organization: org });
    });
  }

  // Fetch projects for a specific organization by its index in the organizations array
  fetchProjects(orgIndex) {
    this.projects = [];
    this.emit('projectsClearing');

    if (orgIndex < 0 || orgIndex >= this.organizations.length) {
      this.updateStatus(`🟡 Invalid organization index: ${orgIndex}`);
      this.emitFailure('projectsFetched', 'Invalid organization index');
      return;
    }

    // we only have api to fetch all projects
    const request = new Network.HttpRequest();
    request.url = this.devConfig.SUPABASE_MANAGEMENT_API_URL + 'v1/projects';
    request.method = Network.HttpRequest.Method.Get;
    request.headers = {
      'Authorization': `Bearer ${this.managementApiToken}`,
      'Content-Type': 'application/json'
    };

    const reply = Network.performHttpRequestWithReply(request);
    let responseString = "";
    reply.onData.connect((data) => {
      responseString += data.toString();
    });
    reply.onEnd.connect((httpResult) => {
      if (httpResult.statusCode !== 200 && httpResult.statusCode !== 201) {
        this.updateStatus(`🟡 Failed to fetch projects: ${httpResult.statusCode} , ${responseString}`);
        this.emitFailure('projectsFetched', 'Failed to fetch projects');
        return;
      }

      let allProjects = JSON.parse(responseString);
      this.updateStatus(`🟢`);

      if (allProjects.length === 0) {
        this.updateStatus('🟡 No projects under all organizations. Please create a new project.');
        this.emit('projectsFetched', {
          success: false,
          error: 'No projects under all organizations',
          organizationName: this.organizations[orgIndex].name,
          organizationId: this.organizations[orgIndex].id,
          organizationIndex: orgIndex
        });
        return;
      }

      if (orgIndex < 0 || orgIndex >= this.organizations.length) {
        this.emitFailure('projectsFetched', 'Invalid organization info');
        return;
      }

      // filter projects for the selected organization
      allProjects.forEach(project => {
        if (project.organization_id === this.organizations[orgIndex].id) {
          if (!this.projects.find(p => p.id === project.id)) {
            this.projects.push(project);
          }
        }
      });

      if (this.projects.length === 0) {
        this.updateStatus('🟡 No projects found for the selected organization.');
      }

      this.emit('projectsFetched', {
        success: true,
        projects: this.projects,
        organizationName: this.organizations[orgIndex].name
      });
    });
  }

  // Fetch detailed info (API keys) for a specific project by its index in the projects array
  fetchProjectInfo(projectIndex) {
    if (projectIndex < 0 || projectIndex >= this.projects.length) {
      this.updateStatus(`🟡 Invalid project index: ${projectIndex}`);
      this.emitFailure('projectInfoFetched', 'Invalid project index');
      return;
    }

    const project = this.projects[projectIndex];
    this.emit('projectInfoFetching', { projectName: project.name });

    const request = new Network.HttpRequest();
    request.url = `${this.devConfig.SUPABASE_MANAGEMENT_API_URL}v1/projects/${project.id}/api-keys`;
    request.method = Network.HttpRequest.Method.Get;
    request.headers = {
      'Authorization': `Bearer ${this.managementApiToken}`,
      'Content-Type': 'application/json'
    };

    const reply = Network.performHttpRequestWithReply(request);
    let responseString = "";
    reply.onData.connect((data) => {
      responseString += data.toString();
    });
    reply.onEnd.connect((httpResult) => {
      if (httpResult.statusCode !== 200 && httpResult.statusCode !== 201) {
        this.updateStatus(`🟡 Failed to fetch project info: ${httpResult.statusCode} , ${responseString}`);
        this.emit('projectInfoFetched', {
          success: false,
          project: project,
          error: 'Failed to fetch project info'
        });
        return;
      }
      this.projectKeys = JSON.parse(responseString);
      this.updateStatus(`🟢`);

      // Extract anon and service_role keys
      let anonToken = '';
      let privateToken = '';

      this.projectKeys.forEach(key => {
        if (key.id === 'anon') {
          anonToken = key.api_key;
        } else if (key.id === 'service_role') {
          privateToken = key.api_key;
        }
      });

      // Store credentials in the data service
      const credential = new SupabaseProjectCredential(`${project.name}`, `${project.id}`, this.devConfig.SUPABASE_PROJECT_DOMAIN);
      credential.anonToken = anonToken;
      credential.privateToken = privateToken;
      this.projectCredentials.set(project.id, credential);

      this.emit('projectInfoFetched', {
        success: true,
        project: project,
        anonToken: anonToken,
        privateToken: privateToken,
        projectKeys: this.projectKeys
      });
    });
  }

  fetchProjectDetailHealthyStatus(projectIndex) {
    if (projectIndex < 0 || projectIndex >= this.projects.length) {
      this.updateStatus(`🟡 Invalid project index: ${projectIndex}`);
      this.emitFailure('projectDetailHealthyStatusFetched', 'Invalid project index');
      return;
    }

    const project = this.projects[projectIndex];
    this.emit('projectDetailHealthyStatusFetching', { projectName: project.name });

    const allServices = ["auth", "db", "db_postgres_user", "pooler", "realtime", "rest", "storage", "pg_bouncer"];

    const request = new Network.HttpRequest();
    request.url = `${this.devConfig.SUPABASE_MANAGEMENT_API_URL}v1/projects/${project.id}/health`;
    request.url = request.url + "?services=" + allServices.join("&services=");

    request.method = Network.HttpRequest.Method.Get;
    request.headers = {
      'Authorization': `Bearer ${this.managementApiToken}`,
      'Content-Type': 'application/json'
    };

    const reply = Network.performHttpRequestWithReply(request);
    let responseString = "";
    reply.onData.connect((data) => {
      responseString += data.toString();
    });
    reply.onEnd.connect((httpResult) => {
      if (httpResult.statusCode !== 200 && httpResult.statusCode !== 201) {
        this.projects[projectIndex].status = "red";
        this.emit('projectDetailHealthyStatusFetched', {
          success: true,
          project: project,
          detailHealthyStatus: this.projects[projectIndex].status
        });
        return;
      }
      if (projectIndex < 0 || projectIndex >= this.projects.length) {
        return;
      }
      const detailHealthyStatus = JSON.parse(responseString);

      this.projects[projectIndex].status = "green";
      for (const detail of detailHealthyStatus) {
        if (detail.healthy === false || detail.status !== "ACTIVE_HEALTHY") {
          this.projects[projectIndex].status = "yellow";
        }
      }

      this.emit('projectDetailHealthyStatusFetched', {
        success: true,
        project: this.projects[projectIndex],
        detailHealthyStatus: this.projects[projectIndex].status
      });
    });
  }

  // Fetch database TypeScript for a specific project by its ID
  fetchDatabaseTypeScript(projectId) {
    const request = new Network.HttpRequest();
    request.url = `${this.devConfig.SUPABASE_MANAGEMENT_API_URL}v1/projects/${projectId}/types/typescript`;
    request.method = Network.HttpRequest.Method.Get;
    request.headers = {
      'Authorization': `Bearer ${this.managementApiToken}`,
      'Content-Type': 'application/json'
    };

    this.updateStatus(`🟢 Fetching database TypeScript for project ${projectId}..., which usually takes several seconds.`);

    const reply = Network.performHttpRequestWithReply(request);
    let responseString = "";
    reply.onData.connect((data) => {
      responseString += data.toString();
    });
    reply.onEnd.connect((httpResult) => {
      if (httpResult.statusCode !== 200 && httpResult.statusCode !== 201) {
        this.updateStatus(`🟡 Failed to fetch database TypeScript: ${httpResult.statusCode} , ${responseString}`);
        this.emit('databaseTypeScriptFetched', {
          success: false,
          projectId: projectId,
          error: 'Failed to parse database TypeScript response'
        });
        return;
      }
      const responseJson = JSON.parse(responseString);
      this.emit('databaseTypeScriptFetched', {
        success: true,
        projectId: projectId,
        databaseTypeScript: responseJson.types
      });
    });
  }

  // Create a new project under a specific organization
  createProject(projectName, organizationId, databasePassword)  {
    const request = new Network.HttpRequest();
    request.url = `${this.devConfig.SUPABASE_MANAGEMENT_API_URL}v1/projects`;
    request.method = Network.HttpRequest.Method.Post;
    request.headers = {
      'Authorization': `Bearer ${this.managementApiToken}`,
      'Content-Type': 'application/json'
    };

    this.updateStatus(`🟢 Creating new project ${JSON.stringify(projectName)}..., which usually takes several seconds.`);

    request.body = JSON.stringify({
      name: projectName,
      organization_id: organizationId,
      region: this.devConfig.SUPABASE_DEFAULT_PROJECT_REGION,
      db_pass: databasePassword
    });

    const reply = Network.performHttpRequestWithReply(request);
    let responseString = "";
    reply.onData.connect((data) => {
      responseString += data.toString();
    });
    reply.onEnd.connect((httpResult) => {
      if (httpResult.statusCode !== 200 && httpResult.statusCode !== 201) {
        this.updateStatus(`🟡 Failed to create project: ${httpResult.statusCode} , ${responseString}`);
        this.emitFailure('projectCreated', 'Failed to create project');
        return;
      }

      this.updateStatus(`🟢`);
      const projectInfo = JSON.parse(responseString);
      let orgIndex = 0;
      this.organizations.forEach((org, idx) => {
        if (org.id === projectInfo.organization_id) {
          orgIndex = idx;
        }
      });
      this.emit('projectCreated', {
        success: true,
        organizationIndex: orgIndex
      });
    });
  }

  // ------------------agree to terms---------------------
  setAgreeToTerms(agree) {
    this.agreeToTerms = agree;
  }

  getAgreeToTerms() {
    return this.agreeToTerms;
  }

  // ------------------all helper functions below---------------------
  // Event system for notifying UI
  addEventListener(eventType, callback) {
    if (!this.eventListeners[eventType]) {
      this.eventListeners[eventType] = [];
    }
    this.eventListeners[eventType].push(callback);
  }

  removeEventListener(eventType, callback) {
    if (this.eventListeners[eventType]) {
      const index = this.eventListeners[eventType].indexOf(callback);
      if (index > -1) {
        this.eventListeners[eventType].splice(index, 1);
      }
    }
  }

  emit(eventType, data) {
    if (this.eventListeners[eventType]) {
      this.eventListeners[eventType].forEach(callback => callback(data));
    }
  }

  emitFailure(eventType, errorMessage) {
    this.emit(eventType, { success: false, error: errorMessage });
  }

  updateStatus(message) {
    this.statusMessage = message;
    this.emit('statusUpdated', { message: this.statusMessage });
  }

  getProjectCredential(projectId) {
    return this.projectCredentials.get(projectId);
  }

  getSupabaseDashboardUrl() {
    return this.devConfig.SUPABASE_DASHBOARD_URL;
  }

  getSnapAuthorizationStatus() {
    if (this.snapAuthorization) {
      return this.snapAuthorization.isAuthorized;
    }
    return false;
  }

  getIdToken() {
    if (!this.snapAuthorization) {
      return "";
    }
    return this.snapAuthorization.idToken;
  }

  requestSnapAuthorization() {
    if (this.snapAuthorization) {
      this.snapAuthorization.authorize();
    }
  }

  setSupabaseAuth(accessToken, refreshToken, expiresIn, email) {
    this.managementApiToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiresIn = expiresIn;
    this.userEmail = email;
    this.startSupabaseAuthRefresher();
  }

  getUserEmail() {
    return this.userEmail;
  }

  getOrganizations() {
    return this.organizations;
  }

  clearProjectData() {
    this.projects = [];
    this.projectKeys = [];
    this.projectCredentials.clear();
    // Emit the clearing event so UI gets updated
    this.emit('projectsClearing');
  }

  // Clear all data but keep event listeners for re-login
  clearAllData() {
    // Emit clearing events to notify UI components
    this.emit('organizationsClearing');
    this.emit('projectsClearing');

    // Clear the data
    this.organizations = [];
    this.projects = [];
    this.projectKeys = [];
    this.projectCredentials.clear();
    this.managementApiToken = null;
    this.statusMessage = "";
  }

  // Cleanup method for complete shutdown
  cleanup() {
    this.clearAllData();
    this.eventListeners = {};
  }
}
