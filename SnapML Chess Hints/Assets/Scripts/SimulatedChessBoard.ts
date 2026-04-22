/**
 * Specs Inc. 2026
 * Simulated Chess Board component for the SnapML Chess Hints Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class SimulatedChessBoard extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SimulatedChessBoard – editor simulation setup</span><br/><span style="color: #94A3B8; font-size: 11px;">Enables a simulated chess board and camera when running in Lens Studio editor.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Scene References</span>')
  @input
  @hint("Board interface UI root shown in world space")
  boardInterface: SceneObject

  @input
  @hint("Simulated 3D chess board scene object (editor only)")
  simulatedChessBoard: SceneObject

  @input
  @hint("Simulated camera scene object (editor only)")
  simulatedCamera: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake() {
    this.logger = new Logger("SimulatedChessBoard", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    const isEditor = global.deviceInfoSystem.isEditor()

    this.simulatedCamera.enabled = isEditor
    this.simulatedChessBoard.enabled = isEditor
    if (isEditor) {
      this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this))
    }
  }

  onUpdate() {
    const scale = global.deviceInfoSystem.screenScale == 0 ? 3 : 6
    this.simulatedChessBoard.getTransform().setWorldScale(vec3.one().uniformScale(0.01 * scale))
    this.boardInterface.getTransform().setWorldScale(vec3.one().uniformScale(0.08 * scale))
  }
}
