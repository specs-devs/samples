/**
 * Specs Inc. 2026
 * Warning Controller for the Path Pioneer Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class WarningController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WarningController – speed warning overlay</span><br/><span style="color: #94A3B8; font-size: 11px;">Toggles the warning render layer when the player exceeds the speed limit.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Cameras</span>')
  @input
  @hint("Main world-space camera whose render layer is switched when warning is active")
  mainCamera: Camera

  @input
  @hint("Capture variant of the main camera, toggled in sync with mainCamera")
  mainCameraCapture: Camera

  @input
  @hint("Ortho camera displayed when warning is inactive")
  orthoCamera: Camera

  @input
  @hint("Capture variant of the ortho camera, toggled in sync with orthoCamera")
  orthoCameraCapture: Camera

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Visuals</span>')
  @input
  @hint("Scene object whose layer is used as the warning render layer")
  warningVisual: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private mainCameraLayers: LayerSet
  private mainCameraCaptureLayers: LayerSet
  private warningLayer: LayerSet
  private logger: Logger;

  onAwake() {
    this.logger = new Logger("WarningController", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    this.mainCameraLayers = this.mainCamera.renderLayer
    this.mainCameraCaptureLayers = this.mainCameraCapture.renderLayer
    this.warningLayer = this.warningVisual.layer
  }

  toggleWaring(on: boolean) {
    this.mainCamera.renderLayer = on ? this.warningLayer : this.mainCameraLayers
    this.mainCameraCapture.renderLayer = on ? this.warningLayer : this.mainCameraCaptureLayers
    this.toggleOrtho(!on)
  }

  private toggleOrtho(on: boolean) {
    this.orthoCamera.enabled = on
    this.orthoCameraCapture.enabled = on
  }
}
