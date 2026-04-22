/**
 * Specs Inc. 2026
 * APIKey Hint component for the BLE Playground Spectacles lens.
 */
import {
  AvaliableApiTypes,
  RemoteServiceGatewayCredentials
} from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials"

@component
export class APIKeyHint extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">APIKeyHint – API token validation hint</span><br/><span style="color: #94A3B8; font-size: 11px;">Displays a hint when any RSG API token is missing or uses a placeholder value.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component used to display the API key hint message")
  text: Text

  private static readonly PLACEHOLDER_MESSAGES = {
    [AvaliableApiTypes.Snap]: "[INSERT SNAP TOKEN HERE]",
    [AvaliableApiTypes.OpenAI]: "[INSERT OPENAI TOKEN HERE]",
    [AvaliableApiTypes.Google]: "[INSERT GOOGLE TOKEN HERE]"
  }

  private static readonly HINT_MESSAGE =
    "Set your API Token in the Remote Service Gateway Credentials component to use the examples"

  onAwake() {
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
