import {SIK} from "SpectaclesInteractionKit.lspkg/SIK";
import {CornerController} from "../Controllers/CornerController";
import {InteractionController} from "../Controllers/InteractionController";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import {HandInteractor} from "SpectaclesInteractionKit.lspkg/Core/HandInteractor/HandInteractor";
import {InteractionManager} from "SpectaclesInteractionKit.lspkg/Core/InteractionManager/InteractionManager";
import {Interactor, InteractorInputType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
// Capture coordination now handled by InteractionController

@component
export class BaseHandCapture extends BaseScriptComponent {
  protected rightHand = SIK.HandInputData.getHand("right");
  protected leftHand = SIK.HandInputData.getHand("left");

  protected leftDown = false;
  protected rightDown = false;

  protected rotMat = new mat3();

  // References to controllers - will be injected by CaptureController
  protected interactionController: InteractionController = null;
  protected cornerController: CornerController = null;

  // Camera and transform references
  protected camTrans: Transform = null;
  protected picAnchorTrans: Transform = null;

  protected updateEvent = null;
  private isEditor = global.deviceInfoSystem.isEditor();
  protected gestureActive = false; // Track if gesture is actively tracking
  protected uiHiddenDueToInvalidGesture = false; // Track if UI was hidden due to invalid direction
  protected gestureFinalized = false; // Prevent duplicate completion/cancel events per gesture

  // Event that fires when the component is fully initialized
  public readonly onInitialized = new Event();

  protected leftHandInteractor: Interactor = null;
  protected rightHandInteractor: Interactor = null;

  protected onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));

    // Create the update event once and keep it disabled initially
    this.updateEvent = this.createEvent("UpdateEvent");
    this.updateEvent.bind(this.onUpdate.bind(this));
    this.updateEvent.enabled = false; // Only enabled when hands are pinching
  }

  // Method to inject controller references and transforms from CaptureController
  public setControllers(interactionController: InteractionController) {
    this.interactionController = interactionController;
  }

  public setCornerController(cornerController: CornerController) {
    this.cornerController = cornerController;
  }

  public setTransforms(picAnchorTrans: Transform) {
    // Keep API compatibility; corners now managed by CornerController
    this.picAnchorTrans = picAnchorTrans;
  }

  public onStart() {
    this.initializeWithCamera();
    //save hand interactors
    const handInteractors = InteractionManager.getInstance().getInteractorsByType(
      InteractorInputType.BothHands
    ) as HandInteractor[];
    for (const handInteractor of handInteractors) {
      if (handInteractor.inputType === InteractorInputType.RightHand) {
        this.rightHandInteractor = handInteractor;
      } else if (handInteractor.inputType === InteractorInputType.LeftHand) {
        this.leftHandInteractor = handInteractor;
      }
    }
  }

  private enableHandInteractors(enable: boolean) {
    if (this.rightHandInteractor) this.rightHandInteractor.enabled = enable;
    if (this.leftHandInteractor) this.leftHandInteractor.enabled = enable;
  }

  private initializeWithCamera() {
    this.camTrans = WorldCameraFinderProvider.getInstance().getTransform();

    // Invoke the initialized event (child classes can override this method and call super.onStart() last)
    this.onInitialized.invoke();
  }

  protected startGesture() {
    this.enableHandInteractors(false);
    if (this.interactionController) {
      // Show UI when valid gesture starts
      this.interactionController.triggerGestureStarted();
    }
    this.gestureActive = true;
    this.gestureFinalized = false;
    if (this.isEditor) {
      this.placeInEditor();
    }
  }

  // Public methods for gesture coordination
  public isGestureActive(): boolean {
    return this.gestureActive;
  }

  public resetUIHiddenState() {
    this.uiHiddenDueToInvalidGesture = false;
  }

  public cancelCurrentGesture() {
    this.enableHandInteractors(true);
    if (this.gestureActive) {
      print(`${this.constructor.name}: Canceling current gesture due to conflict`);
      this.gestureActive = false;
      this.stopTracking();
      // Don't trigger events since this is an internal cancellation
    }
  }

  protected onUpdate() {}

  protected startTracking() {
    // Enable update loop when hands start pinching
    this.updateEvent.enabled = true;
  }

  protected stopTracking() {
    // Disable update loop when no hands are pinching
    this.updateEvent.enabled = false;
  }

  protected stopGesture() {
    this.enableHandInteractors(true);
    print("BaseHandCapture: Gesture stopping - validating capture area size");
    if (this.gestureFinalized) {
      return;
    }
    this.gestureFinalized = true;
    this.gestureActive = false;
    // Aggressively clear hand flags and stop tracking so single-hand can arm cleanly
    this.leftDown = false;
    this.rightDown = false;
    this.stopTracking();

    // Validate capture area size before completing
    if (this.interactionController.validateCaptureArea()) {
      print("BaseHandCapture: Capture area valid - triggering gestureCompleted event");
      this.interactionController.triggerGestureCompleted();
    } else {
      print("BaseHandCapture: Capture area too small - triggering gestureCanceled event");
      this.interactionController.triggerGestureCanceled();
    }
  }

  protected placeInEditor() {
    // In editor mode, we simulate the gesture completion after a delay
    // This should go through the same event system as real gestures
    const delayedEvent = this.createEvent("DelayedCallbackEvent");
    delayedEvent.bind(() => {
      // Simulate gesture completion - this will trigger the event chain
      this.stopGesture();
    });
    delayedEvent.reset(0.5);
  }

  protected cancelGesture() {
    this.enableHandInteractors(true);
    print("BaseHandCapture: Canceling gesture due to invalid direction");
    if (this.gestureFinalized) {
      return;
    }
    this.gestureFinalized = true;
    this.gestureActive = false;
    this.uiHiddenDueToInvalidGesture = true; // Mark UI as hidden due to invalid gesture
    // Clear hand flags and stop tracking to avoid sticky state
    this.leftDown = false;
    this.rightDown = false;
    this.stopTracking();

    // Hide UI and trigger canceled event directly without validation
    if (this.interactionController) {
      this.interactionController.triggerGestureCanceled();
    }
  }

  // Allow subclasses to declare their gesture type without relying on class names
  protected getGestureType(): "single" | "double" {
    return "single";
  }

  protected cancelCapture() {
    this.stopGesture();
  }
}
