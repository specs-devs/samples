/**
 * Specs Inc. 2026
 * Debug Visualizer component for the Depth Cache Spectacles lens.
 */
import {SceneController} from "./SceneController"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

@component
export class DebugVisualizer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DebugVisualizer – debug point visualization overlay</span><br/><span style="color: #94A3B8; font-size: 11px;">Plots pixel-space points over a camera frame texture for development testing.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Scene controller used to check whether debug visuals are enabled")
  sceneController: SceneController

  @input
  @hint("Prefab instantiated at each debug point position")
  pointPrefab: ObjectPrefab

  @input
  @hint("Scene object that hosts the camera frame texture for debug overlay")
  testCamVisualObj: SceneObject

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
    this.logger = new Logger("DebugVisualizer", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.testCamVisualObj.enabled = this.sceneController.showDebugVisuals
  }

  updateCameraFrame(cameraFrame: Texture) {
    this.destroyAllLocalPoints(this.testCamVisualObj)
    this.testCamVisualObj.getComponent("RenderMeshVisual").mainPass.baseTex = cameraFrame
  }

  visualizeLocalPoint(pixelPos: vec2, cameraFrame: Texture) {
    const localX = MathUtils.remap(pixelPos.x, 0, cameraFrame.getWidth(), -0.5, 0.5)
    // this one is flipped earlier for lens studio
    const localY = MathUtils.remap(pixelPos.y, 0, cameraFrame.getHeight(), 0.5, -0.5)
    const localPos = new vec3(localX, localY, 0.01)
    const pointObj = this.pointPrefab.instantiate(this.testCamVisualObj)
    const pointTrans = pointObj.getTransform()
    pointTrans.setLocalPosition(localPos)
    pointTrans.setWorldScale(vec3.one().uniformScale(0.5))
  }

  private destroyAllLocalPoints(parentObj: SceneObject) {
    const points = []
    for (let i = 0; i < parentObj.getChildrenCount(); i++) {
      const childObj = parentObj.getChild(i)
      points.push(childObj)
    }
    for (let i = 0; i < points.length; i++) {
      const child = points[i]
      child.destroy()
    }
  }
}
