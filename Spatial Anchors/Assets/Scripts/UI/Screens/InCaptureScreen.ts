import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {EventBus} from "../../Shared/EventBus"
import {addButtonLabel} from "../../Shared/ButtonTextHelper"

const STATUS_TEXT =
  "Saving the area requires a spatial map.\n\n" +
  "Walk slowly through the space, pan your head, and look at walls/floor for 30–90+ seconds.\n\n" +
  "The % meter can stay at 0 for a while — that is normal. Capture finishes when mapping checkpoints (not when the number looks \"full\")."

/**
 * Screen 3: In-Capture
 * Layout: Status text centered + single Exit Capture button below
 */
export class InCaptureScreen {
  private container: SceneObject
  private eventBus: EventBus
  private logger: Logger
  private statusTextComp: Text
  private exitBtn: RectangleButton

  constructor(parent: SceneObject, eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus
    this.logger = logger

    this.container = global.scene.createSceneObject("InCaptureScreen")
    this.container.setParent(parent)

    this.buildContent()
    this.buildExitButton()

    this.logger.debug("InCaptureScreen built")
  }

  show(): void {
    this.container.enabled = true
  }

  hide(): void {
    this.container.enabled = false
  }

  setStatusText(text: string): void {
    this.statusTextComp.text = text
  }

  destroy(): void {
    this.container.destroy()
  }

  getContainer(): SceneObject {
    return this.container
  }

  // ── Internal ───────────────────────────────────────────

  private buildContent(): void {
    const textObj = global.scene.createSceneObject("CaptureStatusText")
    textObj.setParent(this.container)
    this.statusTextComp = textObj.createComponent("Component.Text") as Text
    this.statusTextComp.text = STATUS_TEXT
    this.statusTextComp.size = 40
    this.statusTextComp.worldSpaceRect = Rect.create(-15, 15, -3, 3)
    this.statusTextComp.horizontalOverflow = HorizontalOverflow.Wrap
    this.statusTextComp.verticalOverflow = VerticalOverflow.Overflow
    this.statusTextComp.horizontalAlignment = HorizontalAlignment.Center
    this.statusTextComp.verticalAlignment = VerticalAlignment.Center
    this.statusTextComp.textFill.mode = TextFillMode.Solid
    this.statusTextComp.textFill.color = new vec4(1, 1, 1, 1)
    this.statusTextComp.renderOrder = 10

    textObj.getTransform().setLocalPosition(new vec3(0, 4, 2))
  }

  private buildExitButton(): void {
    const BTN_W = 8
    const BTN_H = 4

    const exitObj = global.scene.createSceneObject("ExitCaptureBtn")
    exitObj.setParent(this.container)
    exitObj.getTransform().setLocalPosition(new vec3(0, -5, 2))

    this.exitBtn = exitObj.createComponent(RectangleButton.getTypeName()) as RectangleButton
    ;(this.exitBtn as any)._style = "PrimaryNeutral"
    this.exitBtn.size = new vec3(BTN_W, BTN_H, 1)
    this.exitBtn.renderOrder = 10
    this.exitBtn.initialize()
    addButtonLabel(exitObj, "Exit Capture", BTN_W, BTN_H)

    this.exitBtn.onTriggerUp.add(() => {
      this.logger.debug("Exit Capture pressed (during active capture)")
      this.eventBus.emit("exitCapture")
    })
  }
}
