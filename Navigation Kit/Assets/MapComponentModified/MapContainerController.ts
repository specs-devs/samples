import {MapToggledNotification} from "MapComponentModified/Scripts/MapComponent"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {CancelFunction} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {MapComponent} from "./Scripts/MapComponent"
import {makeTween} from "./Scripts/MapUtils"
import {ContainerMover} from "./ContainerMover"
import {TWEEN_DURATION} from "./MapUIController"

const CONTAINER_SIZE_MINI = new vec2(10, 10)
const CONTAINER_SIZE_FULL = new vec2(90.0, 54.0)
const CONTAINER_DISTANCE_MINI = 130
const CONTAINER_DISTANCE_FULL = 160

@component
export class MapContainerController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  private mapComponent: MapComponent
  @input
  private containerMover: ContainerMover
  @input private miniMapWidth = 0.15
  @input private maxMapWidth = 0.5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private containerTransform: Transform
  // ContainerFrame → SpectaclesUIKit Frame (re-add the Frame component in scene).
  private container: Frame
  private cameraTransform: Transform
  private tweenCancelFunction: CancelFunction

  private onAwake() {
    this.logger = new Logger("MapContainerController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.container = this.sceneObject.getComponent(Frame.getTypeName())

    // Frame uses useTagAlong for follow behavior (ContainerFrame.setIsFollowing).
    this.container.useTagAlong = false

    this.cameraTransform = WorldCameraFinderProvider.getInstance().getTransform()
    this.mapComponent.onMiniMapToggled.add(this.handleMiniMapToggled.bind(this))
    // Frame has no parentTransform; use the Frame object's own transform.
    this.containerTransform = this.container.getSceneObject().getTransform()
  }

  private handleMiniMapToggled(toggle: MapToggledNotification) {
    const isMiniMap = toggle.isMini
    const tweenDuration = toggle.happensInstantly ? 0 : TWEEN_DURATION

    if (this.tweenCancelFunction !== undefined) {
      this.tweenCancelFunction()
      this.tweenCancelFunction = undefined
    }

    const containerWorldPosition: vec3 = this.containerTransform.getWorldPosition()

    if (isMiniMap) {
      this.mapComponent.centerMap()
      this.containerMover.windowWidth = this.miniMapWidth

      const targetWorldPosition: vec3 = containerWorldPosition
        .sub(this.cameraPos)
        .normalize()
        .uniformScale(CONTAINER_DISTANCE_MINI)
        .add(this.cameraPos)

      this.tweenCancelFunction = makeTween((t) => {
        this.container.innerSize = vec2.lerp(CONTAINER_SIZE_FULL, CONTAINER_SIZE_MINI, t)

        this.containerTransform.setWorldPosition(vec3.lerp(containerWorldPosition, targetWorldPosition, t))

        if (t > 0.9999) {
          this.container.useTagAlong = true
          this.containerMover.clampPosition()
        }
      }, tweenDuration)
    } else {
      this.container.useTagAlong = false
      this.containerMover.windowWidth = this.maxMapWidth

      const targetWorldPosition: vec3 = containerWorldPosition
        .sub(this.cameraPos)
        .normalize()
        .uniformScale(CONTAINER_DISTANCE_FULL)
        .add(this.cameraPos)

      this.tweenCancelFunction = makeTween((t) => {
        this.container.innerSize = vec2.lerp(CONTAINER_SIZE_MINI, CONTAINER_SIZE_FULL, t)
        this.containerTransform.setWorldPosition(vec3.lerp(containerWorldPosition, targetWorldPosition, t))
      }, TWEEN_DURATION)
    }
  }

  private get cameraPos(): vec3 {
    return this.cameraTransform.getWorldPosition()
  }
}
