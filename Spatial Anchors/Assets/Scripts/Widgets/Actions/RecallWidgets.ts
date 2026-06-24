import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {WidgetBase} from "../WidgetBase"
import {CAMERA_GAZE_OFFSET} from "../../Shared/Constants"

const WIDGET_SPACING = 10

export class RecallWidgets {
  /**
   * Repositions all widgets in a fan/row layout in front of the camera.
   * Widgets are evenly spaced along the camera's right axis.
   */
  static recallAll(
    widgets: WidgetBase[],
    cameraTransform?: Transform
  ): void {
    if (widgets.length === 0) return

    const camTransform =
      cameraTransform ??
      WorldCameraFinderProvider.getInstance().getTransform()

    const basePos = camTransform.getWorldPosition()
    const forward = camTransform.back.uniformScale(CAMERA_GAZE_OFFSET)
    const right = camTransform.right

    const totalWidth = (widgets.length - 1) * WIDGET_SPACING
    const startOffset = -totalWidth / 2

    for (let i = 0; i < widgets.length; i++) {
      const lateralOffset = right.uniformScale(startOffset + i * WIDGET_SPACING)
      const pos = basePos.add(forward).add(lateralOffset)
      const t = widgets[i].getSceneObject().getTransform()
      t.setWorldPosition(pos)
      t.setWorldRotation(camTransform.getWorldRotation())
    }
  }
}
