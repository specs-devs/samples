import * as Ui from "LensStudio:Ui";
import { NoProjectsWidget } from "./NoProjectsWidget.ts";
import { ProjectListWidget } from "./ProjectListWidget.ts";
import { NewProjectDialog } from "./NewProjectDialog.ts";

// Widget has 2 stack. projectListWidget to show projects under a specific organization. NoProjectsWidget to show a message if no projects exist
export class OrganizationWidget {
  constructor(parentWidget, assetManager, dataService, organizationName = "", organizationId = "") {
    this.assetManager = assetManager;
    this.dataService = dataService; // Store reference to data service
    this.organizationName = organizationName;
    this.organizationId = organizationId;
    this.signals = [];

    // UI components
    this.stackedWidget = null;
    this.noProjectsWidget = null;
    this.projectListWidget = null;

    this.widget = new Ui.Widget(parentWidget);
    this.layout = new Ui.BoxLayout();
    this.layout.setDirection(Ui.Direction.TopToBottom);

    this.setupUI();
    this.setupDataServiceListeners();
    this.widget.layout = this.layout;
  }

  setupUI() {
    // Create header with New Project button
    this.createHeaderSection();

    // Create stacked widget to switch between projects list and no projects message
    this.stackedWidget = new Ui.StackedWidget(this.widget);

    // Create project list widget
    this.projectListWidget = new ProjectListWidget(this.stackedWidget, this.assetManager, this.dataService);

    // Create no projects widget
    this.noProjectsWidget = new NoProjectsWidget(this.stackedWidget);

    // Add both widgets to stacked widget
    this.stackedWidget.addWidget(this.projectListWidget.getWidget());  // Index 0: Projects list
    this.stackedWidget.addWidget(this.noProjectsWidget.getWidget());    // Index 1: No projects message

    // Start with projects list view
    this.stackedWidget.currentIndex = 0;

    // Add stacked widget to main layout
    this.layout.addWidget(this.stackedWidget);
  }

  createHeaderSection() {
    // Create header widget with button
    const headerWidget = new Ui.Widget(this.widget);
    const headerLayout = new Ui.BoxLayout();
    headerLayout.setDirection(Ui.Direction.LeftToRight);
    headerLayout.setContentsMargins(8, 8, 8, 8);

    // Create New Project button
    const newProjectButton = new Ui.PushButton(headerWidget);
    newProjectButton.setIcon(Editor.Icon.fromFile(import.meta.resolve("./Resources/plus.svg")));
    newProjectButton.text = "Create a New Project";
    newProjectButton.setFixedWidth(150);

    // Connect button click to show dialog with stored organization name and id
    this.signals.push(newProjectButton.onClick.connect(() => {
      this.showNewProjectDialog(this.organizationName, this.organizationId);
    }));

    // Add button to left side of header
    // headerLayout.addWidget(newOrgButton);
    headerLayout.addWidget(newProjectButton);
    headerLayout.addStretch(1); // Push button to left

    headerWidget.layout = headerLayout;
    this.layout.addWidget(headerWidget);
  }

  showNewProjectDialog(organizationName, organizationId) {
    // Create and show the new project dialog
    const dialog = new NewProjectDialog(this.widget, organizationName, organizationId, this.dataService);
    dialog.show();
  }

  setupDataServiceListeners() {
    // Listen to projects events
    this.dataService.addEventListener('projectsFetched', (data) => {
      if (data.success) {
        // data.projects already contains only the projects for the current organization
        data.projects.forEach(project => {
          this.addProject(project);
        });
        this.projectListWidget.addStretch();

        if (data.projects.length === 0) {
          this.setNoProjectsMessage(data.organizationName);
        } else {
          // Automatically fetch project info for each project
          data.projects.forEach((project, index) => {
            this.dataService.fetchProjectInfo(index);
            this.dataService.fetchProjectDetailHealthyStatus(index);
          });
        }
      } else if (data.error === 'No projects under all organizations') {
        console.log('No projects found for all organizations. We need to create a default one');
        if (!this.dataService.newProjectDialogPopped) {
          this.showNewProjectDialog(data.organizationName, data.organizationId);
        }
      }
    });
  }

  updateCurrentOrganization(organizationName, organizationId) {
    this.organizationName = organizationName;
    this.organizationId = organizationId;
  }

  addProject(project) {
    this.projectListWidget.addProject(project);
    // Show projects list view
    this.stackedWidget.currentIndex = 0;
  }

  setNoProjectsMessage(organizationName) {
    // Update the message and show no projects view
    this.noProjectsWidget.setMessage(organizationName);
    this.stackedWidget.currentIndex = 1;
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

    // Cleanup ProjectListWidget
    if (this.projectListWidget && this.projectListWidget.cleanup) {
      this.projectListWidget.cleanup();
    }

    // Cleanup NoProjectsWidget
    if (this.noProjectsWidget && this.noProjectsWidget.cleanup) {
      this.noProjectsWidget.cleanup();
    }
  }
}
