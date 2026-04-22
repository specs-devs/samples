/**
 * Specs Inc. 2026
 * UI component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Conversions} from "./Conversions"
import {LoopController} from "./LoopController"

@component
export class UI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">UI – manages all in-lens UI panels</span><br/><span style="color: #94A3B8; font-size: 11px;">Controls visibility of home, tutorial, path creation, and session UI.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Camera</span>')
  @input
  @hint("Camera scene object used as the follow anchor for UI panels")
  camObj: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">UI Panels</span>')
  @input
  @hint("Root scene object for the home screen UI panel")
  homeUI: SceneObject

  @input
  @hint("Root scene object shown during active path creation")
  duringPathCreationUI: SceneObject

  @input
  @hint("Root scene object instructing the player to walk to the start line")
  goToStartUI: SceneObject

  @input
  @hint("Text component inside the go-to-start panel displaying distance to start")
  goToStartUiDistance: Text

  @input
  @hint("Root scene object for the end-session panel shown while walking")
  endSessionUI: SceneObject

  @input
  @hint("Prefab instantiated to create the loop lock UI controller")
  pfbLoopUi: ObjectPrefab

  @input
  @hint("Background plate scene object shown behind the active UI panel")
  backplateSo: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Tutorial</span>')
  @input
  @hint("Root scene object for the safety warning shown before the tutorial")
  warningTutorialUI: SceneObject

  @input
  @hint("Root scene object for the main tutorial instructional panel")
  tutorialUI: SceneObject

  @input
  @hint("AnimationPlayer driving the tutorial clip transitions")
  tutorialAnimationPlayer: AnimationPlayer

  @input
  @hint("Text component displaying the current tutorial instruction")
  tutorialText: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  get createPathClicked() {
    return this.createPathClickedEvent.publicApi()
  }

  get resetPathClicked() {
    return this.resetPathClickedEvent.publicApi()
  }

  get finishPathClicked() {
    return this.finishPathClickedEvent.publicApi()
  }

  get loopPathClicked() {
    return this.loopPathClickedEvent.publicApi()
  }

  get tutorialComplete() {
    return this.tutorialCompleteEvent.publicApi()
  }

  get endSessionClicked() {
    return this.endSessionClickedEvent.publicApi()
  }

  private createPathClickedEvent: Event = new Event()
  private resetPathClickedEvent: Event = new Event()
  private finishPathClickedEvent: Event = new Event()
  private loopPathClickedEvent: Event = new Event()
  private tutorialCompleteEvent: Event = new Event()
  private endSessionClickedEvent: Event = new Event()

  private warningTr = null
  private tutorialTr = null
  private homeTr = null
  private duringPathCreationUiTr: Transform = null
  private goToStartUiTr: Transform = null
  private endSessionUiTr: Transform = null
  private currentActiveTr: Transform = null

  private tutorialStepCount: number = 0
  private loopUiController: LoopController | undefined
  private logger: Logger;

  onAwake() {
    this.logger = new Logger("UI", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    this.warningTr = this.warningTutorialUI.getTransform()
    this.tutorialTr = this.tutorialUI.getTransform()
    this.homeTr = this.homeUI.getTransform()
    this.duringPathCreationUiTr = this.duringPathCreationUI.getTransform()
    this.goToStartUiTr = this.goToStartUI.getTransform()
    this.endSessionUiTr = this.endSessionUI.getTransform()

    this.hide(this.tutorialTr)
    this.hide(this.homeTr)
    this.hide(this.duringPathCreationUiTr)
    this.hide(this.goToStartUiTr)
    this.hide(this.endSessionUiTr)
  }

  showHomeUi() {
    this.tryHideCurrentActive()
    this.currentActiveTr = this.homeTr
    this.show(this.currentActiveTr)
  }

  showTutorialUi() {
    this.tryHideCurrentActive()
    this.tutorialStepCount = 0
    this.currentActiveTr = this.warningTr
    this.show(this.currentActiveTr)
  }

  showDuringPathCreationUi() {
    this.tryHideCurrentActive()
    this.currentActiveTr = this.duringPathCreationUiTr
    this.show(this.currentActiveTr)
  }

  showEndSessionUi() {
    this.tryHideCurrentActive()
    this.currentActiveTr = this.endSessionUiTr
    this.show(this.currentActiveTr)
  }

  showGoToStartUi(distance: number) {
    this.tryHideCurrentActive()
    const pathDistFt = Conversions.cmToFeet(distance)
    this.goToStartUiDistance.text = pathDistFt.toFixed(1) + "'"
    this.currentActiveTr = this.goToStartUiTr
    this.show(this.currentActiveTr)
  }

  initLoopUi(startTr: Transform) {
    if (!this.loopUiController) {
      this.loopUiController = this.pfbLoopUi.instantiate(null).getComponent("ScriptComponent") as LoopController
    }
    this.loopUiController.start(startTr)
  }

  showLoopUi() {
    this.loopUiController.show()
  }

  hideLoopUi() {
    this.loopUiController.hide()
  }

  hideUi() {
    this.tryHideCurrentActive()
    this.currentActiveTr = null
  }

  onProgressTutorial() {
    if (this.tutorialStepCount === 0) {
      this.tryHideCurrentActive()
      this.currentActiveTr = this.tutorialTr
      this.show(this.currentActiveTr)
    } else if (this.tutorialStepCount === 1) {
      this.tutorialAnimationPlayer.setClipEnabled("Sprint_Layer", false)
      this.tutorialAnimationPlayer.setClipEnabled("Loop_Layer", true)
      this.tutorialText.text = "MAKE A LOOP"
    } else if (this.tutorialStepCount === 2) {
      this.hide(this.tutorialTr)
      this.tutorialCompleteEvent.invoke()
    }
    this.tutorialStepCount += 1
  }

  onCreatePathButton() {
    this.hide(this.homeTr)
    this.createPathClickedEvent.invoke()
  }

  onFinishCreatePathButton() {
    this.hide(this.duringPathCreationUiTr)

    if (this.loopUiController.getIsInLoopZone()) {
      this.loopUiController.onLock()
      this.loopPathClickedEvent.invoke()
    } else {
      this.finishPathClickedEvent.invoke()
    }
  }

  onResetCreatePathButton() {
    this.hide(this.duringPathCreationUiTr)
    this.resetPathClickedEvent.invoke()
  }

  onStopWalkingButton() {
    this.hide(this.endSessionUiTr)
    this.endSessionClickedEvent.invoke()
  }

  private hide(tr: Transform) {
    const localPos = tr.getLocalPosition()
    localPos.y = 10000
    tr.setLocalPosition(localPos)
    this.backplateSo.enabled = false
  }

  private show(tr: Transform) {
    const localPos = tr.getLocalPosition()
    localPos.y = -5
    tr.setLocalPosition(localPos)
    this.backplateSo.enabled = true
  }

  private tryHideCurrentActive() {
    if (this.currentActiveTr) {
      this.hide(this.currentActiveTr)
    }
  }
}
