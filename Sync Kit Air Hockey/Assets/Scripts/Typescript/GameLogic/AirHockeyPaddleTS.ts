/**
 * Specs Inc. 2026
 * Line-constrained paddle with network-synced position and per-frame velocity for the Air Hockey lens.
 */
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {StorageProperty} from "SpectaclesSyncKit.lspkg/Core/StorageProperty"
import {SyncEntity} from "SpectaclesSyncKit.lspkg/Core/SyncEntity"
import {InteractableManipulation} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"

@component
export class AirHockeyPaddle extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AirHockeyPaddle – Line-constrained networked paddle</span><br/><span style="color: #94A3B8; font-size: 11px;">Projects the grabbed handle onto a line segment; syncs position via StorageProperty.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("The visible paddle object (mesh + physics collider) that slides on the line")
  visual: SceneObject

  @input
  @hint("Start point of the movement line")
  lineStart: SceneObject

  @input
  @hint("End point of the movement line")
  lineEnd: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private handleTransform: Transform
  private visualTransform: Transform

  syncEntity: SyncEntity

  visualVelocity: vec3 = vec3.zero()
  private lastVisualPos: vec3 = vec3.zero()

  private projectOntoLine(point: vec3): number {
    const a = this.lineStart.getTransform().getWorldPosition()
    const b = this.lineEnd.getTransform().getWorldPosition()
    const ab = b.sub(a)
    const abLenSq = ab.dot(ab)
    if (abLenSq < 0.0001) return 0
    return Math.max(0, Math.min(1, point.sub(a).dot(ab) / abLenSq))
  }

  private positionFromT(t: number): vec3 {
    const a = this.lineStart.getTransform().getWorldPosition()
    const b = this.lineEnd.getTransform().getWorldPosition()
    return a.add(b.sub(a).uniformScale(t))
  }

  private getT(): number {
    return this.projectOntoLine(this.visualTransform.getWorldPosition())
  }

  private setT(t: number): void {
    this.visualTransform.setWorldPosition(this.positionFromT(t))
  }

  getXPosition(): number {
    return this.visualTransform.getWorldPosition().x
  }

  getXVelocity(): number {
    return this.visualVelocity.x
  }

  @bindStartEvent
  private initialize(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    const manipulation = this.getSceneObject().getComponent(
      InteractableManipulation.getTypeName()
    ) as InteractableManipulation
    if (manipulation?.onManipulationEnd) {
      manipulation.onManipulationEnd.add(() => {
        this.handleTransform.setWorldPosition(this.visualTransform.getWorldPosition())
      })
    }
  }

  @bindUpdateEvent
  private onUpdate(): void {
    if (!this.syncEntity?.isSetupFinished) return

    const dt = getDeltaTime()

    if (this.syncEntity.doIOwnStore()) {
      const handlePos = this.handleTransform.getWorldPosition()
      const t = this.projectOntoLine(handlePos)
      const targetPos = this.positionFromT(t)

      if (dt > 0) {
        const currentPos = this.visualTransform.getWorldPosition()
        this.visualVelocity = targetPos.sub(currentPos).uniformScale(1 / dt)
      }

      this.visualTransform.setWorldPosition(targetPos)
    } else {
      if (dt > 0) {
        const currentPos = this.visualTransform.getWorldPosition()
        this.visualVelocity = currentPos.sub(this.lastVisualPos).uniformScale(1 / dt)
      }
    }

    this.lastVisualPos = this.visualTransform.getWorldPosition()
  }

  onAwake(): void {
    this.logger = new Logger("AirHockeyPaddle", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.handleTransform = this.getTransform()
    this.visualTransform = this.visual.getTransform()

    const body: BodyComponent = this.visual.getComponent("Physics.BodyComponent")
    if (body) body.dynamic = false

    const initialT = this.projectOntoLine(this.visualTransform.getWorldPosition())
    this.setT(initialT)
    this.lastVisualPos = this.visualTransform.getWorldPosition()

    this.syncEntity = new SyncEntity(this)
    this.syncEntity.addStorageProperty(
      StorageProperty.autoFloat(
        "paddleT",
        () => this.getT(),
        (t: number) => this.setT(t)
      )
    )

    this.logger.debug("Paddle initialized")
  }
}
