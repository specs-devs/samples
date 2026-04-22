import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {GridLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/GridLayout/GridLayout"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {EventBus} from "../../Shared/EventBus"
import {addButtonLabel} from "../../Shared/ButtonTextHelper"

const INSTRUCTION_TEXT =
  "Click on the top row button to create widgets. Position them freely or letting them snap on the closest surface. Use the Recall widgets to visualize them all in front of you. "

const WIDGET_TYPE_MAP: Record<string, string> = {
  "Note Widgets": "note",
  "Watch Widgets": "watch",
  "Photo Widgets": "photo",
}

/**
 * Screen 5: In-Area (Widget Selection Panel)
 * Layout: Instruction text (top) + two 1x3 button grids (matching reference AreaPlayground)
 * Row 1: Note / Watch / Weather widget spawn buttons
 * Row 2: Minimize / Snap to Surface / Exit Area
 */
export class InAreaScreen {
  private container: SceneObject
  private eventBus: EventBus
  private logger: Logger
  private buttons: RectangleButton[] = []
  private recallTextComp: Text | null = null
  private recallActive: boolean = false
  private snapTextComp: Text | null = null
  private snapActive: boolean = false
  private localizationStatusComp: Text | null = null

  constructor(parent: SceneObject, eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus
    this.logger = logger

    this.container = global.scene.createSceneObject("InAreaScreen")
    this.container.setParent(parent)

    this.buildLocalizationStatus()
    this.buildInstructionText()
    this.buildTopRow()
    this.buildBottomRow()

    this.logger.debug("InAreaScreen built")
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

  /** Called by AppController after recall toggle to update button label */
  setRecallActive(active: boolean): void {
    this.recallActive = active
    if (this.recallTextComp) {
      this.recallTextComp.text = active ? "Release" : "Minimize"
    }
  }

  setSnapActive(active: boolean): void {
    this.snapActive = active
    if (this.snapTextComp) {
      this.snapTextComp.text = active ? "Surface Snap Active" : "Surface Snap Inactive"
    }
  }

  setLocalizationStatus(text: string): void {
    if (this.localizationStatusComp) {
      this.localizationStatusComp.text = text
    }
  }

  // ── Internal ───────────────────────────────────────────

  private buildLocalizationStatus(): void {
    const textObj = global.scene.createSceneObject("LocalizationStatus")
    textObj.setParent(this.container)
    this.localizationStatusComp = textObj.createComponent("Component.Text") as Text
    this.localizationStatusComp.text = "Searching for area..."
    this.localizationStatusComp.size = 32
    this.localizationStatusComp.worldSpaceRect = Rect.create(-15, 15, -1, 1)
    this.localizationStatusComp.horizontalOverflow = HorizontalOverflow.Wrap
    this.localizationStatusComp.verticalOverflow = VerticalOverflow.Overflow
    this.localizationStatusComp.horizontalAlignment = HorizontalAlignment.Center
    this.localizationStatusComp.verticalAlignment = VerticalAlignment.Center
    this.localizationStatusComp.textFill.mode = TextFillMode.Solid
    this.localizationStatusComp.textFill.color = new vec4(1, 0.85, 0.4, 1)
    this.localizationStatusComp.renderOrder = 10
    textObj.getTransform().setLocalPosition(new vec3(0, 14, 2))
  }

  private buildInstructionText(): void {
    const textObj = global.scene.createSceneObject("InAreaInstructions")
    textObj.setParent(this.container)
    const textComp = textObj.createComponent("Component.Text") as Text
    textComp.text = INSTRUCTION_TEXT
    textComp.size = 40
    textComp.worldSpaceRect = Rect.create(-15, 15, -2.25, 2.25)
    textComp.horizontalOverflow = HorizontalOverflow.Wrap
    textComp.verticalOverflow = VerticalOverflow.Overflow
    textComp.horizontalAlignment = HorizontalAlignment.Left
    textComp.verticalAlignment = VerticalAlignment.Center
    textComp.textFill.mode = TextFillMode.Solid
    textComp.textFill.color = new vec4(1, 1, 1, 1)
    textComp.renderOrder = 10

    // Matching reference: y=11.15, z=2
    textObj.getTransform().setLocalPosition(new vec3(0, 11.15, 2))
  }

  private buildTopRow(): void {
    const topButtons = [
      {label: "Note Widgets", event: "spawnWidget"},
      {label: "Watch Widgets", event: "spawnWidget"},
      {label: "Photo Widgets", event: "spawnWidget"},
    ]
    // Widget spawn buttons — increased cell size for spacing
    this.buildGridRow("TopGrid", topButtons, new vec3(0, 2.47, 2), new vec2(10.5, 7))
  }

  private buildBottomRow(): void {
    const bottomButtons = [
      {label: "Minimize", event: "recallWidgets"},
      {label: "Surface Snap Inactive", event: "toggleSnapToSurface"},
      {label: "Exit Area", event: "exitArea"},
    ]
    // Action buttons — increased cell size for spacing
    this.buildGridRow("BottomGrid", bottomButtons, new vec3(0, -8.46, 2), new vec2(10.5, 7))
  }

  private buildGridRow(
    name: string,
    items: {label: string; event: string}[],
    position: vec3,
    cellSize: vec2
  ): void {
    const gridObj = global.scene.createSceneObject(name)
    gridObj.setParent(this.container)
    gridObj.getTransform().setLocalPosition(position)

    // Create button children FIRST
    for (let i = 0; i < items.length; i++) {
      const config = items[i]
      const btnObj = global.scene.createSceneObject(`Btn_${config.label.replace(/\s/g, "")}`)
      btnObj.setParent(gridObj)

      const btn = btnObj.createComponent(RectangleButton.getTypeName()) as RectangleButton
      ;(btn as any)._style = "PrimaryNeutral"
      const btnW = cellSize.x - 1
      const btnH = cellSize.y - 1
      btn.size = new vec3(btnW, btnH, 1)
      btn.renderOrder = 10
      btn.initialize()
      const textComp = addButtonLabel(btnObj, config.label, btnW, btnH)

      // Track the Minimize/Release button text
      if (config.label === "Minimize") {
        this.recallTextComp = textComp
      }

      if (config.label === "Surface Snap Inactive") {
        this.snapTextComp = textComp
      }

      const buttonConfig = config
      btn.onTriggerUp.add(() => {
        this.logger.debug(`InArea button pressed: ${buttonConfig.label}`)
        const widgetType = WIDGET_TYPE_MAP[buttonConfig.label]
        if (widgetType) {
          this.eventBus.emit(buttonConfig.event, {type: widgetType})
        } else {
          this.eventBus.emit(buttonConfig.event)
        }
      })

      this.buttons.push(btn)
    }

    // Create GridLayout AFTER children
    const grid = gridObj.createComponent(GridLayout.getTypeName()) as GridLayout
    grid.rows = 1
    grid.columns = 3
    grid.cellSize = cellSize
    grid.initialize()
    grid.layout()
  }
}
