/**
 * Specs Inc. 2026
 * Path Walker component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import {ArrowsSpawner} from "./ArrowsSpawner"
import {Conversions} from "./Conversions"
import {CatmullRomSpline} from "./Helpers/CatmullRomSpline"
import {LinearAlgebra} from "./Helpers/LinearAlgebra"
import {LensInitializer} from "./LensInitializer"
import {LineController} from "./LineController"
import {PathBuilder} from "./PathBuilder"
import {PlayerPaceCalculator} from "./PlayerPaceCalculator"
import {ProgressBarController} from "./ProgressBarController"
import {SoundController} from "./SoundController"
import {Timer} from "./Timer"
import {UI} from "./UI"
import {WarningController} from "./WarningController"

enum PathWalkerState {
  None,
  GoToStart,
  Walking
}

@component
export class PathWalker extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PathWalker – runs the walking experience</span><br/><span style="color: #94A3B8; font-size: 11px;">Tracks player pace, laps, and progress along the built path.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Camera scene object providing the player world position each frame")
  cam: SceneObject

  @input
  @hint("Screen-space HUD shown while actively walking the path")
  walkPathScreenHUD: SceneObject

  @input
  @hint("Text component displaying the average walking pace")
  averagePaceText: Text

  @input
  @hint("Text component displaying the current lap count")
  lapCountText: Text

  @input
  @hint("Timer script tracking per-lap and session elapsed time")
  timerScript: Timer

  @input
  @hint("UI controller used to show session and navigation panels")
  uiScript: UI

  @input
  @hint("ProgressBarController showing how far along the path the player is")
  progressBarController: ProgressBarController

  @input
  @hint("ArrowsSpawner managing the directional arrow objects along the path")
  arrowSpawner: ArrowsSpawner

  @input
  @hint("PlayerPaceCalculator providing pace stats during walking")
  playerPaceCalulator: PlayerPaceCalculator

  @input
  @hint("WarningController toggled when the player exceeds the speed threshold")
  warningController: WarningController

  @input
  @hint("RenderMeshVisual displaying the built path mesh on the ground")
  protected pathRmv: RenderMeshVisual

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  // State data
  private state: number = 0
  private isOutsideSprint: boolean = false
  public lapCount: number = -1
  private totalTimeWalking: number = 0
  private totalDistWalked: number = 0
  private onWalkingFinished: (() => void) | undefined = undefined

  // Path data
  private splinePoints: {position: vec3; rotation: quat}[] = []
  private pathPoints: vec3[] = null
  private isLoop: boolean = false
  private pathIsForwards: boolean = true
  private startLineController: LineController = null
  private finishLineController: LineController = null
  private pathLength: number = 0

  // Ui Related data
  private isUiShown: boolean = false
  private currentState = PathWalkerState.None
  private isWarningShown: boolean = false

  onAwake(): void {
    this.logger = new Logger("PathWalker", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  public init() {
    this.uiScript.endSessionClicked.add(() => {
      this.stop()
      if (this.onWalkingFinished) {
        this.onWalkingFinished()
      }
    })
    this.resetState()
  }

  @bindUpdateEvent
  private onUpdate() {
    if (getDeltaTime() < 1 / 6000) {
      // we're in a capture loop
      return
    }

    switch (this.state) {
      case 0: // inactive
        break
      case 1: // prep
        break
      case 2: {
        // walking
        const stats = this.playerPaceCalulator.getPace(LensInitializer.getInstance().getPlayerGroundPos())

        // Implement warning at 15mph.
        const paceMph = Conversions.cmPerSecToMPH(stats.pace)
        const threshold = 15
        if (this.isWarningShown && paceMph < threshold) {
          this.isWarningShown = false
          this.warningController.toggleWaring(this.isWarningShown)
        } else if (!this.isWarningShown && paceMph > threshold) {
          this.isWarningShown = true
          this.warningController.toggleWaring(this.isWarningShown)
        }

        if (stats.pace > 13) {
          this.ensureUiHidden()
        } else {
          this.ensureUiShown()
        }

        if (!this.isOutsideSprint) {
          const t = this.getSplinePos().t
          this.updateProgressBar(t)

          this.setPlayerStats(stats)
        }
        break
      }
      case 3: // finished
        break
      default:
        break
    }
  }

  private getSplinePos() {
    return CatmullRomSpline.worldToSplineSpace(LensInitializer.getInstance().getPlayerGroundPos(), this.splinePoints)
  }

  private updateProgressBar(t: number) {
    const addjustedT = this.pathIsForwards ? t : 1 - t
    this.progressBarController.setProgress(addjustedT)
  }

  private setPlayerStats(stats: {nPos: vec3; pace: number; dist: number; dt: number}) {
    // calculate and update total average pace text
    this.totalDistWalked += stats.dist
    this.totalTimeWalking += stats.dt
    if (this.totalTimeWalking > 0) {
      const averagePaceMPH = Conversions.cmPerSecToMPH(this.totalDistWalked / this.totalTimeWalking)
      this.averagePaceText.text = averagePaceMPH.toFixed(1)
    }
  }

  public onStartCollisionExit(dot: number) {
    if (dot > 0) {
      // We are in the direction of the start line
      if (this.state === 1) {
        // prep
        // We passed start for the first time
        this.playerPaceCalulator.start(LensInitializer.getInstance().getPlayerGroundPos())
        this.walkPathScreenHUD.enabled = true
        this.updateProgressBar(0)
        this.lapCount = 0
        this.currentState = PathWalkerState.Walking
        this.updateUi()
        this.timerScript.start()
        this.state = 2

        SoundController.getInstance().playSound("startWalkPath")

        this.arrowSpawner.start(this.pathPoints.concat([]).reverse(), this.splinePoints, this.pathLength)

        // We show the lap we will complete once we walk through
        if (this.isLoop) {
          this.startLineController.onIncrementLoop(this.lapCount + 1)
        } else {
          this.startLineController.onStartSprint()
          this.finishLineController.onStartSprint()
        }
      } else if (this.state === 2) {
        // walking
        if (this.isLoop) {
          // We are making a lap in the loop
          this.incrementLap()
        } else {
          // We are re-entering sprint
          SoundController.getInstance().playSound("onStartLap")
          this.isOutsideSprint = false
        }
        this.timerScript.start()
      }
    } else {
      // We are going in reverse direction of the start line
      if (this.state === 2) {
        // walking
        if (this.isLoop) {
          // There is no use case for this
        } else {
          // We are finishing reverse sprint
          this.timerScript.pause()
          this.isOutsideSprint = true
          this.incrementLap()
          this.reverseSprintTrackVisuals("start")
        }
      }
    }
  }

  public onFinishCollisionExit(dot: number) {
    if (dot > 0) {
      if (this.state === 2) {
        // We are finishing sprint
        this.timerScript.pause()
        this.isOutsideSprint = true
        this.incrementLap()
        this.reverseSprintTrackVisuals("finish")
      }
    } else {
      if (this.state === 2) {
        // We are re-entering reverse sprint
        SoundController.getInstance().playSound("onStartLap")
        this.isOutsideSprint = false
        this.timerScript.start()
      }
    }
  }

  private incrementLap() {
    SoundController.getInstance().playSound("onCompleteLap")
    this.timerScript.incrementLap()
    this.lapCount++
    this.lapCountText.text = this.lapCount.toString()
    if (this.isLoop) {
      this.startLineController.onIncrementLoop(this.lapCount + 1)
    }
  }

  onSprintStartAreaCollision(reverseTrack: boolean) {
    if (!this.isLoop) {
      this.startLineController.onSprintStartAreaCollision()
      this.finishLineController.onSprintStartAreaCollision()

      if (reverseTrack) {
        this.reverseSprintTrack()
      }
    }
  }

  private reverseSprintTrack() {
    // Fully switch positions of start and end
    const startPos = this.startLineController.getTransform().getWorldPosition()
    const startRot = this.startLineController.getTransform().getWorldRotation()
    const flippedStartRot = LinearAlgebra.flippedRot(startRot, this.startLineController.getTransform().up)

    const finishPos = this.finishLineController.getTransform().getWorldPosition()
    const finishRot = this.finishLineController.getTransform().getWorldRotation()
    const flippedFinishRot = LinearAlgebra.flippedRot(finishRot, this.finishLineController.getTransform().up)

    this.startLineController.getTransform().setWorldPosition(finishPos)
    this.startLineController.getTransform().setWorldRotation(flippedFinishRot)
    this.finishLineController.getTransform().setWorldPosition(startPos)
    this.finishLineController.getTransform().setWorldRotation(flippedStartRot)

    // Revese spline
    this.splinePoints = this.splinePoints.reverse()

    // Only reverse relevant visuals
    this.pathPoints = this.pathPoints.reverse()
    this.pathRmv.mesh = PathBuilder.buildFromPoints(this.pathPoints, 60)
    this.arrowSpawner.start(this.pathPoints.concat([]).reverse(), this.splinePoints, this.pathLength)
  }

  private reverseSprintTrackVisuals(str: string) {
    let reverseTrack = false

    if (str.includes("start") && !this.pathIsForwards) {
      this.pathIsForwards = true
      reverseTrack = true
    }
    if (str.includes("finish") && this.pathIsForwards) {
      this.pathIsForwards = false
      reverseTrack = true
    }
    if (reverseTrack) {
      this.pathPoints = this.pathPoints.reverse()
      this.pathRmv.mesh = PathBuilder.buildFromPoints(this.pathPoints, 60)
      this.arrowSpawner.start(this.pathPoints.concat([]).reverse(), this.splinePoints, this.pathLength)
      this.startLineController.onReverseSprintTrackVisuals()
      this.finishLineController.onReverseSprintTrackVisuals()
    }
  }

  private resetState() {
    // State data
    this.state = 0
    this.isOutsideSprint = false
    this.lapCount = -1
    this.totalTimeWalking = 0
    this.totalDistWalked = 0

    // Path data
    this.pathIsForwards = true
    this.splinePoints = []
    this.pathPoints = []
    this.isLoop = false

    // Path visual
    this.pathRmv.enabled = false
    this.arrowSpawner.stop()
    if (this.startLineController) {
      this.startLineController.getSceneObject().destroy()
      this.startLineController = null
    }
    if (this.finishLineController) {
      this.finishLineController.getSceneObject().destroy()
      this.finishLineController = null
    }

    // HUD
    if (this.timerScript.getSceneObject().isEnabledInHierarchy) {
      this.timerScript.stop()
    }
    this.averagePaceText.text = "0"
    this.lapCountText.text = "0"

    this.walkPathScreenHUD.enabled = false

    // UI data
    this.ensureUiHidden()
  }

  public start(
    mySplinePoints: {position: vec3; rotation: quat}[],
    myIsLoop: boolean,
    myStartLineTr: Transform,
    myFinishLineTr: Transform | undefined = undefined,
    onWalkingFinished: (() => void) | undefined = undefined
  ) {
    // state
    this.resetState()
    this.state = 1

    // Set path data from PathMaker
    this.splinePoints = mySplinePoints
    this.pathPoints = mySplinePoints.map((s) => s.position)
    this.pathLength = 0
    for (let i = 1; i < this.pathPoints.length; i++) {
      this.pathLength += this.pathPoints[i].distance(this.pathPoints[i - 1])
    }
    this.isLoop = myIsLoop
    this.pathRmv.mesh = PathBuilder.buildFromPoints(this.pathPoints.reverse(), 60)
    this.pathRmv.enabled = true

    this.startLineController = myStartLineTr.getSceneObject().getComponent(LineController.getTypeName())
    this.startLineController.setEnableWalkCountdown()

    if (!isNull(myFinishLineTr)) {
      this.finishLineController = myFinishLineTr.getSceneObject().getComponent(LineController.getTypeName())
      this.finishLineController.setEnableWalkCountdown()
    }

    this.currentState = PathWalkerState.GoToStart
    this.ensureUiShown()
    this.onWalkingFinished = onWalkingFinished

    this.arrowSpawner.start(this.pathPoints.concat([]).reverse(), this.splinePoints, this.pathLength)
  }

  public stop() {
    SoundController.getInstance().stopAllSounds()
    this.resetState()
  }

  private ensureUiShown() {
    if (this.isUiShown) {
      return
    }
    this.isUiShown = true
    this.showUi()
  }

  private ensureUiHidden() {
    if (!this.isUiShown) {
      return
    }
    this.isUiShown = false
    this.uiScript.hideUi()
  }

  private updateUi() {
    if (!this.isUiShown) {
      return
    }
    this.showUi()
  }

  private showUi() {
    switch (this.currentState) {
      case PathWalkerState.None:
        return
      case PathWalkerState.GoToStart:
        this.uiScript.showGoToStartUi(this.pathLength)
        return
      case PathWalkerState.Walking:
        this.uiScript.showEndSessionUi()
        return
    }
  }
}
