/**
 * Specs Inc. 2026
 * Test component for the SnapML Starter Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {SurfaceDetection} from "../Scripts/SurfaceDetection"

@component
export class Test extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Test – surface detection example</span><br/><span style="color: #94A3B8; font-size: 11px;">Starter script showing how to trigger SurfaceDetection and place content.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @allowUndefined
  @hint("Scene object containing the visual content to show after surface detection")
  objectVisuals: SceneObject

  @input
  @allowUndefined
  @hint("SurfaceDetection component that manages the hit-test calibration")
  surfaceDetection: SurfaceDetection

  private cubeTrans

  onAwake() {
    this.cubeTrans = this.getSceneObject().getTransform()
  }

  @bindStartEvent
  onStart(): void {
    this.startSurfaceDetection()
  }

  startSurfaceDetection() {
    this.objectVisuals.enabled = false
    this.surfaceDetection.startGroundCalibration((pos, rot) => {
      this.onSurfaceDetected(pos, rot)
    })
  }

  private onSurfaceDetected(pos: vec3, rot: quat) {
    this.objectVisuals.enabled = true
    this.cubeTrans.setWorldPosition(pos)
    this.cubeTrans.setWorldRotation(rot)
  }
}
