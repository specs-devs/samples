import * as Ui from "LensStudio:Ui";

// Welcome widget shown when user is not logged in
export class WelcomeWidget {
  constructor(parentWidget, dataService) {
    this.dataService = dataService;
    this.signals = []; // Array to store signal connections for cleanup
    this.widget = new Ui.Widget(parentWidget);
    this.widget.setSizePolicy(Ui.SizePolicy.Policy.Expanding, Ui.SizePolicy.Policy.Expanding);
    this.layout = new Ui.BoxLayout();
    this.layout.setDirection(Ui.Direction.TopToBottom);

    this.setupUI();
    this.setupDataServiceListeners();
    this.widget.layout = this.layout;
  }

  setupUI() {
    // Welcome icon (Supabase logo)
    const iconPath = new Editor.Path(import.meta.resolve('./resources/supabase-snapcloud.svg'));
    this.welcomeIcon = new Ui.ImageView(this.widget);
    this.welcomeIcon.pixmap = new Ui.Pixmap(iconPath);

    this.termsLabel = new Ui.Label(this.widget);
    this.termsLabel.text = 'By pressing "Login", you agree to use your Snapchat account to log in to Snap Cloud and agree to the <a href="http://snap.com/terms/snap-cloud">Snap Cloud Terms</a>.';
    this.termsLabel.openExternalLinks = true;
    this.termsLabel.wordWrap = true;
    this.termsLabel.setMinimumWidth(240);
    this.termsLabel.setMinimumHeight(60);

    // Login button (for when not authorized)
    this.loginButton = new Ui.PushButton(this.widget);
    this.loginButton.text = "Login";
    this.loginButton.primary = true;
    this.loginButton.onClick.connect(() => {
      this.dataService.setAgreeToTerms(true);
      if (this.dataService.getIdToken() !== "") {
        this.updateUI(true);
        this.dataService.requestSupabaseAuthorization();
      } else {
        this.updateUI(false);
        this.dataService.requestSnapAuthorization();
      }
    });

    // Status label
    this.statusLabel = new Ui.Label(this.widget);
    this.statusLabel.text = "";
    this.statusLabel.wordWrap = true;
    this.statusLabel.fontRole = Ui.FontRole.Small;
    this.statusLabel.openExternalLinks = true;
    this.statusLabel.alignment = Ui.Alignment.AlignHCenter;
    this.statusLabel.setMinimumWidth(240);
    // Add widgets to layout
    this.layout.addWidgetWithStretch(this.welcomeIcon, 1, Ui.Alignment.AlignCenter);
    this.layout.addWidget(this.termsLabel)
    this.layout.setWidgetAlignment(this.termsLabel, Ui.Alignment.AlignCenter);
    this.layout.addWidget(this.loginButton);
    this.layout.addWidgetWithStretch(this.statusLabel, 1, Ui.Alignment.AlignCenter);
    this.layout.setWidgetAlignment(this.loginButton, Ui.Alignment.AlignCenter);

    if (this.dataService.getAgreeToTerms() === true && this.dataService.getIdToken() !== "") {
      this.updateUI(true);
      this.dataService.requestSupabaseAuthorization();
    }
  }

  setupDataServiceListeners() {
    this.dataService.addEventListener('SupabaseAuthorization', (data) => {
      if (data && data.success) {
        this.dataService.setSupabaseAuth(data.accessToken, data.refreshToken, data.expiresIn, data.email);
        this.dataService.checkProfileSetup();
      } else if (data && data.error === 'no_verified_email') {
        const loginIssue = 'Email address required: <a href="https://help.snapchat.com/hc/articles/7012350653460-How-do-I-change-or-verify-my-email-address-on-Snapchat">Add an email to your Snapchat account</a> and re-login with the My Lenses portal.';
        this.updateUI(false, loginIssue);
      } else if (data && data.error.includes('Failed to retrieve Supabase token')) {
        this.updateUI(false, data.error);
      }
    });
    this.dataService.addEventListener('SnapAuthorization', (data) => {
      if (data && data.success) {
        if (this.dataService.getAgreeToTerms() === true && this.dataService.getIdToken() !== "") {
          this.updateUI(true);
          return;
        }
      }
      this.updateUI(false);
    });
  }

  getWidget() {
    return this.widget;
  }

  updateUI(ready, message="") {
    if (ready) {
      this.loginButton.enabled = false;
      this.statusLabel.text = "Logging in...";
    } else {
      this.loginButton.enabled = true;
      this.statusLabel.text = "";
      if (this.dataService.getSnapAuthorizationStatus() === true && this.dataService.getIdToken() === "") {
        // not expected state - id token should be available if snap authorized, need to reach support
        this.statusLabel.text = "Login has failed. Snap Cloud: Powered by Supabase is currently in Alpha. <a href=\"https://snap-ar.com/SnapCloudApplication\">Apply for the alpha program</a> to become an approved developer for Snap Cloud. Once approved, return to the My Lenses portal and re-login.";
      } else if (message && message !== "") {
        this.statusLabel.text = message;
      }
    }
  }
}
