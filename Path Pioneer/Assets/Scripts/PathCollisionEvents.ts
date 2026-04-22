/**
 * Specs Inc. 2026
 * Path Collision Events component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import {PathWalker} from "./PathWalker"

@component
export class PathCollisionEvents extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private msg: string

  private col: ColliderComponent
  private tr: Transform

  private pathWalker: PathWalker

  private camTr: Transform
  private camCol: ColliderComponent

  private enterPoint: vec3 = null

  onAwake(): void {
    this.logger = new Logger("PathCollisionEvents", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  init(myMsg: string, myCamTr: Transform, myCamCol: ColliderComponent, myPathWalker: PathWalker) {
    this.msg = myMsg
    this.camTr = myCamTr
    this.camCol = myCamCol
    this.pathWalker = myPathWalker

    this.tr = this.sceneObject.getTransform()
    this.col = this.sceneObject.getChild(0).getComponent("ColliderComponent")
    this.col.onCollisionEnter.add((e: CollisionEnterEventArgs) => this.onCollisionEnter(e))
    this.col.onCollisionExit.add((e: CollisionExitEventArgs) => this.onCollisionExit(e))
  }

  public onCollisionEnter(e: CollisionEnterEventArgs) {
    if (e.collision.collider.isSame(this.camCol)) {
      this.enterPoint = this.camTr.getWorldPosition()
    }
  }

  public onCollisionExit(e: CollisionExitEventArgs) {
    if (e.collision.collider.isSame(this.camCol)) {
      const exitPoint = this.camTr.getWorldPosition()
      let dir: vec3 = null

      if (!isNull(this.enterPoint)) {
        dir = exitPoint.sub(this.enterPoint)
        dir = dir.normalize()
        const dot = this.tr.forward.dot(dir)
        if (this.msg.includes("start")) {
          this.pathWalker.onStartCollisionExit(dot)
        } else if (this.msg.includes("finish")) {
          this.pathWalker.onFinishCollisionExit(dot)
        }
        // Reset
        this.enterPoint = null
      } else {
        this.logger.warn("cam fwd used for collision")
      }
    }
  }
}
