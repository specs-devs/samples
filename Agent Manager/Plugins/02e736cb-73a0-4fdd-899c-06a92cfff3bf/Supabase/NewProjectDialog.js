import * as Ui from "LensStudio:Ui";

// Dialog for creating a new project
export class NewProjectDialog {
  constructor(parentWidget, organizationName, organizationId, dataService) {
    this.parentWidget = parentWidget;
    this.dialog = null;
    this.signals = [];
    this.organizationName = organizationName;
    this.organizationId = organizationId;
    this.dataService = dataService;

    this.dbRealPassword = ""
    this.isUpdatingPasswordField = false // Flag to prevent recursive updates
    this.previousPasswordLength = 0 // Track previous password length
    this.showLastCharTimeout = null // Timeout for hiding the last character

    this.createDialog();
  }

  createDialog() {
    // Create the dialog window
    this.dialog = new Ui.Dialog(this.parentWidget);
    this.dialog.windowTitle = "New Project";
    this.dialog.setFixedWidth(460);
    this.dialog.setFixedHeight(140);

    // Create dialog content
    const dialogWidget = new Ui.Widget(this.dialog);
    dialogWidget.setSizePolicy(Ui.SizePolicy.Policy.Expanding, Ui.SizePolicy.Policy.Expanding);
    const dialogLayout = new Ui.BoxLayout();
    dialogLayout.setDirection(Ui.Direction.TopToBottom);
    dialogLayout.setContentsMargins(16, 16, 16, 16);

    // Add content to the dialog
    this.setupDialogContent(dialogWidget, dialogLayout);

    // Set up the layout
    dialogWidget.layout = dialogLayout;
    this.dialog.widget = dialogWidget;
  }

  setupDialogContent(dialogWidget, dialogLayout) {
    // Create a grid layout for the form fields
    const formWidget = new Ui.Widget(dialogWidget);
    formWidget.setSizePolicy(Ui.SizePolicy.Policy.Expanding, Ui.SizePolicy.Policy.Expanding);
    const formLayout = new Ui.GridLayout();
    formWidget.layout = formLayout;

    // First line: Organization
    const orgLabel = new Ui.Label(formWidget);
    orgLabel.text = "Organization:";
    orgLabel.setMinimumWidth(100);
    orgLabel.setSizePolicy(Ui.SizePolicy.Policy.Fixed, Ui.SizePolicy.Policy.Fixed);

    this.organizationNameLabel = new Ui.Label(formWidget);
    this.organizationNameLabel.text = this.organizationName;
    this.organizationNameLabel.setMinimumWidth(300);

    formLayout.addWidgetAt(orgLabel, 0, 0, Ui.Alignment.AlignBaseline);
    formLayout.addWidgetAt(this.organizationNameLabel, 0, 1, Ui.Alignment.AlignBaseline);

    // Second line: Project Name
    const projectNameLabel = new Ui.Label(formWidget);
    projectNameLabel.text = "Project Name:";
    projectNameLabel.setMinimumWidth(100);

    this.projectNameInput = new Ui.LineEdit(formWidget);
    this.projectNameInput.placeholderText = "Min 3 chars";
    this.projectNameInput.setMinimumWidth(300);
    this.signals.push(this.projectNameInput.onTextChange.connect((text) => {
      this.updateCreateButtonState();
    }));

    formLayout.addWidgetAt(projectNameLabel, 1, 0, Ui.Alignment.AlignBaseline);
    formLayout.addWidgetAt(this.projectNameInput, 1, 1, Ui.Alignment.AlignBaseline);

    // // Third line: Database password
    const dbPasswordLabel = new Ui.Label(formWidget);
    dbPasswordLabel.text = "Database password:";
    dbPasswordLabel.setMinimumWidth(100);

    this.dbPasswordInput = new Ui.LineEdit(formWidget);
    this.dbPasswordInput.placeholderText = "Min 8 chars: letters/numbers/symbols";
    this.dbPasswordInput.setMinimumWidth(300);
    this.signals.push(this.dbPasswordInput.onTextChange.connect((text) => {
      if (this.isUpdatingPasswordField) {
        return; // Prevent recursive updates
      }
      // password mode is not available in LensStudio, so we manually handle it
      this.handlePasswordInput(text);
    }));
    formLayout.addWidgetAt(dbPasswordLabel, 2, 0, Ui.Alignment.AlignBaseline);
    formLayout.addWidgetAt(this.dbPasswordInput, 2, 1, Ui.Alignment.AlignBaseline);

    dialogLayout.addWidget(formWidget);

    // Add buttons section
    this.createButtonsSection(dialogWidget, dialogLayout);
  }

  createButtonsSection(dialogWidget, dialogLayout) {
    // Create buttons widget
    const buttonsWidget = new Ui.Widget(dialogWidget);
    const buttonsLayout = new Ui.BoxLayout();
    buttonsLayout.setDirection(Ui.Direction.LeftToRight);
    buttonsLayout.spacing = 8;

    // Create Cancel button
    const cancelButton = new Ui.PushButton(buttonsWidget);
    cancelButton.text = "Cancel";
    this.signals.push(cancelButton.onClick.connect(() => {
      this.close();
    }));

    // Create Create button
    this.createButton = new Ui.PushButton(buttonsWidget);
    this.createButton.text = "Create";
    this.createButton.primary = true;
    this.createButton.enabled = false; // Disabled until valid input
    this.signals.push(this.createButton.onClick.connect(() => {
      this.onCreateProject();
    }));

    // Add buttons to layout
    buttonsLayout.addStretch(1);
    buttonsLayout.addWidgetWithStretch(cancelButton, 0, Ui.Alignment.AlignRight);
    buttonsLayout.addWidgetWithStretch(this.createButton, 0, Ui.Alignment.AlignRight);

    buttonsWidget.layout = buttonsLayout;
    dialogLayout.addWidget(buttonsWidget);
  }

  validatePassword(password) {
    if (!password || password.length < 8) {
      return { valid: false, message: "Password must be at least 8 characters long" };
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[!@#$%^&*()_=+\[\]{}|;:,.<>?-]/.test(password);

    if (!hasLetter) {
      return { valid: false, message: "Password must contain at least one letter" };
    }

    if (!hasNumber) {
      return { valid: false, message: "Password must contain at least one number" };
    }

    if (!hasSymbol) {
      return { valid: false, message: "Password must contain at least one symbol" };
    }

    return { valid: true, message: "Password is valid" };
  }

  handlePasswordInput(displayText) {
    // If we're currently updating the field, ignore this call
    if (this.isUpdatingPasswordField) {
      return;
    }

    // Clear any existing timeout
    if (this.showLastCharTimeout) {
      clearTimeout(this.showLastCharTimeout);
      this.showLastCharTimeout = null;
    }

    const currentDisplayLength = displayText.length;
    let newCharAdded = false;

    if (currentDisplayLength > this.previousPasswordLength) {
      // Characters were added - take only the new characters
      const addedChars = displayText.substring(this.previousPasswordLength);
      this.dbRealPassword += addedChars;
      newCharAdded = true;
    } else if (currentDisplayLength < this.previousPasswordLength) {
      // Characters were removed (backspace/delete)
      this.dbRealPassword = this.dbRealPassword.substring(0, currentDisplayLength);
    } else if (currentDisplayLength === this.previousPasswordLength && currentDisplayLength > 0) {
      // Same length but different content (character replacement/selection)
      // Replace the last character(s) that were modified
      const newChar = displayText.charAt(currentDisplayLength - 1);
      this.dbRealPassword = this.dbRealPassword.substring(0, currentDisplayLength - 1) + newChar;
      newCharAdded = true;
    }

    // Update the previous length
    this.previousPasswordLength = this.dbRealPassword.length;

    // Show the display - if a new character was added, show it briefly
    let bulletDisplay;
    if (newCharAdded && this.dbRealPassword.length > 0) {
      // Show bullets for all characters except the last one, which shows the actual character
      const lastChar = this.dbRealPassword.charAt(this.dbRealPassword.length - 1);
      bulletDisplay = '•'.repeat(this.dbRealPassword.length - 1) + lastChar;

      // After 1 second, hide the last character too
      this.showLastCharTimeout = setTimeout(() => {
        if (!this.isUpdatingPasswordField) {
          this.isUpdatingPasswordField = true;
          this.dbPasswordInput.text = '•'.repeat(this.dbRealPassword.length);
          this.isUpdatingPasswordField = false;
        }
        this.showLastCharTimeout = null;
      }, 1000);
    } else {
      // Show all bullets
      bulletDisplay = '•'.repeat(this.dbRealPassword.length);
    }

    // Prevent recursive calls
    this.isUpdatingPasswordField = true;
    this.dbPasswordInput.text = bulletDisplay;
    this.isUpdatingPasswordField = false;

    // Validate password and update Create button state
    this.updateCreateButtonState();
  }

  updateCreateButtonState() {
    if (!this.createButton) return;

    const projectName = this.projectNameInput.text.trim();
    const passwordValidation = this.validatePassword(this.dbRealPassword.trim());

    // Enable Create button only if both project name and password are valid
    const isProjectNameValid = projectName.length >= 3;
    const isPasswordValid = passwordValidation.valid;

    this.createButton.enabled = isProjectNameValid && isPasswordValid;

    // Update status message if password is invalid
    if (this.dbRealPassword.length > 0 && !isPasswordValid) {
      this.dataService.updateStatus(`🟡 ${passwordValidation.message}`);
    } else if (isPasswordValid && isProjectNameValid) {
      this.dataService.updateStatus("✅ Ready to create project");
    }
  }

  onCreateProject() {
    // Get user input values
    const projectName = this.projectNameInput.text.trim();
    const dbPassword = this.dbRealPassword.trim();

    if (!projectName || projectName.length < 3) {
      this.dataService.updateStatus("🟡 Project name must be at least 3 characters.");
      return;
    }

    // Validate password
    const passwordValidation = this.validatePassword(dbPassword);
    if (!passwordValidation.valid) {
      this.dataService.updateStatus(`🟡 ${passwordValidation.message}`);
      return;
    }

    // Call createProject on the dataService
    this.dataService.createProject(projectName, this.organizationId, dbPassword);
    this.close();
  }

  show() {
    if (this.dialog) {
      this.dialog.show();
      this.dataService.newProjectDialogPopped = true;
    }
  }

  close() {
    if (this.dialog) {
      this.dialog.close();
      this.dataService.newProjectDialogPopped = false;
    }
  }

  cleanup() {
    // Clear any pending timeout
    if (this.showLastCharTimeout) {
      clearTimeout(this.showLastCharTimeout);
      this.showLastCharTimeout = null;
    }

    // Disconnect all signal connections
    this.signals.forEach(signal => {
      if (signal && signal.disconnect) {
        signal.disconnect();
      }
    });
    this.signals = [];
  }
}
