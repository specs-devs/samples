import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {GridLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/GridLayout/GridLayout"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {EventBus} from "../../Shared/EventBus"
import {AppScreen} from "../UIController"
import {addButtonLabel} from "../../Shared/ButtonTextHelper"

export interface SideNavConfig {
  parent: SceneObject
  eventBus: EventBus
  logger: Logger
  activeScreen?: AppScreen
}

interface NavButton {
  screen: AppScreen
  label: string
  obj: SceneObject
  btn: RectangleButton
}

/**
 * Reusable left-side vertical navigation with 3 buttons:
 * Get Started | New Space | My Spaces
 *
 * Uses GridLayout (3 rows x 1 col) with cellSize 10x6 matching reference.
 */
export class SideNavigation {
  private container: SceneObject
  private eventBus: EventBus
  private logger: Logger
  private buttons: NavButton[] = []
  private activeScreen: AppScreen | null = null

  constructor(config: SideNavConfig) {
    this.eventBus = config.eventBus
    this.logger = config.logger

    this.container = global.scene.createSceneObject("SideNavigation")
    this.container.setParent(config.parent)

    this.buildButtons()

    if (config.activeScreen) {
      this.setActive(config.activeScreen)
    }
  }

  setActive(screen: AppScreen): void {
    this.activeScreen = screen
    for (const nb of this.buttons) {
      if (nb.screen === screen) {
        ;(nb.btn as any)._style = "PrimaryAccent"
      } else {
        ;(nb.btn as any)._style = "PrimaryNeutral"
      }
    }
  }

  getContainer(): SceneObject {
    return this.container
  }

  destroy(): void {
    this.container.destroy()
  }

  // ── Internal ───────────────────────────────────────────

  private buildButtons(): void {
    const navItems: { screen: AppScreen; label: string }[] = [
      {screen: AppScreen.GetStarted, label: "Get Started"},
      {screen: AppScreen.Capture, label: "New Area"},
      {screen: AppScreen.MyAreas, label: "My Areas"},
    ]

    const CELL_WIDTH = 9
    const CELL_HEIGHT = 5

    const gridObj = global.scene.createSceneObject("SideMenuGrid")
    gridObj.setParent(this.container)

    // Create button children FIRST
    for (let i = 0; i < navItems.length; i++) {
      const item = navItems[i]
      const btnObj = global.scene.createSceneObject(`NavBtn_${item.label.replace(/\s/g, "")}`)
      btnObj.setParent(gridObj)

      const btn = btnObj.createComponent(RectangleButton.getTypeName()) as RectangleButton
      ;(btn as any)._style = "PrimaryNeutral"
      btn.size = new vec3(CELL_WIDTH - 1, CELL_HEIGHT - 1, 1)
      btn.renderOrder = 10
      btn.initialize()

      addButtonLabel(btnObj, item.label, CELL_WIDTH - 1, CELL_HEIGHT - 1)

      btn.onTriggerUp.add(() => {
        this.logger.debug(`Nav button pressed: ${item.label}`)
        this.eventBus.emit("navigate", item.screen)
      })

      this.buttons.push({screen: item.screen, label: item.label, obj: btnObj, btn})
    }

    // Create GridLayout AFTER children
    const grid = gridObj.createComponent(GridLayout.getTypeName()) as GridLayout
    grid.rows = 3
    grid.columns = 1
    grid.cellSize = new vec2(CELL_WIDTH, CELL_HEIGHT)
    grid.initialize()
    grid.layout()

    this.logger.debug(`SideNavigation built with ${this.buttons.length} buttons`)
  }
}
