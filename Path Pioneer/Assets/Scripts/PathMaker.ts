/**
 * Specs Inc. 2026
 * Path Maker component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {SurfaceDetection} from "../SurfaceDetection/Scripts/SurfaceDetection"
import {PathData} from "./BuiltPathData"
import {LineController} from "./LineController"
import {BuildingPathState} from "./PathMakerStates/BuildingPathState"
import {IdleState} from "./PathMakerStates/IdleState"
import {IPathMakerState} from "./PathMakerStates/IPathMakerState"
import {PlacingFinishState} from "./PathMakerStates/PlacingFinishState"
import {PlacingStartState} from "./PathMakerStates/PlacingStartState"
import {PathmakingPlayerFeedback} from "./PathmakingPlayerFeedback"
import {PlayerPaceCalculator} from "./PlayerPaceCalculator"
import {UI} from "./UI"

@component
export class PathMaker extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PathMaker – orchestrates path creation states</span><br/><span style="color: #94A3B8; font-size: 11px;">Drives state transitions from start placement to path building to finish.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("RenderMeshVisual used to display the dotted path trailing behind the player")
  pathRmv: RenderMeshVisual

  @input
  @hint("Prefab instantiated to perform world-surface ground detection")
  pfbSurfaceDetection: ObjectPrefab

  @input
  @hint("Prefab instantiated for the start and finish line objects")
  pfbLine: ObjectPrefab

  @input
  @allowUndefined
  @hint("Camera scene object used to determine forward direction during path creation")
  camObj: SceneObject

  @input
  @hint("Offset scene object applied in front of the camera for path point placement")
  camObjOffset: SceneObject

  @input
  @hint("Text component showing the path distance while building")
  pathDistText: Text

  @input
  @hint("Text component showing the final path distance once creation is complete")
  finalPathDistText: Text

  @input
  @hint("PlayerPaceCalculator providing pace stats during path making")
  playerPaceCalculator: PlayerPaceCalculator

  @input
  @hint("PathmakingPlayerFeedback showing the preview joint visual ahead of the player")
  pathmakingPlayerFeedback: PathmakingPlayerFeedback

  @input
  @hint("UI controller used to trigger UI state changes during path creation")
  protected readonly ui: UI

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Distance in cm to displace start and finish lines forward from the placement point")
  protected readonly placingStartFinishLinesForwardDisplace: number = 200

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private camTr: Transform = null
  private camOffsetTr: Transform = null
  private currentState: IPathMakerState = new IdleState()

  protected bigMoveDistanceThreshold = 40
  protected hermiteResolution = 12
  protected resampleResoluton = 4

  private surfaceDetection: SurfaceDetection | undefined

  get pathMade(): PublicApi<PathData> {
    return this.pathMadeEvent.publicApi()
  }

  protected pathMadeEvent: Event<PathData> = new Event<PathData>()

  onAwake(): void {
    this.logger = new Logger("PathMaker", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  public init() {
    this.camTr = this.camObj.getTransform()
    this.camOffsetTr = this.camObjOffset.getTransform()
  }

  public start() {
    this.startStartPlacementState()

    this.ui.resetPathClicked.add(() => {
      // reset path
      if (this.surfaceDetection) {
        this.surfaceDetection.reset()
      }
      this.startStartPlacementState()
    })
  }

  private startStartPlacementState() {
    this.currentState.stop()
    if (!this.surfaceDetection) {
      this.surfaceDetection = this.pfbSurfaceDetection
        .instantiate(null)
        .getChild(0)
        .getComponent("ScriptComponent") as SurfaceDetection
    }
    this.currentState = new PlacingStartState(
      this,
      this.surfaceDetection,
      this.pfbLine,
      this.camTr,
      this.placingStartFinishLinesForwardDisplace,
      (startPosition, startRotation, startObject) => {
        this.startBuildingPathState(startPosition, startRotation, startObject)
      }
    )
    this.currentState.start()
  }

  private startBuildingPathState(startPosition: vec3, startRotation: quat, startObject: SceneObject) {
    this.currentState.stop()
    this.currentState = new BuildingPathState(
      this,
      this.camTr,
      this.camOffsetTr,
      this.pathRmv,
      this.pathDistText,
      startPosition,
      startRotation,
      startObject,
      this.ui,
      this.playerPaceCalculator,
      this.pathmakingPlayerFeedback,
      this.bigMoveDistanceThreshold,
      this.hermiteResolution,
      this.resampleResoluton,
      (startPosition, startRotation, startObject, pathPoints, lastVisualPoints) => {
        this.startFinishPlacementState(startObject, startPosition, startRotation, pathPoints, lastVisualPoints)
      },
      (startPosition, startRotation, startObject, splinePoints) => {
        this.finishLoop(startObject, startPosition, startRotation, splinePoints)
      }
    )
    this.currentState.start()
  }

  private startFinishPlacementState(
    startObject: SceneObject,
    startPosition: vec3,
    startRotation: quat,
    pathPoints: vec3[],
    lastVisualPoints: vec3[]
  ) {
    this.currentState.stop()
    this.currentState = new PlacingFinishState(
      startObject,
      this,
      this.surfaceDetection,
      this.pfbLine,
      this.camTr,
      this.placingStartFinishLinesForwardDisplace,
      pathPoints,
      lastVisualPoints,
      this.pathRmv,
      this.bigMoveDistanceThreshold,
      this.hermiteResolution,
      this.resampleResoluton,

      (finishPosition, finishRotation, finishObject, splinePoints: {position: vec3; rotation: quat}[]) => {
        const finishCtrl = finishObject.getComponent(LineController.getTypeName())
        finishCtrl.setRealVisual()
        this.finishSprint(
          startObject,
          startPosition,
          startRotation,
          finishObject,
          finishPosition,
          finishRotation,
          splinePoints
        )
      }
    )
    this.currentState.start()
  }

  protected finishLoop(
    startObject: SceneObject,
    startPosition: vec3,
    startRotation: quat,
    splinePoints: {position: vec3; rotation}[]
  ) {
    this.currentState.stop()
    this.currentState = new IdleState()
    this.currentState.start()
    this.pathMadeEvent.invoke({
      isLoop: true,
      startObject,
      startPosition,
      startRotation,
      splinePoints
    })
  }

  private finishSprint(
    startObject: SceneObject,
    startPosition: vec3,
    startRotation: quat,
    finishObject: SceneObject,
    finishPosition: vec3,
    finishRotation: quat,
    splinePoints: {position: vec3; rotation}[]
  ) {
    this.currentState.stop()
    this.currentState = new IdleState()
    this.currentState.start()
    this.pathMadeEvent.invoke({
      isLoop: false,
      startObject,
      finishObject,
      startPosition,
      startRotation,
      finishPosition,
      finishRotation,
      splinePoints
    })
  }
}
