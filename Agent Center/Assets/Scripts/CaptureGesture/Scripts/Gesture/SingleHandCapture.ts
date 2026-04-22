import {BaseHandCapture} from "./BaseHandCapture";
import {computeCornersFromSingleHand, computePoseFromCorners} from "../Core/GestureRectUtils";
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand";

@component
export class SingleHandCapture extends BaseHandCapture {
  private isLeftCapture = false;

  private camComp: Camera = null;

  private rightPinchStartPos = vec3.zero();
  private rightPinchStartTime = 0;
  private leftPinchStartPos = vec3.zero();
  private leftPinchStartTime = 0;

  onAwake() {
    super.onAwake();
  }

  public onStart() {
    this.rightHand.onPinchUp.add(this.rightPinchUp);
    this.rightHand.onPinchDown.add(this.rightPinchDown);
    this.leftHand.onPinchUp.add(this.leftPinchUp);
    this.leftHand.onPinchDown.add(this.leftPinchDown);

    // Call super.onStart() last so onInitialized is fired after our initialization
    super.onStart();
    this.camComp = this.camTrans.getSceneObject().getComponent("Camera");
  }

  private leftPinchDown = () => {
    if (!isNull(this.leftHandInteractor.currentInteractable)) {
      return;
    }
    this.leftDown = true;
    // Only start if not already active and no right hand
    if (this.interactionController && !this.gestureActive) {
      this.resetUIHiddenState();
      this.leftPinchStartPos = this.leftHand.thumbTip.position;
      this.leftPinchStartTime = getTime();
      this.startTracking();
    }
  };

  private leftPinchUp = () => {
    this.leftDown = false;
    // Only trigger gesture completion if we were actively tracking and this was the active hand
    if (this.gestureActive && this.isLeftCapture) {
      this.stopTracking();
      super.stopGesture();
    }
  };

  private rightPinchDown = () => {
    if (!isNull(this.rightHandInteractor.currentInteractable)) {
      return;
    }
    this.rightDown = true;
    // Request permission to start single hand gesture
    if (this.interactionController && !this.gestureActive) {
      this.resetUIHiddenState();
      this.rightPinchStartPos = this.rightHand.thumbTip.position;
      this.rightPinchStartTime = getTime();
      this.startTracking();
    }
  };

  private rightPinchUp = () => {
    this.rightDown = false;
    if (this.gestureActive && !this.isLeftCapture) {
      this.stopTracking();
      super.stopGesture();
    }
  };

  startGesture() {
    super.startGesture();
  }

  protected onUpdate() {
    super.onUpdate();

    if (this.interactionController.isDoubleHandGestureActive()) {
      return;
    }

    if (!this.gestureActive) {
      //if gesture not active, run gesture detection
      if (this.leftDown) this.checkForSingleHandCapture(this.leftHand);
      if (this.rightDown) this.checkForSingleHandCapture(this.rightHand);
      return;
    }

    // define start and current pinch points
    let pinchStart = this.isLeftCapture ? this.leftPinchStartPos : this.rightPinchStartPos;
    const pinchCurrent = this.isLeftCapture ? this.leftHand.thumbTip.position : this.rightHand.thumbTip.position;

    //make pinchStart distance from camera same as pinchCurrent distance from camera, this way we can move it in and out with one hand
    const currentPinchDistanceToCamera = this.camTrans.getWorldPosition().sub(pinchCurrent).distance(vec3.zero());
    const startScreenPos = this.camComp.worldSpaceToScreenSpace(pinchStart);
    const currScreenPos = this.camComp.worldSpaceToScreenSpace(pinchCurrent);
    pinchStart = this.camComp.screenSpaceToWorldSpace(startScreenPos, currentPinchDistanceToCamera);

    //if went wrong direction (pinch hand will be in capture) exit early
    var isValidDirection =
      (this.isLeftCapture && startScreenPos.x > currScreenPos.x) ||
      (!this.isLeftCapture && startScreenPos.x < currScreenPos.x);

    if (!isValidDirection) {
      return;
    }

    // Compute rectangle corners and pose via shared utils
    const corners = computeCornersFromSingleHand(pinchStart, pinchCurrent, this.camTrans, this.isLeftCapture);

    // Apply corners via CornerController to own and set transforms centrally
    if (this.cornerController) {
      this.cornerController.applyCorners(corners);
    }

    // Notify of gesture update
    if (this.interactionController) {
      this.interactionController.triggerGestureUpdated();
    }

    // Compute pose and emit for UI
    const pose = computePoseFromCorners(corners);
    if (this.interactionController) {
      this.interactionController.triggerGesturePoseUpdated(pose.center, pose.rotation, pose.scale);
    }
  }

  checkForSingleHandCapture(hand: TrackedHand) {
    var isLefthand = hand.handType != "right";
    var currPinchPos = isLefthand ? this.leftHand.thumbTip.position : this.rightHand.thumbTip.position;
    var pinchStartPos = isLefthand ? this.leftPinchStartPos : this.rightPinchStartPos;
    var didPinchDragEnough = currPinchPos.distance(pinchStartPos) > 4;
    var isPinchStartInFOV = this.camComp.isSphereVisible(pinchStartPos, 5);
    if (!didPinchDragEnough || !isPinchStartInFOV) {
      return;
    }
    // make sure pinch angle is correct, for right pinch must be diagonally down to the right 0-90 degrees
    var startScreenPos = this.camComp.worldSpaceToScreenSpace(pinchStartPos);
    var pinchScreenPos = this.camComp.worldSpaceToScreenSpace(currPinchPos);
    var dragAngle = pinchScreenPos.sub(startScreenPos);
    var angleDeg = Math.atan2(dragAngle.y, dragAngle.x) * MathUtils.RadToDeg;
    //print("ANGLE: " + angleDeg);

    //check if right hand in angle range, drag up or down
    if (isLefthand) {
      var isAngleInsideRange = (angleDeg > 100 && angleDeg < 170) || (angleDeg < -100 && angleDeg > -170);
      if (!isAngleInsideRange) {
        this.leftDown = false;
      }
    } else {
      var isAngleInsideRange = (angleDeg > 10 && angleDeg < 80) || (angleDeg < -10 && angleDeg > -80);
      if (!isAngleInsideRange) {
        this.rightDown = false;
      }
    }

    //check time since last pinch
    var pinchStartTime = isLefthand ? this.leftPinchStartTime : this.rightPinchStartTime;
    var timeSincePinchStart = getTime() - pinchStartTime;

    var isWithinTimeRange = timeSincePinchStart < 1 && timeSincePinchStart > 0.1;
    if (!isWithinTimeRange) {
      isLefthand ? (this.leftDown = false) : (this.rightDown = false);
      return;
    }

    if (isAngleInsideRange) {
      this.isLeftCapture = isLefthand;
      this.startGesture();
    }
  }
}
