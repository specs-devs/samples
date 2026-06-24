import * as Ui from "LensStudio:Ui";

// Dialog for creating a new organization
export class NewOrganizationDialog {
  constructor(parentWidget, dataService) {
    this.parentWidget = parentWidget;
    this.dataService = dataService;
    this.dialog = null;
    this.signals = [];
    this.createDialog();
  }

  createDialog() {
    this.dialog = new Ui.Dialog(this.parentWidget);
    this.dialog.windowTitle = "New Organization";
    this.dialog.setFixedWidth(360);
    this.dialog.setFixedHeight(120);

    const dialogWidget = new Ui.Widget(this.dialog);
    dialogWidget.setSizePolicy(Ui.SizePolicy.Policy.Expanding, Ui.SizePolicy.Policy.Expanding);
    const dialogLayout = new Ui.BoxLayout();
    dialogLayout.setDirection(Ui.Direction.TopToBottom);
    dialogLayout.setContentsMargins(16, 16, 16, 16);

    this.setupDialogContent(dialogWidget, dialogLayout);
    dialogWidget.layout = dialogLayout;
    this.dialog.widget = dialogWidget;
  }

  setupDialogContent(dialogWidget, dialogLayout) {
    // One line: Organization Name
    const mainWidget = new Ui.Widget(dialogWidget);
    mainWidget.setSizePolicy(Ui.SizePolicy.Policy.Expanding, Ui.SizePolicy.Policy.Expanding);
    const boxLayout = new Ui.BoxLayout();
    boxLayout.setDirection(Ui.Direction.LeftToRight);
    boxLayout.spacing = 8;
    mainWidget.layout = boxLayout;

    const orgNameLabel = new Ui.Label(mainWidget);
    orgNameLabel.text = "Organization Name:";

    this.orgNameInput = new Ui.LineEdit(mainWidget);
    this.orgNameInput.placeholderText = "Name of your company or team";
    this.orgNameInput.setMinimumWidth(200);
    this.signals.push(this.orgNameInput.onTextChange.connect((text) => {
      if (text.length > 0 && this.createButton) {
        this.createButton.enabled = true;
      }
    }));

    boxLayout.addWidget(orgNameLabel);
    boxLayout.addWidgetWithStretch(this.orgNameInput, 1, Ui.Alignment.Default);

    dialogLayout.addWidget(mainWidget);
    this.createButtonsSection(dialogWidget, dialogLayout);
  }

  createButtonsSection(dialogWidget, dialogLayout) {
    const buttonsWidget = new Ui.Widget(dialogWidget);
    const buttonsLayout = new Ui.BoxLayout();
    buttonsLayout.setDirection(Ui.Direction.LeftToRight);
    buttonsLayout.spacing = 8;

    const cancelButton = new Ui.PushButton(buttonsWidget);
    cancelButton.text = "Cancel";
    this.signals.push(cancelButton.onClick.connect(() => {
      this.close();
    }));

    this.createButton = new Ui.PushButton(buttonsWidget);
    this.createButton.text = "Create";
    this.createButton.primary = true;
    this.createButton.enabled = false; // Disabled until valid input
    this.signals.push(this.createButton.onClick.connect(() => {
      this.onCreateOrganization();
    }));

    buttonsLayout.addStretch(1);
    buttonsLayout.addWidgetWithStretch(cancelButton, 0, Ui.Alignment.AlignRight);
    buttonsLayout.addWidgetWithStretch(this.createButton, 0, Ui.Alignment.AlignRight);
    buttonsWidget.layout = buttonsLayout;
    dialogLayout.addWidget(buttonsWidget);
  }

  onCreateOrganization() {
    const orgName = this.orgNameInput.text.trim();
    if (!orgName) {
      console.warn("Organization name is required.");
      return;
    }
    this.dataService.createOrganization(orgName);
    this.close();
  }

  show() {
    if (this.dialog) {
      this.dialog.show();
    }
  }

  close() {
    if (this.dialog) {
      this.dialog.close();
    }
  }

  cleanup() {
    this.signals.forEach(signal => {
      if (signal && signal.disconnect) {
        signal.disconnect();
      }
    });
    this.signals = [];
  }
}
