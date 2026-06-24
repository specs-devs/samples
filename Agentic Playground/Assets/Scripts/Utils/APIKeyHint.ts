/**
 * Specs Inc. 2026
 * APIKey Hint component for the Agentic Playground Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {
  AvaliableApiTypes,
  RemoteServiceGatewayCredentials
} from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials"

@component
export class APIKeyHint extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">APIKeyHint</span>')
  @ui.separator

  @input text: Text

  private static readonly PLACEHOLDER_MESSAGES = {
    [AvaliableApiTypes.Snap]: "[INSERT SNAP TOKEN HERE]",
    [AvaliableApiTypes.OpenAI]: "[INSERT OPENAI TOKEN HERE]",
    [AvaliableApiTypes.Google]: "[INSERT GOOGLE TOKEN HERE]"
  }

  private static readonly HINT_MESSAGE =
    "Set your API Token in the Remote Service Gateway Credentials component to use the examples"


  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("APIKeyHint", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    const hasInvalidApiKey = (Object.values(AvaliableApiTypes) as AvaliableApiTypes[]).some((apiType) => {
      const token = RemoteServiceGatewayCredentials.getApiToken(apiType)
      return !token || token === APIKeyHint.PLACEHOLDER_MESSAGES[apiType]
    })
    if (hasInvalidApiKey) {
      this.text.text = APIKeyHint.HINT_MESSAGE
    } else {
      this.text.enabled = false
    }
  }
}
