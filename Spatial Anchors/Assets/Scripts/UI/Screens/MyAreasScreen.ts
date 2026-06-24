import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {EventBus} from "../../Shared/EventBus"
import {AppScreen} from "../UIController"
import {SideNavigation} from "../Components/SideNavigation"
import {AreaGridBuilder, AreaInfo} from "../Components/AreaGridBuilder"
import {addButtonLabel} from "../../Shared/ButtonTextHelper"

/**
 * Screen 4: My Areas (Areas Grid)
 * Layout: SideNavigation (left) + dynamic area grid (right)
 */
export class MyAreasScreen {
  private container: SceneObject
  private sideNav: SideNavigation
  private areaGrid: AreaGridBuilder
  private eventBus: EventBus
  private logger: Logger

  constructor(parent: SceneObject, eventBus: EventBus, logger: Logger) {
    this.eventBus = eventBus
    this.logger = logger

    this.container = global.scene.createSceneObject("MyAreasScreen")
    this.container.setParent(parent)

    // Side navigation — left area (matching reference)
    this.sideNav = new SideNavigation({
      parent: this.container,
      eventBus,
      logger,
      activeScreen: AppScreen.MyAreas,
    })
    this.sideNav.getContainer().getTransform().setLocalPosition(new vec3(-13.34, 0, 2))

    // Area grid — right area (dynamic, fills based on created areas)
    this.areaGrid = new AreaGridBuilder({
      parent: this.container,
      eventBus,
      logger,
      columns: 3,
      cellSize: new vec2(9, 5),
    })
    this.areaGrid.getContainer().getTransform().setLocalPosition(new vec3(5, 0, 2))

    // "Delete All Areas" button below the grid
    this.buildDeleteAllButton()

    this.logger.debug("MyAreasScreen built")
  }

  show(): void {
    this.container.enabled = true
    this.sideNav.setActive(AppScreen.MyAreas)
  }

  hide(): void {
    this.container.enabled = false
  }

  updateAreas(areas: AreaInfo[]): void {
    this.areaGrid.updateAreas(areas)
  }

  setSelectedArea(index: number): void {
    this.areaGrid.setSelected(index)
  }

  private buildDeleteAllButton(): void {
    const btnObj = global.scene.createSceneObject("Btn_DeleteAllAreas")
    btnObj.setParent(this.container)
    btnObj.getTransform().setLocalPosition(new vec3(5, -9, 2))

    const btn = btnObj.createComponent(RectangleButton.getTypeName()) as RectangleButton
    ;(btn as any)._style = "PrimaryNeutral"
    btn.size = new vec3(12, 4, 1)
    btn.renderOrder = 10
    btn.initialize()
    addButtonLabel(btnObj, "Delete All Areas", 12, 4)

    btn.onTriggerUp.add(() => {
      this.logger.debug("Delete All Areas pressed")
      this.eventBus.emit("deleteAllAreas")
    })
  }

  destroy(): void {
    this.container.destroy()
  }

  getContainer(): SceneObject {
    return this.container
  }
}
