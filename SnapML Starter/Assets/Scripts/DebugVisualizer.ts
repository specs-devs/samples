/**
 * Specs Inc. 2026
 * Debug Visualizer component for the SnapML Starter Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class DebugVisualizer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DebugVisualizer – depth detection debug overlay</span><br/><span style="color: #94A3B8; font-size: 11px;">Renders debug points and bounding-box vertices on the camera frame plane.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Prefabs</span>')
  @input
  @hint("Prefab instantiated at the detection center point")
  pointPrefab: ObjectPrefab

  @input
  @hint("Prefab instantiated at each bounding-box corner vertex")
  pointPrefabVertex: ObjectPrefab

  @input
  @hint("Scene object that displays the camera frame texture as a mesh")
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
    this.testCamVisualObj.enabled = true
  }

  updateCameraFrame(cameraFrame: Texture) {
    this.destroyAllLocalPoints(this.testCamVisualObj)
    this.testCamVisualObj.getComponent("RenderMeshVisual").mainPass.baseTex = cameraFrame
  }

  visualizeLocalPoint(pixelPos: vec2, cameraFrame: Texture) {
    this.logger.debug(
      "visualizeLocalPoint pixel pos " + pixelPos + " cam " + cameraFrame.getWidth() + "x" + cameraFrame.getHeight()
    )

    const localX = MathUtils.remap(pixelPos.x, 0, cameraFrame.getWidth(), -0.5, 0.5)
    const localY = MathUtils.remap(pixelPos.y, 0, cameraFrame.getHeight(), 0.5, -0.5)
    const localPos = new vec3(localX, localY, 0.01)
    const pointObj = this.pointPrefab.instantiate(this.testCamVisualObj)
    this.logger.debug("instantiate point prefab: " + pointObj.name)
    const pointTrans = pointObj.getTransform()
    pointTrans.setLocalPosition(localPos)
    pointTrans.setWorldScale(vec3.one().uniformScale(0.5))
  }

  visualizeBoundingBoxVertices(bbox: number[], cameraFrame: Texture) {
    const centerX = bbox[0]
    const centerY = bbox[1]
    const width = bbox[2]
    const height = bbox[3]

    const halfWidth = width / 2
    const halfHeight = height / 2

    const topLeft = new vec2(centerX - halfWidth, centerY - halfHeight)
    const topRight = new vec2(centerX + halfWidth, centerY - halfHeight)
    const bottomLeft = new vec2(centerX - halfWidth, centerY + halfHeight)
    const bottomRight = new vec2(centerX + halfWidth, centerY + halfHeight)

    const frameWidth = cameraFrame.getWidth()
    const frameHeight = cameraFrame.getHeight()

    const vertices = [
      new vec2(topLeft.x * frameWidth, topLeft.y * frameHeight),
      new vec2(topRight.x * frameWidth, topRight.y * frameHeight),
      new vec2(bottomLeft.x * frameWidth, bottomLeft.y * frameHeight),
      new vec2(bottomRight.x * frameWidth, bottomRight.y * frameHeight)
    ]

    this.logger.debug(
      `Visualizing bounding box vertices for bbox [${centerX.toFixed(
        3
      )}, ${centerY.toFixed(3)}, ${width.toFixed(3)}, ${height.toFixed(3)}]`
    )

    vertices.forEach((vertex, index) => {
      this.visualizeBoundingBoxVertex(vertex, cameraFrame, index)
    })
  }

  private visualizeBoundingBoxVertex(pixelPos: vec2, cameraFrame: Texture, vertexIndex: number) {
    const localX = MathUtils.remap(pixelPos.x, 0, cameraFrame.getWidth(), -0.5, 0.5)
    const localY = MathUtils.remap(pixelPos.y, 0, cameraFrame.getHeight(), 0.5, -0.5)

    const localPos = new vec3(localX, localY, 0.02)
    const pointObj = this.pointPrefabVertex.instantiate(this.testCamVisualObj)
    pointObj.name = `BBoxVertex_${vertexIndex}`

    const pointTrans = pointObj.getTransform()
    pointTrans.setLocalPosition(localPos)
    pointTrans.setWorldScale(vec3.one().uniformScale(0.3))

    this.logger.debug(
      `Visualized vertex ${vertexIndex} at pixel (${pixelPos.x.toFixed(
        1
      )}, ${pixelPos.y.toFixed(1)}) -> local (${localX.toFixed(3)}, ${localY.toFixed(3)})`
    )
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
