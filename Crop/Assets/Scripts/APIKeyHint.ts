/**
 * SPECS Inc. 2027
 * APIKey Hint component for the Crop Glasses lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {
  AvaliableApiTypes,
  RemoteServiceGatewayCredentials
} from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials"

@component
export class APIKeyHint extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">APIKeyHint – shows hint text when API tokens are not configured</span><br/><span style="color: #94A3B8; font-size: 11px;">Checks the Snap token (used by the hosted OpenAI request) on awake and displays an instructional message if it is missing or a placeholder.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component that displays the API key setup hint")
  text: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  private static readonly SNAP_PLACEHOLDER = "[INSERT SNAP TOKEN HERE]"

  // Placed in front of the user, just below the example carousel's panel (90 cm ahead, 6.5 cm down), also when it is expanded.
  private static readonly HINT_DISTANCE = 100
  private static readonly HINT_DROP = 22

  private static readonly HINT_MESSAGE =
    "Set your Snap token in the Remote Service Gateway Credentials component to use this Lens"

  onAwake() {
    this.logger = new Logger("APIKeyHint", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    // Crop only uses the hosted OpenAI API, which authenticates with the Snap token.
    const apiKey = RemoteServiceGatewayCredentials.getApiToken(AvaliableApiTypes.Snap)
    const hasInvalidApiKey = !apiKey || apiKey === APIKeyHint.SNAP_PLACEHOLDER

    if (hasInvalidApiKey) {
      this.text.text = APIKeyHint.HINT_MESSAGE
      this.placeInFrontOfUser()
    } else {
      this.text.enabled = false
    }
  }

  private placeInFrontOfUser(): void {
    const camera = WorldCameraFinderProvider.getInstance()
    const position = camera.getWorldPosition()
    let forward = camera.getForwardPositionParallelToGround(1).sub(position)
    forward = forward.length > 0.0001 ? forward.normalize() : new vec3(0, 0, -1)
    const transform = this.text.getSceneObject().getTransform()
    transform.setWorldPosition(
      position.add(forward.uniformScale(APIKeyHint.HINT_DISTANCE)).add(vec3.up().uniformScale(-APIKeyHint.HINT_DROP))
    )
    transform.setWorldRotation(quat.lookAt(forward.uniformScale(-1), vec3.up()))
  }
}
