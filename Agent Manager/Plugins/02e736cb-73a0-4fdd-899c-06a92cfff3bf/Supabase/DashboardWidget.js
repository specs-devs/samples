import * as Ui from "LensStudio:Ui";
import * as Shell from 'LensStudio:Shell';
import { OrganizationWidget } from "./OrganizationWidget.ts";
import { NewOrganizationDialog } from "./NewOrganizationDialog.ts";

// Main dashboard widget containing organizations list combo box and each organization's OrganizationWidget
export class DashboardWidget {
  constructor(parentWidget, assetManager, dataService, authorization) {
    this.assetManager = assetManager;
    this.dataService = dataService;
    this.authorization = authorization;
    this.signals = [];

    // Create main widget
    this.widget = new Ui.Widget(parentWidget);
    const mainLayout = new Ui.BoxLayout();
    mainLayout.setDirection(Ui.Direction.TopToBottom);

    // Create organizations combo box
    this.organizationComboBox = new Ui.ComboBox(this.widget);

    // Create ToolButtons for actions
    // Create New Organization tool button
    this.createOrgButton = new Ui.ToolButton(this.widget);
    this.createOrgButton.setIcon(Editor.Icon.fromFile(import.meta.resolve("./Resources/plus.svg")));
    this.createOrgButton.toolTip = "Create New Organization";
    this.createOrgButton.onClick.connect(() => {
      // Show new organization dialog or trigger creation logic
      this.showNewOrganizationDialog();
    });

    // Create Open Dashboard tool button
    this.openDashboardButton = new Ui.ToolButton(this.widget);
    this.openDashboardButton.setIcon(Editor.Icon.fromFile(import.meta.resolve("./Resources/browser.svg")));
    this.openDashboardButton.toolTip = "Open Dashboard in Browser";
    this.openDashboardButton.onClick.connect(() => {
      // Open dashboard URL in browser
      Shell.openUrl(`${this.dataService.getSupabaseDashboardUrl()}sign-in-partner#partner=snapchat&id_token=${this.dataService.getIdToken()}`, {})
    });

    // Create Reload page tool button
    this.reloadOrgsButton = new Ui.ToolButton(this.widget);
    this.reloadOrgsButton.setIcon(Editor.Icon.fromFile(import.meta.resolve("./Resources/reload.svg")));
    this.reloadOrgsButton.toolTip = "Reload";
    this.reloadOrgsButton.onClick.connect(() => {
      // Trigger organization reload logic
      this.dataService.fetchOrgs();
    });

    this.signals.push(this.organizationComboBox.onCurrentTextChange.connect((text) => {
      this.requestProjectsRefresh(text);
    }));

    // Organization widget to show projects if available or NoProjectWidget
    const orgs = this.dataService.getOrganizations();
    const selectedIndex = this.getSelectedOrgIndex(this.organizationComboBox.currentText, orgs);
    if (selectedIndex !== -1) {
      this.organizationWidget = new OrganizationWidget(this.widget, this.assetManager, this.dataService, orgs[selectedIndex].name, orgs[selectedIndex].id);
    }
    else {
      this.dataService.updateStatus(`🟡 No valid organization selected: ${this.organizationComboBox.currentText}`);
      this.organizationWidget = new OrganizationWidget(this.widget, this.assetManager, this.dataService, "", "");
    }

    // status label
    this.statusLabel = new Ui.Label(this.widget);
    this.statusLabel.text = "";
    this.statusLabel.wordWrap = true;
    this.statusLabel.setMinimumHeight(30);

    // Setup layout

    // Add ComboBox and ToolButtons in a horizontal layout
    this.comboRowLayout = new Ui.BoxLayout();
    this.comboRowLayout.setDirection(Ui.Direction.LeftToRight);
    this.comboRowLayout.addWidgetWithStretch(this.organizationComboBox, 1, Ui.Alignment.Default);
    this.comboRowLayout.addWidget(this.createOrgButton);
    this.comboRowLayout.addWidget(this.openDashboardButton);
    this.comboRowLayout.addWidget(this.reloadOrgsButton);
    mainLayout.addLayout(this.comboRowLayout);

    // Add project info widget with stretch to fill remaining space
    mainLayout.addWidgetWithStretch(this.organizationWidget.getWidget(), 1, Ui.Alignment.Default);

    // Add status label below organizationWidget
    mainLayout.addWidget(this.statusLabel);

    this.widget.layout = mainLayout;

    // Also ensure main widget has proper size policy
    this.widget.setSizePolicy(Ui.SizePolicy.Policy.Expanding, Ui.SizePolicy.Policy.Expanding);

    // Setup data service listeners
    this.setupDataServiceListeners();
  }

  setupDataServiceListeners() {
    // No need for organizationsClearing since we recreate the whole widget on logout

    this.dataService.addEventListener('organizationsFetched', (data) => {
      if (data.success && data.organizations && data.organizations.length > 0) {
        if (!this.organizationComboBox) {
          return;
        }

        // get all duplicated orgs in data.organizations
        const orgNameToIds = new Map();
        var organizationComboBoxTitle = [];
        this.organizationComboBox.clear();

        // Count occurrences of each org ID
        data.organizations.forEach((org) => {
          orgNameToIds.set(org.name, (orgNameToIds.get(org.name) || []).concat([org.id]));
        });

        data.organizations.forEach((org, index) => {
          if (orgNameToIds.get(org.name).length > 1) {
            // new orgs added
            let alreadyAdded = false;
            alreadyAdded = organizationComboBoxTitle.includes(`${org.name} (${org.id})`); // exact match
            if (!alreadyAdded) {
              // check if the org name without id is already added and this org.id is the first id for that name
              // it happens when we have two orgs with same name and we add the first one, then the second one and reload
              alreadyAdded = organizationComboBoxTitle.includes(`${org.name}`) && orgNameToIds.get(org.name)[0] === org.id;
            }
            if (!alreadyAdded) {
              this.organizationComboBox.addItem(`${org.name} (${org.id})`);
              organizationComboBoxTitle.push(`${org.name} (${org.id})`);
            }
          } else {
            if (!organizationComboBoxTitle.includes(`${org.name}`)) {
              this.organizationComboBox.addItem(`${org.name}`);
              organizationComboBoxTitle.push(`${org.name}`);
            }
          }
        });

        this.requestProjectsRefresh(this.organizationComboBox.currentText);
      } else if (data.organizations && data.organizations.length === 0) {
        console.log('DashboardWidget: No organizations found. First time setup required. ');
        const defaultName = this.dataService.getUserEmail() ? this.dataService.getUserEmail() + "'s Organization" : "Default Organization";
        this.dataService.createOrganization(defaultName);
      }
    });

    // Listen for organization creation events
    this.dataService.addEventListener('organizationCreated', (data) => {
      if (data.success) {
        // Organization created successfully, fetch organizations again
        this.dataService.fetchOrgs();
      } else {
        // TODO: show go to browser (for manual organization creation)
        console.warn('Organization creation failed. Open dashboard in browser to get more details.');
      }
    });

    // Listen for status updates from SupabaseDataService
    this.dataService.addEventListener('statusUpdated', (data) => {
      if (data && data.message !== undefined) {
        this.statusLabel.text = data.message;
      }
    });
  }

  requestProjectsRefresh(selectedOrgText) {
    // Clear all project-related data when switching organizations
    this.dataService.clearProjectData();
    const orgs = this.dataService.getOrganizations();
    const selectedIndex = this.getSelectedOrgIndex(selectedOrgText, orgs);
    if (selectedIndex !== -1) {
      this.dataService.fetchProjects(selectedIndex);
      this.organizationWidget.updateCurrentOrganization(orgs[selectedIndex].name, orgs[selectedIndex].id);
    } else {
      this.dataService.updateStatus(`🟡 Organization not found for selection: ${selectedOrgText}`);
    }
  }

  showNewOrganizationDialog() {
    // Create and show the new organization dialog
    const dialog = new NewOrganizationDialog(this.widget, this.dataService);
    dialog.show();
  }

  // Helper to extract selected org index from ComboBox text
  getSelectedOrgIndex(text, orgs) {
    if (!text || typeof text !== "string") return -1;
    const lastParenthesesIdx = text.lastIndexOf("(");
    if (lastParenthesesIdx === -1 || !text.endsWith(")")) {
      // not a duplicated name org, so just find by name
      const org = orgs.find(o => o.name === text);
      return org ? orgs.indexOf(org) : -1;
    }
    // text is like "Org Name (With Parentheses) (org-id)", so we extract the org-id between the last parentheses
    const orgId = text.substring(lastParenthesesIdx + 1, text.length - 1);
    const org = orgs.find(o => o.id === orgId);
    if (org) {
      return orgs.indexOf(org);
    }
    // If orgId doesn't match any org, treat the whole text as an org name
    // This handles cases like "Simple (Org name)" where the parentheses are part of the name
    const orgByName = orgs.find(o => o.name === text);
    return orgByName ? orgs.indexOf(orgByName) : -1;
  }

  getWidget() {
    return this.widget;
  }

  cleanup() {
    // Disconnect all signal connections
    this.signals.forEach(signal => {
      if (signal && signal.disconnect) {
        signal.disconnect();
      }
    });
    this.signals = [];
    this.organizationComboBox.clear();
    this.organizationComboBox = null;

    // Cleanup organization widget
    if (this.organizationWidget && this.organizationWidget.cleanup) {
      this.organizationWidget.cleanup();
    }
  }
}
