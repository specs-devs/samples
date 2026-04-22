/**
 * Specs Inc. 2026
 * Lens Initializer component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import {SprintPathData} from "./BuiltPathData"
import {PathMaker} from "./PathMaker"
import {PathWalker} from "./PathWalker"
import {TutorialController} from "./TutorialController"
import {UI} from "./UI"

@component
export class LensInitializer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LensInitializer – bootstraps the lens session</span><br/><span style="color: #94A3B8; font-size: 11px;">Caches camera height and orchestrates path making and walking.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("UI controller managing all in-lens UI panels")
  ui: UI

  @input
  @hint("TutorialController that plays the onboarding tutorial sequence")
  tutorialController: TutorialController

  @input
  @hint("PathMaker component that handles path creation state machine")
  pathMaker: PathMaker

  @input
  @hint("PathWalker component that handles the path walking experience")
  pathWalker: PathWalker

  @input
  @hint("Camera scene object used to compute the player ground offset")
  camSo: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private camTr: Transform
  private floorOffsetFromCamera = -100
  private static instance: LensInitializer
  private floorIsSet: boolean = false
  private vec3up: vec3 = vec3.up()

  private constructor() {
    super()
  }

  public static getInstance(): LensInitializer {
    if (!LensInitializer.instance) {
      throw new Error("Trying to get LensInitializer instance, but it hasn't been set.  You need to call it later.")
    }
    return LensInitializer.instance
  }

  onAwake() {
    this.logger = new Logger("LensInitializer", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    if (!LensInitializer.instance) {
      LensInitializer.instance = this
    } else {
      throw new Error("LensInitializer already has an instance but another one is initializing. Aborting.")
    }

    this.camTr = this.camSo.getTransform()

    this.pathMaker.init()
    this.pathWalker.init()

    this.ui.getSceneObject().enabled = true

    this.tutorialController.startTutorial(() => {
      this.startHomeState()
    })
  }

  setFloorOffsetFromCamera(floorPos: vec3) {
    // Get the difference between current cam height and this Y value
    // Meaning, we take the camera's height at floor set to be the player's "height" for this path
    const camPos = this.camTr.getWorldPosition()
    const offset = floorPos.sub(camPos)
    // Because player is looking down when height is taken,
    // offset is closer than it will be (when player is looking out)
    this.floorOffsetFromCamera = offset.y - 10
    this.floorIsSet = true
  }

  getPlayerGroundPos() {
    if (!this.floorIsSet) {
      throw Error("Floor not set. You need to call it later.")
    }
    return this.camTr.getWorldPosition().add(this.vec3up.uniformScale(this.floorOffsetFromCamera))
  }

  private startHomeState() {
    this.ui.showHomeUi()
    const pathClickedRemover = this.ui.createPathClicked.add(() => {
      pathClickedRemover()
      this.pathMaker.start()
      const remover = this.pathMaker.pathMade.add((data) => {
        remover()
        if (!data.isLoop) {
          const dataSprint = data as SprintPathData
          this.pathWalker.start(
            dataSprint.splinePoints,
            dataSprint.isLoop,
            dataSprint.startObject.getTransform(),
            dataSprint.finishObject.getTransform(),
            () => {
              this.startHomeState()
            }
          )
        } else {
          this.pathWalker.start(data.splinePoints, data.isLoop, data.startObject.getTransform(), undefined, () => {
            this.startHomeState()
          })
        }
      })
    })
  }
}
