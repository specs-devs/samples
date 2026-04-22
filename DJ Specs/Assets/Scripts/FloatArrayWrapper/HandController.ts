/**
 * Specs Inc. 2026
 * Hand Controller for the DJ Specs Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators";
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand";

@component
export class HandController extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">HandController – vinyl scratch hand tracking</span><br/><span style="color: #94A3B8; font-size: 11px;">Tracks hand position relative to vinyl center to derive rotation direction and speed.</span>'
  )
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Center of the vinyl record scene object")
  vinylCenterObject: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  speed: number = 0.0;
  angle: number = 1.0;
  position: vec3 = vec3.zero();
  isTracking: boolean = false;

  private leftHand: TrackedHand;
  private rightHand: TrackedHand;
  private vinylTransform: Transform;
  private prevPosition: vec3 | null = null;
  private prevAngle: number | null = null;
  private handPosition: vec3 = vec3.zero();

  onAwake(): void {
    this.logger = new Logger(
      "HandController",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    );
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    this.leftHand = SIK.HandInputData.getHand("left");
    this.rightHand = SIK.HandInputData.getHand("right");
    this.vinylTransform = this.vinylCenterObject.getTransform();
  }

  @bindUpdateEvent
  onUpdate(): void {
    this.onTouchStartedOrMoved();
  }

  private getRotationDirection(handPos: vec3): number {
    const vinylPosition = this.vinylTransform.getWorldPosition();
    const directionVector = handPos.sub(vinylPosition);
    const upVec = vec3.right();
    const angle = upVec.angleTo(directionVector);
    if (this.prevAngle === null) {
      this.prevAngle = angle;
    }
    let resultAngle = angle - this.prevAngle;
    if (handPos.z > vinylPosition.z) {
      resultAngle = -resultAngle;
    }
    this.prevAngle = angle;
    return resultAngle;
  }

  private getTouchMoveSpeed(handPos: vec3): number {
    if (this.prevPosition === null) {
      this.prevPosition = handPos;
    }
    const speed = handPos.distance(this.prevPosition);
    this.prevPosition = handPos;
    return speed;
  }

  private onTouchStartedOrMoved(): void {
    const vinylPosition = this.vinylTransform.getWorldPosition();

    const leftTracked = this.leftHand.isTracked();
    const rightTracked = this.rightHand.isTracked();

    if (leftTracked && rightTracked) {
      const leftPos = this.leftHand.wrist.position;
      const rightPos = this.rightHand.wrist.position;
      if (rightPos.distance(vinylPosition) <= leftPos.distance(vinylPosition)) {
        this.handPosition = rightPos;
      } else {
        this.handPosition = leftPos;
      }
    } else if (leftTracked) {
      this.handPosition = this.leftHand.wrist.position;
    } else if (rightTracked) {
      this.handPosition = this.rightHand.wrist.position;
    }

    if (
      new vec3(0, this.handPosition.y, 0).distance(new vec3(0, vinylPosition.y, 0)) < 10 &&
      new vec2(this.handPosition.x, this.handPosition.z).distance(
        new vec2(vinylPosition.x, vinylPosition.z)
      ) < 15
    ) {
      this.isTracking = true;
      this.angle = this.getRotationDirection(this.handPosition);
      this.speed = this.getTouchMoveSpeed(this.handPosition) * 0.01;
    } else {
      this.isTracking = false;
      this.prevAngle = null;
      this.prevPosition = null;
    }
  }
}
