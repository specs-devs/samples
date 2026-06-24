/**
 * Specs Inc. 2026
 * Snap Cloud Requirements component for the World Kindness Day Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

@component
export class SnapCloudRequirements extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SnapCloudRequirements – Supabase setup validator</span><br/><span style="color: #94A3B8; font-size: 11px;">Centralizes Supabase credentials and validates configuration on start.</span>')
  @ui.separator

  @input
  @hint("SupabaseProject asset from Asset Browser (created via Supabase Plugin)")
  @allowUndefined
  public supabaseProject: SupabaseProject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Warning Settings</span>')

  @input
  @allowUndefined
  @hint("Text component to display warning messages (optional)")
  public text: Text

  @input
  @hint("Disable warnings when requirements are properly set (auto-detected)")
  public disableWarningsWhenConfigured: boolean = true

  @input
  @hint("Show detailed setup instructions in console")
  public showSetupInstructions: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private isFullyConfigured: boolean = false
  private hasShownWarning: boolean = false
  private warningMessage: string = "Snap Cloud Requirements not configured! Please assign Supabase Project."

  onAwake(): void {
    this.logger = new Logger("SnapCloudRequirements", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.validateConfiguration()

    if (this.showSetupInstructions && !this.isFullyConfigured) {
      this.displaySetupInstructions()
    }
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (this.isFullyConfigured) {
      this.logger.info("SnapCloudRequirements fully configured and ready!")
      this.logger.info(`Supabase Project: ${this.supabaseProject ? this.supabaseProject.url : "Missing"}`)

      if (this.text) {
        this.text.enabled = false
      }
    } else {
      this.updateWarningText()
    }
  }

  private validateConfiguration(): void {
    const hasSupabaseProject = this.supabaseProject !== null && this.supabaseProject !== undefined

    this.isFullyConfigured = hasSupabaseProject

    if (!this.isFullyConfigured && !this.hasShownWarning) {
      this.showWarning()
      this.hasShownWarning = true
    } else if (this.isFullyConfigured && this.disableWarningsWhenConfigured) {
      this.logger.info("All requirements configured - warnings disabled")
    }
  }

  private showWarning(): void {
    const warningPrefix = "SnapCloudRequirements Warning:"
    this.logger.header(warningPrefix)
    this.logger.warn(this.warningMessage)

    if (!this.supabaseProject) {
      this.logger.warn("Missing: Supabase Project")
      this.logger.info("   → Create via Window > Supabase > Import Credentials")
    }

    this.logger.info("For InternetModule, use in your script:")
    this.logger.info("   private internetModule: InternetModule = require('LensStudio:InternetModule');")
    this.logger.separator()

    this.updateWarningText()
  }

  private updateWarningText(): void {
    if (!this.text) {
      return
    }

    this.text.enabled = true

    let warningText = this.warningMessage + "\n\n"

    if (!this.supabaseProject) {
      warningText += "Missing: Supabase Project\n"
      warningText += "→ Create via Window > Supabase > Import Credentials"
    }

    this.text.text = warningText
  }

  private displaySetupInstructions(): void {
    this.logger.separator()
    this.logger.info("SnapCloudRequirements Setup Instructions:")
    this.logger.info("")
    this.logger.info("1. SUPABASE PROJECT:")
    this.logger.info("   • Go to Window > Supabase")
    this.logger.info("   • Login to Supabase Plugin")
    this.logger.info("   • Create/Import a Supabase Project")
    this.logger.info("   • Click 'Import Credentials' to create SupabaseProject asset")
    this.logger.info("   • Drag the SupabaseProject asset to this script's input")
    this.logger.info("")
    this.logger.info("2. REFERENCE IN YOUR SCRIPTS:")
    this.logger.info("   Add this to centralize Supabase Project:")
    this.logger.info("")
    this.logger.info("   @input")
    this.logger.info("   public snapCloudRequirements: SnapCloudRequirements;")
    this.logger.info("")
    this.logger.info("3. INTERNET MODULE IN YOUR SCRIPTS:")
    this.logger.info("   Add this directly in each script (no input needed):")
    this.logger.info("")
    this.logger.info("   private internetModule: InternetModule = require('LensStudio:InternetModule');")
    this.logger.info("")
    this.logger.info("4. USE IN YOUR CODE:")
    this.logger.info("   const supabase = this.snapCloudRequirements.getSupabaseProject();")
    this.logger.info("   const url = this.snapCloudRequirements.getRestApiUrl() + 'table_name';")
    this.logger.info("   const response = await this.internetModule.fetch(url, {...});")
    this.logger.info("")
    this.logger.separator()
  }

  public getSupabaseProject(): SupabaseProject {
    if (!this.supabaseProject) {
      this.logger.warn("Supabase Project not configured!")
      if (!this.hasShownWarning) {
        this.showWarning()
        this.hasShownWarning = true
      }
    }
    return this.supabaseProject
  }

  public isConfigured(): boolean {
    return this.isFullyConfigured
  }

  public getSupabaseUrl(): string {
    if (!this.supabaseProject) {
      this.logger.error("Cannot get URL - Supabase Project not configured!")
      return ""
    }
    return this.supabaseProject.url
  }

  public getSupabasePublicToken(): string {
    if (!this.supabaseProject) {
      this.logger.error("Cannot get token - Supabase Project not configured!")
      return ""
    }
    return this.supabaseProject.publicToken
  }

  public getSupabaseHeaders(): {[key: string]: string} {
    if (!this.supabaseProject) {
      this.logger.error("Cannot get headers - Supabase Project not configured!")
      return {}
    }

    return {
      "Content-Type": "application/json",
      apikey: this.supabaseProject.publicToken,
      Authorization: `Bearer ${this.supabaseProject.publicToken}`
    }
  }

  public getStorageApiUrl(): string {
    if (!this.supabaseProject) {
      this.logger.error("Cannot get Storage URL - Supabase Project not configured!")
      return ""
    }
    return this.supabaseProject.url.replace(/\/$/, "") + "/storage/v1/object/public/"
  }

  public getRestApiUrl(): string {
    if (!this.supabaseProject) {
      this.logger.error("Cannot get REST URL - Supabase Project not configured!")
      return ""
    }
    return this.supabaseProject.url.replace(/\/$/, "") + "/rest/v1/"
  }

  public getFunctionsApiUrl(): string {
    if (!this.supabaseProject) {
      this.logger.error("Cannot get Functions URL - Supabase Project not configured!")
      return ""
    }
    return this.supabaseProject.url.replace(/\/$/, "") + "/functions/v1/"
  }

  public setDebugLogging(enabled: boolean): void {
    this.enableLogging = enabled
    this.logger.info(`Debug logging ${enabled ? "enabled" : "disabled"}`)
  }

  public revalidate(): void {
    this.validateConfiguration()
  }
}
