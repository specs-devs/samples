import {BaseHandCapture} from "./BaseHandCapture";
import {computeCornersFromTwoHands, computePoseFromCorners} from "../Core/GestureRectUtils";

const GESTURE_START_DISTANCE = 6; //min size in cm between both pinch positions to start gesture

@component
export class DoubleHandCapture extends BaseHandCapture {
  onAwake() {
    super.onAwake();
  }

  protected getGestureType(): "single" | "double" {
    return "double";
  }

  public onStart() {
    this.rightHand.onPinchUp.add(this.rightPinchUp);
    this.rightHand.onPinchDown.add(this.rightPinchDown);
    this.leftHand.onPinchUp.add(this.leftPinchUp);
    this.leftHand.onPinchDown.add(this.leftPinchDown);

    // Call super.onStart() last so onInitialized is fired after our initialization
    super.onStart();
  }

  startGesture() {
    super.startGesture();
    this.startTracking();
  }

  private leftPinchDown = () => {
    if (this.interactionController.isSingleHandGestureActive()) {
      return;
    }
    this.leftDown = true;
    //check for gesture start
    if (this.rightDown && this.isPinchClose()) {
      if (!this.gestureActive && this.interactionController) {
        this.startGesture();
        return;
      }
    }
  };

  private leftPinchUp = () => {
    this.leftDown = false;
    // Complete capture immediately on first hand lift if gesture is active
    if (this.gestureActive && !this.rightDown) {
      this.stopTracking();
      super.stopGesture(); // will no-op if already finalized
    }
  };

  private rightPinchDown = () => {
    if (this.interactionController.isSingleHandGestureActive()) {
      return;
    }
    this.rightDown = true;
    //check for gesture start
    if (this.leftDown && this.isPinchClose()) {
      if (!this.gestureActive && this.interactionController) {
        this.startGesture();
        return;
      }
    }
  };

  private rightPinchUp = () => {
    this.rightDown = false;
    // Complete capture immediately on first hand lift if gesture is active
    if (this.gestureActive && !this.leftDown) {
      this.stopTracking();
      super.stopGesture(); // will no-op if already finalized
    }
  };

  private isPinchClose(): boolean {
    return this.leftHand.thumbTip.position.distance(this.rightHand.thumbTip.position) < GESTURE_START_DISTANCE;
  }

  protected onUpdate() {
    super.onUpdate();
    // Only do position tracking if gesture is active
    if (this.gestureActive) {
      // Compute rectangle corners using shared utils
      const corners = computeCornersFromTwoHands(
        this.leftHand.thumbTip.position,
        this.rightHand.thumbTip.position,
        this.camTrans
      );

      // Apply corners via CornerController to own and set transforms centrally
      if (this.cornerController) {
        this.cornerController.applyCorners(corners);
      }

      // Trigger gesture updated event to notify UI
      if (this.interactionController) {
        this.interactionController.triggerGestureUpdated();
      }

      // Compute pose and emit for UI
      const pose = computePoseFromCorners(corners);
      if (this.interactionController) {
        this.interactionController.triggerGesturePoseUpdated(pose.center, pose.rotation, pose.scale);
      }
    }
  }
}
