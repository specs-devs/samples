/**
 * Specs Inc. 2026
 * APIKey Hint component for the AI Music Gen Spectacles lens.
 */
import {
  AvaliableApiTypes,
  RemoteServiceGatewayCredentials
} from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class APIKeyHint extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">API Key Hint – token configuration warning</span><br/><span style="color: #94A3B8; font-size: 11px;">Displays an error message when the Remote Service Gateway token is not set.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component used to display the API key configuration warning")
  text: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private static readonly PLACEHOLDER_MESSAGES = {
    [AvaliableApiTypes.Snap]: "[INSERT SNAP TOKEN HERE]",
    [AvaliableApiTypes.OpenAI]: "[INSERT OPENAI TOKEN HERE]",
    [AvaliableApiTypes.Google]: "[INSERT GOOGLE TOKEN HERE]"
  }

  private static readonly HINT_MESSAGE =
    "Set your API Token in the Remote Service Gateway Credentials component to use the examples"

  onAwake() {
    this.logger = new Logger("APIKeyHint", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    const apiTypes = [AvaliableApiTypes.Snap, AvaliableApiTypes.OpenAI, AvaliableApiTypes.Google]

    const hasInvalidApiKey = apiTypes.some((apiType) => {
      const apiKey = RemoteServiceGatewayCredentials.getApiToken(apiType)
      const placeholder = APIKeyHint.PLACEHOLDER_MESSAGES[apiType]
      return apiKey === placeholder || apiKey === ""
    })

    if (hasInvalidApiKey) {
      this.text.text = APIKeyHint.HINT_MESSAGE
    } else {
      this.text.enabled = false
    }
  }
}
