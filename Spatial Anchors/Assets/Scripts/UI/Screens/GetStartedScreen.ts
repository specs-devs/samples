import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {EventBus} from "../../Shared/EventBus"
import {AppScreen} from "../UIController"
import {SideNavigation} from "../Components/SideNavigation"

const WELCOME_TEXT =
  "Spatial anchor example. You will be able to create new Areas where you can pin information around you. Click on New Area, grab a note and drop it around you. You will be able to see the note at the same place the next time you restart the device or your Lens. Start building your spatial notes!"

/**
 * Screen 1: Get Started
 * Layout: SideNavigation (left) + welcome text content area (right)
 */
export class GetStartedScreen {
  private container: SceneObject
  private sideNav: SideNavigation
  private contentObj: SceneObject
  private logger: Logger

  constructor(parent: SceneObject, eventBus: EventBus, logger: Logger) {
    this.logger = logger

    this.container = global.scene.createSceneObject("GetStartedScreen")
    this.container.setParent(parent)

    // Side navigation — left area (matching reference: x=-13.34, z=2)
    this.sideNav = new SideNavigation({
      parent: this.container,
      eventBus,
      logger,
      activeScreen: AppScreen.GetStarted,
    })
    this.sideNav.getContainer().getTransform().setLocalPosition(new vec3(-13, 0, 2))

    // Content area — right area
    this.buildContent()

    this.logger.debug("GetStartedScreen built")
  }

  show(): void {
    this.container.enabled = true
    this.sideNav.setActive(AppScreen.GetStarted)
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
    this.contentObj = global.scene.createSceneObject("GetStartedContent")
    this.contentObj.setParent(this.container)
    this.contentObj.getTransform().setLocalPosition(new vec3(3, 0, 2))

    const textObj = global.scene.createSceneObject("WelcomeText")
    textObj.setParent(this.contentObj)
    const textComp = textObj.createComponent("Component.Text") as Text
    textComp.text = WELCOME_TEXT
    textComp.size = 40
    textComp.worldSpaceRect = Rect.create(-10, 10, -6, 6)
    textComp.horizontalOverflow = HorizontalOverflow.Wrap
    textComp.verticalOverflow = VerticalOverflow.Overflow
    textComp.horizontalAlignment = HorizontalAlignment.Left
    textComp.verticalAlignment = VerticalAlignment.Top
    textComp.textFill.mode = TextFillMode.Solid
    textComp.textFill.color = new vec4(1, 1, 1, 1)
    textComp.renderOrder = 10
  }
}
