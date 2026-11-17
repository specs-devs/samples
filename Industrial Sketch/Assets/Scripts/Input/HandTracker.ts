/**
 * SPECS Inc. 2027
 * Per-frame hand state for sketching tools: pinch point, orientation, pinch edges and UI blocking.
 *
 * On device both hands come from Interaction Kit hand tracking. In the Lens Studio Preview (no tracked hands)
 * the mouse drives the dominant hand at a fixed depth so every tool can be tried without a device.
 */
import {Interactor, InteractorInputType} from "InteractionKit.lspkg/Core/Interactor/Interactor"
import {IK} from "InteractionKit.lspkg/IK"
import TrackedHand from "InteractionKit.lspkg/Providers/HandInputData/TrackedHand"

export interface HandState {
  /** "right" / "left" for tracked hands. */
  readonly side: "right" | "left"
  tracked: boolean
  /** Driven by the mouse in the editor rather than a tracked hand. */
  simulated: boolean
  pinching: boolean
  /** Pinch started this frame. */
  pinchDown: boolean
  /** Pinch ended this frame. */
  pinchUp: boolean
  /** True when the pinch started while the hand was targeting UI (so tools must ignore it). */
  pinchOnUI: boolean
  /** The hand's interactor is currently hovering or pressing an interactable. */
  targetingUI: boolean
  /** World-space pinch point (between thumb and index tips). */
  position: vec3
  /** World-space hand orientation: forward = along the fingers, up = back of the hand. */
  rotation: quat
  /** World-space lateral axis of the hand (index knuckle to pinky knuckle). */
  lateral: vec3
  /** World-space palm normal (pointing out of the palm). */
  palmNormal: vec3
  /** Palm is turned towards the user's head. */
  palmFacingCamera: boolean
  /** World-space palm center. */
  palmCenter: vec3
}

function emptyState(side: "right" | "left"): HandState {
  return {
    side,
    tracked: false,
    simulated: false,
    pinching: false,
    pinchDown: false,
    pinchUp: false,
    pinchOnUI: false,
    targetingUI: false,
    position: vec3.zero(),
    rotation: quat.quatIdentity(),
    lateral: vec3.right(),
    palmNormal: vec3.forward(),
    palmFacingCamera: false,
    palmCenter: vec3.zero()
  }
}

export class HandTracker {
  readonly right: HandState = emptyState("right")
  readonly left: HandState = emptyState("left")

  /** Distance from the camera at which the mouse cursor draws in the editor (cm). */
  mouseDepth = 60

  private dominantSide: "right" | "left" = "right"
  private readonly isEditor: boolean
  private camera: Transform

  constructor(cameraTransform: Transform) {
    this.camera = cameraTransform
    this.isEditor = global.deviceInfoSystem.isEditor()
  }

  setDominant(side: "right" | "left"): void {
    this.dominantSide = side
  }

  get dominant(): HandState {
    return this.dominantSide === "right" ? this.right : this.left
  }

  get nonDominant(): HandState {
    return this.dominantSide === "right" ? this.left : this.right
  }

  update(): void {
    // Pinch edges are computed against last frame's final state (hand or mouse).
    const wasRight = this.right.pinching
    const wasLeft = this.left.pinching
    this.updateHand(this.right, "right", wasRight)
    this.updateHand(this.left, "left", wasLeft)
    if (this.isEditor && !this.right.tracked && !this.left.tracked) {
      const dominant = this.dominant
      this.updateMouse(dominant, dominant === this.right ? wasRight : wasLeft)
    }
  }

  private updateHand(state: HandState, side: "right" | "left", wasPinching: boolean): void {
    let hand: TrackedHand | null = null
    try {
      hand = IK.HandInputData.getHand(side)
    } catch {
      hand = null
    }
    state.simulated = false
    state.tracked = !!hand && hand.isTracked()
    if (!hand || !state.tracked) {
      state.pinching = false
      state.pinchDown = false
      state.pinchUp = wasPinching
      state.targetingUI = false
      state.palmFacingCamera = false
      return
    }
    const thumb = hand.thumbTip.position
    const index = hand.indexTip.position
    state.position = thumb.add(index).uniformScale(0.5)

    const wrist = hand.wrist.position
    const indexKnuckle = hand.indexKnuckle.position
    const pinkyKnuckle = hand.pinkyKnuckle.position
    const middleKnuckle = hand.middleKnuckle.position
    const forward = middleKnuckle.sub(wrist).normalize()
    let lateral = pinkyKnuckle.sub(indexKnuckle)
    lateral = lateral.length > 1e-4 ? lateral.normalize() : vec3.right()
    // Palm normal: for the right hand forward x lateral points out of the palm; mirrored for the left hand.
    let palm = side === "right" ? forward.cross(lateral) : lateral.cross(forward)
    palm = palm.length > 1e-4 ? palm.normalize() : vec3.forward()
    state.lateral = lateral
    state.palmNormal = palm
    state.rotation = quat.lookAt(forward, palm.uniformScale(-1))
    const center = hand.getPalmCenter()
    state.palmCenter = center ?? wrist.add(middleKnuckle).uniformScale(0.5)
    const toCamera = this.camera.getWorldPosition().sub(state.palmCenter).normalize()
    state.palmFacingCamera = palm.dot(toCamera) > 0.45

    const interactor = this.interactorFor(
      side === "right" ? InteractorInputType.RightHand : InteractorInputType.LeftHand
    )
    state.targetingUI = !!interactor && interactor.currentInteractable !== null

    state.pinching = hand.isPinching()
    state.pinchDown = state.pinching && !wasPinching
    state.pinchUp = !state.pinching && wasPinching
    if (state.pinchDown) {
      state.pinchOnUI = state.targetingUI
    } else if (!state.pinching) {
      state.pinchOnUI = false
    }
  }

  private updateMouse(state: HandState, wasPinching: boolean): void {
    const interactor = this.interactorFor(InteractorInputType.Mouse)
    if (!interactor || !interactor.startPoint || !interactor.direction) {
      return
    }
    state.tracked = true
    state.simulated = true
    state.position = interactor.startPoint.add(interactor.direction.uniformScale(this.mouseDepth))
    const camRot = this.camera.getWorldRotation()
    state.rotation = camRot
    state.lateral = this.camera.right
    state.palmNormal = this.camera.forward
    state.palmCenter = state.position
    state.palmFacingCamera = false
    state.targetingUI = interactor.currentInteractable !== null
    state.pinching = interactor.isTriggering
    state.pinchDown = state.pinching && !wasPinching
    state.pinchUp = !state.pinching && wasPinching
    if (state.pinchDown) {
      state.pinchOnUI = state.targetingUI
    } else if (!state.pinching) {
      state.pinchOnUI = false
    }
  }

  private interactorFor(type: InteractorInputType): Interactor | null {
    try {
      const list = IK.InteractionManager.getInteractorsByType(type)
      return list && list.length > 0 ? list[0] : null
    } catch {
      return null
    }
  }
}
