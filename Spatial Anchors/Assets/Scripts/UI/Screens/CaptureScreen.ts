import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {EventBus} from "../../Shared/EventBus"
import {addButtonLabel} from "../../Shared/ButtonTextHelper"

const INSTRUCTION_TEXT =
  "Click on Start Capture and Keep look around until the capture automatically completes.  We recommend an area of the size of your work desk more or less."

/**
 * Screen 2: Capture (New Space)
 * Layout: Instruction text + two horizontal buttons (Start Capturing, Exit Capture)
 */
export class CaptureScreen {
  private container: SceneObject
  private eventBus: EventBus
  private logger: Logger
  private startBtn: RectangleButton
  private exitBtn: RectangleButton

  constructor(parent: SceneObject, eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus
    this.logger = logger

    this.container = global.scene.createSceneObject("CaptureScreen")
    this.container.setParent(parent)

    this.buildContent()
    this.buildButtons()

    this.logger.debug("CaptureScreen built")
  }

  show(): void {
    this.container.enabled = true
  }

  hide(): void {
    this.container.enabled = false
  }

  destroy(): void {
    this.container.destroy()
  }

  getContainer(): SceneObject {
    return this.container
  }

  // ── Internal ───────────────────────────────────────────

  private buildContent(): void {
    const textObj = global.scene.createSceneObject("CaptureInstructions")
    textObj.setParent(this.container)
    const textComp = textObj.createComponent("Component.Text") as Text
    textComp.text = INSTRUCTION_TEXT
    textComp.size = 40
    textComp.worldSpaceRect = Rect.create(-15, 15, -3, 3)
    textComp.horizontalOverflow = HorizontalOverflow.Wrap
    textComp.verticalOverflow = VerticalOverflow.Overflow
    textComp.horizontalAlignment = HorizontalAlignment.Center
    textComp.verticalAlignment = VerticalAlignment.Center
    textComp.textFill.mode = TextFillMode.Solid
    textComp.textFill.color = new vec4(1, 1, 1, 1)
    textComp.renderOrder = 10

    textObj.getTransform().setLocalPosition(new vec3(0, 5, 2))
  }

  private buildButtons(): void {
    const buttonContainer = global.scene.createSceneObject("CaptureButtons")
    buttonContainer.setParent(this.container)
    buttonContainer.getTransform().setLocalPosition(new vec3(0, -5, 2))

    const BTN_W = 8
    const BTN_H = 4

    // Start Capturing button
    const startObj = global.scene.createSceneObject("StartCaptureBtn")
    startObj.setParent(buttonContainer)
    startObj.getTransform().setLocalPosition(new vec3(-7, 0, 0))

    this.startBtn = startObj.createComponent(RectangleButton.getTypeName()) as RectangleButton
    ;(this.startBtn as any)._style = "PrimaryNeutral"
    this.startBtn.size = new vec3(BTN_W, BTN_H, 1)
    this.startBtn.renderOrder = 10
    this.startBtn.initialize()
    addButtonLabel(startObj, "Start Capturing", BTN_W, BTN_H)

    this.startBtn.onTriggerUp.add(() => {
      this.logger.debug("Start Capture pressed")
      this.eventBus.emit("startCapture")
    })

    // Exit Capture button
    const exitObj = global.scene.createSceneObject("ExitCaptureBtn")
    exitObj.setParent(buttonContainer)
    exitObj.getTransform().setLocalPosition(new vec3(7, 0, 0))

    this.exitBtn = exitObj.createComponent(RectangleButton.getTypeName()) as RectangleButton
    ;(this.exitBtn as any)._style = "PrimaryNeutral"
    this.exitBtn.size = new vec3(BTN_W, BTN_H, 1)
    this.exitBtn.renderOrder = 10
    this.exitBtn.initialize()
    addButtonLabel(exitObj, "Exit Capture", BTN_W, BTN_H)

    this.exitBtn.onTriggerUp.add(() => {
      this.logger.debug("Exit Capture pressed")
      this.eventBus.emit("exitCapture")
    })
  }
}
