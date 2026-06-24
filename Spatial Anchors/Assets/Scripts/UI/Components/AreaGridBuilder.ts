import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {GridLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/GridLayout/GridLayout"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {EventBus} from "../../Shared/EventBus"
import {addButtonLabel} from "../../Shared/ButtonTextHelper"

export interface AreaGridConfig {
  parent: SceneObject
  eventBus: EventBus
  logger: Logger
  columns?: number
  maxSlots?: number
  cellSize?: vec2
}

export interface AreaInfo {
  index: number
  name: string
  occupied: boolean
}

const DEFAULT_COLUMNS = 3
const DEFAULT_MAX_SLOTS = 9
const DEFAULT_CELL_SIZE = new vec2(10.5, 6)

/**
 * Builds a grid of area buttons for the My Areas screen.
 * Starts with a single "New Area" button and adds more as areas are created.
 * Occupied areas show with accent style; the last slot is always "New Area".
 * Emits "areaSelected" with AreaInfo on tap.
 */
export class AreaGridBuilder {
  private container: SceneObject
  private eventBus: EventBus
  private logger: Logger
  private columns: number
  private maxSlots: number
  private cellSize: vec2
  private buttonObjs: SceneObject[] = []
  private buttons: RectangleButton[] = []
  private textComps: Text[] = []
  private areaData: AreaInfo[] = []
  private selectedIndex: number = -1

  constructor(config: AreaGridConfig) {
    this.eventBus = config.eventBus
    this.logger = config.logger
    this.columns = config.columns ?? DEFAULT_COLUMNS
    this.maxSlots = config.maxSlots ?? DEFAULT_MAX_SLOTS
    this.cellSize = config.cellSize ?? DEFAULT_CELL_SIZE

    this.container = global.scene.createSceneObject("AreaGrid")
    this.container.setParent(config.parent)

    // Build full grid upfront (like old SpaceGridBuilder)
    this.buildGrid()
  }

  /** Update grid to reflect current areas. Occupied slots show area name; remaining hidden except one "New Area". */
  updateAreas(areas: AreaInfo[]): void {
    this.areaData = areas
    const occupiedCount = areas.filter((a) => a.occupied).length

    for (let i = 0; i < this.maxSlots; i++) {
      const btnObj = this.buttonObjs[i]
      const btn = this.buttons[i]
      const textComp = this.textComps[i]
      if (!btnObj || !btn || !textComp) continue

      if (i < occupiedCount) {
        // Occupied area slot
        const area = areas[i]
        btnObj.enabled = true
        ;(btn as any)._style = "PrimaryAccent"
        textComp.text = area.name
      } else if (i === occupiedCount) {
        // "New Area" slot — always visible
        btnObj.enabled = true
        ;(btn as any)._style = "PrimaryNeutral"
        textComp.text = "New Area"
      } else {
        // Extra empty slots — hide them
        btnObj.enabled = false
      }
    }

    this.logger.debug(`AreaGrid updated: ${occupiedCount} areas + New Area button`)
  }

  setSelected(index: number): void {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.buttons.length) {
      ;(this.buttons[this.selectedIndex] as any)._style = "PrimaryNeutral"
    }
    this.selectedIndex = index
    if (index >= 0 && index < this.buttons.length) {
      ;(this.buttons[index] as any)._style = "PrimaryAccent"
    }
  }

  getContainer(): SceneObject {
    return this.container
  }

  destroy(): void {
    this.container.destroy()
  }

  // ── Internal ───────────────────────────────────────────

  private buildGrid(): void {
    const gridObj = global.scene.createSceneObject("AreaGridLayout")
    gridObj.setParent(this.container)

    const rows = Math.ceil(this.maxSlots / this.columns)

    // Create all button children first
    for (let i = 0; i < this.maxSlots; i++) {
      const btnObj = global.scene.createSceneObject(`Area_${i}`)
      btnObj.setParent(gridObj)

      const btn = btnObj.createComponent(RectangleButton.getTypeName()) as RectangleButton
      ;(btn as any)._style = "PrimaryNeutral"
      const btnW = this.cellSize.x - 1
      const btnH = this.cellSize.y - 1
      btn.size = new vec3(btnW, btnH, 1)
      btn.renderOrder = 10
      btn.initialize()

      const textComp = addButtonLabel(btnObj, `Area ${i + 1}`, btnW, btnH)

      const slotIndex = i
      btn.onTriggerUp.add(() => {
        const occupiedCount = this.areaData.filter((a) => a.occupied).length
        if (slotIndex < occupiedCount) {
          // Tap on existing area
          this.logger.debug(`Area button pressed: ${this.areaData[slotIndex].name}`)
          this.eventBus.emit("areaSelected", this.areaData[slotIndex])
        } else {
          // Tap on "New Area"
          this.logger.debug("New Area button pressed")
          this.eventBus.emit("areaSelected", {
            index: slotIndex,
            name: "New Area",
            occupied: false,
          } as AreaInfo)
        }
      })

      // Start hidden — updateAreas will show the right ones
      btnObj.enabled = false

      this.buttonObjs.push(btnObj)
      this.buttons.push(btn)
      this.textComps.push(textComp)
    }

    // Create and initialize GridLayout AFTER children are added
    const grid = gridObj.createComponent(GridLayout.getTypeName()) as GridLayout
    grid.rows = rows
    grid.columns = this.columns
    grid.cellSize = this.cellSize
    grid.initialize()
    grid.layout()

    this.logger.debug(`AreaGrid built: ${this.columns}x${rows} (${this.maxSlots} slots)`)
  }
}
