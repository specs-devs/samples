import { CameraService } from "../../../Utils/CameraService";
import { CropRegion } from "../Core/CropRegion";
import { DoubleHandCapture } from "../Gesture/DoubleHandCapture";
import { SingleHandCapture } from "../Gesture/SingleHandCapture";
import { CornerController } from "./CornerController";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

const BOX_MIN_SIZE = 8; // min size in cm for image capture (matches gesture classes)

/**
 * Gesture pose data interface for type safety
 */
interface GesturePoseData {
  position: vec3;
  rotation: quat;
  scale: vec2;
}

/**
 * Handles all user interactions including gestures,
 * crop region management, and capture validation.
 *
 * Responsibilities:
 * - Managing crop region state
 * - Validating capture area dimensions
 * - Coordinating gesture events
 * - Providing geometry calculations for capture area
 */
@component
export class InteractionController extends BaseScriptComponent {
  // #region Dependencies
  private cropRegion: CropRegion | null = null;
  private camTrans: Transform | null = null;
  private cornerController: CornerController | null = null;

  // #endregion

  // #region Corner Transforms (sourced from CornerController)
  private topLeftTrans: Transform | null = null;
  private topRightTrans: Transform | null = null;
  private bottomLeftTrans: Transform | null = null;
  private bottomRightTrans: Transform | null = null;

  // #endregion

  // #endregion

  // #region Events - Action Events
  public readonly onCaptureTriggered = new Event();
  public readonly onResetTriggered = new Event();
  public readonly onCloseTriggered = new Event();
  public readonly onInitialized = new Event();

  // #endregion

  // #region Events - Gesture Events
  public readonly onGestureStarted = new Event();
  public readonly onGestureUpdated = new Event();
  public readonly onGesturePoseUpdated = new Event<GesturePoseData>();
  public readonly onGestureCompleted = new Event();
  public readonly onGestureCanceled = new Event();

  // #endregion

  // #region Initialization

  /**
   * Initializes the controller with required dependencies
   * @param cropRegion The crop region component to manage
   * @param cornerController The CornerController that owns corner transforms
   */
  public initialize(
    cropRegion: CropRegion,
    cornerController: CornerController,
  ): void {
    // Validate inputs
    if (!cropRegion || !cornerController) {
      throw new Error(
        "InteractionController: cropRegion and cornerController are required for initialization",
      );
    }

    // Store dependencies
    this.cropRegion = cropRegion;
    this.cornerController = cornerController;

    // Cache transforms for performance
    this.cacheTransforms();

    // No caching needed; dimensions are computed on demand
  }

  /**
   * Completes initialization with camera transform
   * @param camTrans The camera transform for world-to-local calculations
   */
  public onStart(camTrans: Transform): void {
    if (!camTrans) {
      throw new Error("InteractionController: Camera transform is required");
    }

    this.camTrans = camTrans;
    this.onInitialized.invoke();
  }

  // #endregion

  // #region Gesture ownership and coordination

  public mode: string = "both";

  private singleHandGesture: SingleHandCapture | null = null;
  private doubleHandGesture: DoubleHandCapture | null = null;

  public setTransforms(picAnchorTrans: Transform) {
    // Forward transforms down to gesture scripts as needed
    // Currently, gestures only need picAnchor for UI scaling
    if (this.singleHandGesture) {
      this.singleHandGesture.setTransforms(picAnchorTrans);
    }
    if (this.doubleHandGesture) {
      this.doubleHandGesture.setTransforms(picAnchorTrans);
    }
  }

  public createGestureHandlers(cornerController: CornerController) {
    // Create gesture handlers based on mode
    if (this.mode === "single" || this.mode === "both") {
      this.singleHandGesture = this.getSceneObject().createComponent(
        SingleHandCapture.getTypeName(),
      );
      this.singleHandGesture.setControllers(this);
      this.singleHandGesture.setCornerController(cornerController);
    }

    if (this.mode === "double" || this.mode === "both") {
      this.doubleHandGesture = this.getSceneObject().createComponent(
        DoubleHandCapture.getTypeName(),
      );
      this.doubleHandGesture.setControllers(this);
      this.doubleHandGesture.setCornerController(cornerController);
    }
  }

  public isDoubleHandGestureActive(): boolean {
    return this.doubleHandGesture && this.doubleHandGesture.isGestureActive();
  }

  public isSingleHandGestureActive(): boolean {
    return this.singleHandGesture && this.singleHandGesture.isGestureActive();
  }

  /**
   * Caches transform references for performance optimization
   * @private
   */
  private cacheTransforms(): void {
    if (!this.cornerController) {
      return;
    }

    const transforms = this.cornerController.getTransforms();
    this.topLeftTrans = transforms.topLeft;
    this.topRightTrans = transforms.topRight;
    this.bottomLeftTrans = transforms.bottomLeft;
    this.bottomRightTrans = transforms.bottomRight;
  }

  // #endregion

  // #region Crop Region Management

  /**
   * Validates if the current capture area meets minimum size requirements
   * @returns True if the capture area is valid for capture
   */
  public validateCaptureArea(): boolean {
    if (!this.topLeftTrans || !this.bottomRightTrans) {
      return false;
    }

    const topLeftWorldPos = this.topLeftTrans.getWorldPosition();
    const bottomRightWorldPos = this.bottomRightTrans.getWorldPosition();

    const localTL = this.localTopLeft(topLeftWorldPos);
    const localBR = this.localBottomRight(bottomRightWorldPos);

    const width = Math.abs(localBR.x - localTL.x);
    const height = Math.abs(localBR.y - localTL.y);

    return width >= BOX_MIN_SIZE && height >= BOX_MIN_SIZE;
  }

  /**
   * Resets the controller to its initial state
   */
  public reset(): void {
    // Start with UI hidden by default - only show during active gesturing
    // Note: UI-specific resets are handled by UIController through events
  }

  // #endregion

  // #region Event Management

  /**
   * Enables button interactions (handled through event system)
   */
  public enableButtons(): void {
    // Button interactions are managed through the event system
    // Controllers listening to this can enable their UI elements
  }

  /**
   * Triggers a capture action
   */
  public triggerCapture(): void {
    this.onCaptureTriggered.invoke();
  }

  /**
   * Triggers a reset action
   */
  public triggerReset(): void {
    this.onResetTriggered.invoke();
  }

  /**
   * Triggers a close action
   */
  public triggerClose(): void {
    this.onCloseTriggered.invoke();
  }

  /**
   * Triggers gesture started event
   */
  public triggerGestureStarted(): void {
    this.onGestureStarted.invoke();
  }

  /**
   * Triggers gesture updated event
   */
  public triggerGestureUpdated(): void {
    this.onGestureUpdated.invoke();
  }

  /**
   * Triggers gesture pose updated event with pose data
   * @param position Current gesture position
   * @param rotation Current gesture rotation
   * @param scale Current gesture scale
   */
  public triggerGesturePoseUpdated(
    position: vec3,
    rotation: quat,
    scale: vec2,
  ): void {
    this.onGesturePoseUpdated.invoke({ position, rotation, scale });
  }

  /**
   * Triggers gesture completed event
   */
  public triggerGestureCompleted(): void {
    this.onGestureCompleted.invoke();
  }

  /**
   * Triggers gesture canceled event
   */
  public triggerGestureCanceled(): void {
    this.onGestureCanceled.invoke();
  }

  // #endregion

  // #region Geometry Calculations

  /**
   * Calculates capture area dimensions with caching to avoid redundant computation
   * @param topLeftWorldPos Top-left corner world position
   * @param bottomRightWorldPos Bottom-right corner world position
   * @returns Object containing width and height
   * @private
   */
  /**
   * Converts world position to local camera space (top-left)
   */
  private localTopLeft(topLeftWorldPos: vec3): vec3 {
    if (!this.camTrans) {
      throw new Error("Camera transform not initialized");
    }
    return this.camTrans
      .getInvertedWorldTransform()
      .multiplyPoint(topLeftWorldPos);
  }

  /**
   * Converts world position to local camera space (bottom-right)
   */
  private localBottomRight(bottomRightWorldPos: vec3): vec3 {
    if (!this.camTrans) {
      throw new Error("Camera transform not initialized");
    }
    return this.camTrans
      .getInvertedWorldTransform()
      .multiplyPoint(bottomRightWorldPos);
  }
}
