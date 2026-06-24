import * as Ui from "LensStudio:Ui";
import * as FileSystem from 'LensStudio:FileSystem';
import * as Utils from 'LensStudio:Utils@1.0.js';
import * as Shell from 'LensStudio:Shell';

// Widget to show list of projects under a specific organization
export class ProjectListWidget {
  constructor(parentWidget, assetManager, dataService) {
    this.parentWidget = parentWidget; // Store parent widget for later use
    this.assetManager = assetManager;
    this.dataService = dataService;
    this.projects = [];
    this.selectedProjectIndex = -1;
    this.projectItems = [];
    this.signals = [];
    this.tempDir = FileSystem.TempDir.create();

    // Create scroll area for projects list
    this.scrollWidget = new Ui.Widget(parentWidget);
    this.scrollLayout = new Ui.BoxLayout();
    this.scrollLayout.setDirection(Ui.Direction.TopToBottom);
    this.scrollLayout.setContentsMargins(0, 0, 0, 0);
    this.scrollLayout.spacing = 2;
    this.scrollWidget.layout = this.scrollLayout;

    this.verticalScrollArea = new Ui.VerticalScrollArea(parentWidget);
    this.verticalScrollArea.setWidget(this.scrollWidget);

    this.setupDataServiceListeners();
  }

  createProjectItem(project, index) {
    const itemWidget = new Ui.Widget(this.scrollWidget);
    itemWidget.setFixedHeight(100);
    itemWidget.backgroundRole = Ui.ColorRole.Midlight;
    itemWidget.autoFillBackground = true;
    const itemLayout = new Ui.BoxLayout();
    itemLayout.setDirection(Ui.Direction.TopToBottom);
    itemLayout.setContentsMargins(8, 4, 8, 4);
    itemLayout.spacing = 0;

    // Project name & status
    const nameStatusWidget = new Ui.Widget(itemWidget);
    nameStatusWidget.setSizePolicy(Ui.SizePolicy.Policy.Expanding, Ui.SizePolicy.Policy.Fixed);
    nameStatusWidget.setFixedHeight(40);
    const nameStatusLayout = new Ui.BoxLayout();
    nameStatusLayout.setDirection(Ui.Direction.LeftToRight);
    nameStatusLayout.spacing = 8;

    const nameLabel = new Ui.Label(itemWidget);
    nameLabel.text = `${project.name}`;
    nameLabel.fontRole = Ui.FontRole.LargeTitleBold;

    // Status label for this project
    const statusLabel = new Ui.Label(itemWidget);
    statusLabel.text = `Status: Checking...`; // need to fetch actual status

    // open in browser button
    const openInBrowserButton = new Ui.ToolButton(itemWidget);
    openInBrowserButton.setIcon(Editor.Icon.fromFile(import.meta.resolve("./Resources/browser.svg")));
    openInBrowserButton.toolTip = "Open Project in Browser";
    openInBrowserButton.onClick.connect(() => {
      // Open dashboard URL in browser
      Shell.openUrl(`${this.dataService.getSupabaseDashboardUrl()}project/${project.id}`, {})
    });

    nameStatusLayout.addWidgetWithStretch(nameLabel, 1, Ui.Alignment.AlignLeft);
    nameStatusLayout.addWidgetWithStretch(statusLabel, 1, Ui.Alignment.AlignRight);
    nameStatusLayout.addWidgetWithStretch(openInBrowserButton, 0, Ui.Alignment.AlignRight);
    nameStatusWidget.layout = nameStatusLayout;

    const detailsWidget = new Ui.Widget(itemWidget);
    detailsWidget.setSizePolicy(Ui.SizePolicy.Policy.Expanding, Ui.SizePolicy.Policy.Fixed);
    detailsWidget.setFixedHeight(34);
    const detailsLayout = new Ui.BoxLayout();
    detailsLayout.setDirection(Ui.Direction.LeftToRight);
    detailsLayout.spacing = 8;

    // Project ID
    const idLabel = new Ui.Label(itemWidget);
    idLabel.text = `ID: ${project.id}`;
    // more details can be added here later
    // ...
    detailsLayout.addWidgetWithStretch(idLabel, 1, Ui.Alignment.AlignLeft);
    detailsWidget.layout = detailsLayout;

    // Create buttons layout
    const buttonsWidget = new Ui.Widget(itemWidget);
    buttonsWidget.setSizePolicy(Ui.SizePolicy.Policy.Expanding, Ui.SizePolicy.Policy.Fixed);
    buttonsWidget.setFixedHeight(40);
    const buttonsLayout = new Ui.BoxLayout();
    buttonsLayout.setDirection(Ui.Direction.LeftToRight);
    buttonsLayout.spacing = 8;

    // Import Credentials button
    const importCredentialsButton = new Ui.PushButton(buttonsWidget);
    importCredentialsButton.setIcon(Editor.Icon.fromFile(import.meta.resolve("./Resources/import.svg")));
    importCredentialsButton.text = "Import Credentials";
    this.signals.push(importCredentialsButton.onClick.connect(() => {
      this.selectedProjectIndex = index;
      this.importCredentialsForProject(project);
    }));

    const importDatabaseTypesButton = new Ui.PushButton(buttonsWidget);
    importDatabaseTypesButton.setIcon(Editor.Icon.fromFile(import.meta.resolve("./Resources/import.svg")));
    importDatabaseTypesButton.text = "Import Database Types";
    importDatabaseTypesButton.enabled = false; // Disabled until project health info is fetched
    this.signals.push(importDatabaseTypesButton.onClick.connect(() => {
      this.selectedProjectIndex = index;
      this.dataService.fetchDatabaseTypeScript(project.id);
    }));

    buttonsLayout.addStretch(1);
    buttonsLayout.addWidgetWithStretch(importCredentialsButton, 0, Ui.Alignment.AlignRight);
    buttonsLayout.addWidgetWithStretch(importDatabaseTypesButton, 0, Ui.Alignment.AlignRight);
    buttonsWidget.layout = buttonsLayout;

    itemLayout.addWidget(nameStatusWidget);
    itemLayout.addWidget(detailsWidget);
    itemLayout.addWidget(buttonsWidget);
    itemWidget.layout = itemLayout;

    return {
      widget: itemWidget,
      nameLabel: nameLabel,
      idLabel: idLabel,
      statusLabel: statusLabel,
      importCredentialsButton: importCredentialsButton,
      importDatabaseTypesButton: importDatabaseTypesButton,
      project: project
    };
  }

  setupDataServiceListeners() {
    // listen to databaseTypeScriptFetched event
    this.dataService.addEventListener('databaseTypeScriptFetched', (data) => {
      if (data.success) {
        this.importDatabaseTypesForProject(data.projectId, data.databaseTypeScript);
      }
    });

    this.dataService.addEventListener('projectsClearing', () => {
      this.clearProjects();
    });

    // Listen for project creation events
    this.dataService.addEventListener('projectCreated', (data) => {
      if (data.success) {
        // Project created successfully, fetch project again
        this.dataService.fetchProjects(data.organizationIndex);
      }
    });

    // Listen to project info events
    this.dataService.addEventListener('projectInfoFetching', (data) => {
      if (data.project && data.project.id) {
        this.updateProjectStatus(data.project.id, "Fetching...");
      }
    });

    this.dataService.addEventListener('projectInfoFetched', (data) => {
      if (data.success && data.anonToken!=='') {
        this.updateProjectStatus(data.project.id, "Ready");
      } else if (data.project && data.project.id) {
        this.updateProjectStatus(data.project.id, "Error");
      }
    });

    this.dataService.addEventListener('projectDetailHealthyStatusFetched', (data) => {
      if (data && data.success && data.project && data.project.id) {
        this.updateProjectHealthStatus(data.project.id, data.detailHealthyStatus);
      }
    });
  }

  clearProjects() {
    // Clear existing items
    this.projectItems = [];
    this.projects = [];
    this.selectedProjectIndex = -1;

    // Recreate the scroll widget and layout to properly clear all widgets
    // Use the stored parent widget
    this.scrollWidget = new Ui.Widget(this.parentWidget);
    this.scrollLayout = new Ui.BoxLayout();
    this.scrollLayout.setDirection(Ui.Direction.TopToBottom);
    this.scrollLayout.setContentsMargins(0, 0, 0, 0);
    this.scrollLayout.spacing = 2;
    this.scrollWidget.layout = this.scrollLayout;

    // Update the scroll area with the new widget
    this.verticalScrollArea.setWidget(this.scrollWidget);
  }

  addProject(project) {
    if (this.projects.find(p => p.id === project.id)) {
      return; // Stop adding if project already exists
    }
    this.projects.push(project);
    const projectItem = this.createProjectItem(project, this.projects.length - 1);
    this.projectItems.push(projectItem);
    this.scrollLayout.addWidget(projectItem.widget);
  }

  addStretch() {
    this.scrollLayout.addStretch(1);
  }

  updateProjectStatus(projectId, status) {
    const projectItem = this.projectItems.find(item =>
      !item.isPlaceholder && item.project && item.project.id === projectId
    );
    if (projectItem && projectItem.importCredentialsButton) {
      if (status === "Ready") {
        projectItem.importCredentialsButton.enabled = true;
      } else {
        projectItem.importCredentialsButton.enabled = false;
      }
    }
  }

  updateProjectHealthStatus(projectId, detailHealthyStatus) {
    const projectItem = this.projectItems.find(item =>
      !item.isPlaceholder && item.project && item.project.id === projectId
    );
    if (projectItem && projectItem.statusLabel && projectItem.importDatabaseTypesButton) {
      projectItem.importDatabaseTypesButton.enabled = false; // Default to disabled
      if (detailHealthyStatus === "green") {
        projectItem.statusLabel.text = `Status: 🟢`;
        projectItem.importDatabaseTypesButton.enabled = true;
      } else if (detailHealthyStatus === "yellow") {
        projectItem.statusLabel.text = `Status: 🟡`;
      } else if (detailHealthyStatus === "red") {
        projectItem.statusLabel.text = `Status: 🛑`;
      } else {
        projectItem.statusLabel.text = `Status: Checking...`;
      }
    }
  }

  importCredentialsForProject(project) {
    // Get the specific credential from the data service
    const credential = this.dataService.getProjectCredential(project.id);

    if (credential && credential.anonToken !== '') {
      const existingSupabaseProject = this.assetManager.assets.filter(asset => asset.isOfType("SupabaseProject"));
      for (const existing of existingSupabaseProject) {
        if (existing.projectId === credential.id) {
          existing.projectId = credential.id;
          existing.projectName = credential.name;
          existing.projectUrl = credential.url;
          existing.publicToken = credential.anonToken;
          this.dataService.updateStatus(`🟢 Credentials updated in ${existing.name}`);
          return;
        }
      }
      const supabaseProjectAssetName = "SupabaseProject " + credential.name;
      const supabaseProjectAsset = this.assetManager.createNativeAsset("SupabaseProject", supabaseProjectAssetName, new Editor.Path(''));
      supabaseProjectAsset.projectId = credential.id;
      supabaseProjectAsset.projectName = credential.name;
      supabaseProjectAsset.projectUrl = credential.url;
      supabaseProjectAsset.publicToken = credential.anonToken; // for easy test only, should be anonToken
      this.dataService.updateStatus(`🟢 Credentials imported in ${supabaseProjectAsset.name}`);
    } else {
      this.dataService.updateStatus(`🟡 Cannot import credentials for project ${project.name}: ${JSON.stringify(credential)}`);
    }
  }

  importDatabaseTypesForProject(projectId, databaseTypes) {
    // Import the database types for the specified project
    // Generate file
    const databaseTypesName = "DatabaseTypes.ts";
    const path = this.tempDir.path.appended(databaseTypesName);
    FileSystem.writeFile(path, databaseTypes);
    const importedTS = Utils.findOrCreate(this.assetManager, path, null);
    this.dataService.updateStatus(`🟢 Database types imported in ${importedTS.name}`);
  }

  getWidget() {
    return this.verticalScrollArea;
  }

  cleanup() {
    // Disconnect all signal connections
    this.signals.forEach(signal => {
      if (signal && signal.disconnect) {
        signal.disconnect();
      }
    });
    this.signals = [];
  }
}
