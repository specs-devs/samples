/**
 * SPECS Inc. 2027
 * Gesture Manager handling core logic for the Throw Lab lens.
 */
import TrackedHand from "InteractionKit.lspkg/Providers/HandInputData/TrackedHand"
import {IK} from "InteractionKit.lspkg/IK"
import {GrabbableObject} from "./GrabbableObject"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import { SceneObjectUtils } from "Utilities.lspkg/Scripts/Utils/SceneObjectUtils"

/**
 * Manages pinch-to-grab interactions for objects with GrabbableObject components.
 * Uses collider overlap detection on finger tips.
 * Attach this to an empty object in the scene.
 */
@component
export class GestureManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GestureManager – Hand gesture detection and grab management</span><br/><span style="color: #94A3B8; font-size: 11px;">Place one instance in the scene. Assign hand tracking assets and optionally debug prefabs.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Hand Tracking</span>')
  @input
  @hint("Left hand tracking asset")
  leftHandTrackingAsset: HandTracking3DAsset

  @input
  @hint("Right hand tracking asset")
  rightHandTrackingAsset: HandTracking3DAsset

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Detection Settings</span>')
  @input
  @hint("Detection radius around finger tips (in cm)")
  detectionRadius: number = 3

  @input
  @hint("Grab assist (cm): when a pinch or fist doesn't touch an object, the nearest grabbable object whose surface is within this distance of the hand is grabbed. 0 turns it off.")
  grabAssistRadius: number = 6

  @input
  @hint("Minimum pinch strength to maintain grab (0-1)")
  minPinchStrength: number = 0.3

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Debug Visuals</span>')
  @input
  @hint("Optional: Prefab for debug spheres on left hand (index and thumb) - control visibility via mesh renderer in prefab")
  debugLeftHandPrefab: ObjectPrefab

  @input
  @hint("Optional: Prefab for debug spheres on right hand (index and thumb) - control visibility via mesh renderer in prefab")
  debugRightHandPrefab: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private gestureModule = require("LensStudio:GestureModule") as GestureModule

  private leftHandGrabbedObject: GrabbableObject | null = null
  private rightHandGrabbedObject: GrabbableObject | null = null

  private leftPinchActive: boolean = false
  private rightPinchActive: boolean = false

  private leftGrabActive: boolean = false
  private rightGrabActive: boolean = false

  private leftHand: TrackedHand | null = null
  private rightHand: TrackedHand | null = null

  private leftIndexTipCollider: SceneObject | null = null
  private rightIndexTipCollider: SceneObject | null = null
  private leftThumbTipCollider: SceneObject | null = null
  private rightThumbTipCollider: SceneObject | null = null

  private leftHandOverlappingObjects: Set<GrabbableObject> = new Set()
  private rightHandOverlappingObjects: Set<GrabbableObject> = new Set()

  private leftIndexDebugSphere: SceneObject | null = null
  private leftThumbDebugSphere: SceneObject | null = null
  private rightIndexDebugSphere: SceneObject | null = null
  private rightThumbDebugSphere: SceneObject | null = null

  // Editor-only mouse/tap fallback (no hand tracking in the Preview panel)
  private isEditorMode: boolean = false
  private editorCamera: Camera | null = null
  private editorProbe: Probe | null = null
  private mouseGrabbedObject: GrabbableObject | null = null
  private mouseScreenPos: vec2 = vec2.zero()
  // Captured at grab time so dragging moves the object in its view-plane and a
  // still cursor leaves it exactly where it was grabbed.
  private grabDepth: number = 60
  private grabObjPos: vec3 = vec3.zero()
  private grabCursorWorld: vec3 = vec3.zero()

  onAwake() {
    this.logger = new Logger("GestureManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.setupHandTracking()
    this.createFingerTipColliders()

    this.setupGestureEvents(GestureModule.HandType.Left)
    this.setupGestureEvents(GestureModule.HandType.Right)

    const diagnosticEvent = this.createEvent("DelayedCallbackEvent")
    diagnosticEvent.bind(() => {
      this.diagnosticCheckGrabbableObjects()
    })
    diagnosticEvent.reset(2.0)

    this.isEditorMode = global.deviceInfoSystem.isEditor()
    if (this.isEditorMode) {
      this.setupEditorMouseInput()
    }
  }

  /**
   * In the Lens Studio Preview there is no hand tracking, so the pinch/grab
   * gesture pipeline above never fires. This sets up a mouse/tap fallback that
   * drives the SAME GrabbableObject.onGrab/onRelease path via a synthetic
   * "hand" whose index tip follows the cursor projected into the world.
   */
  private setupEditorMouseInput() {
    this.editorCamera = this.findCamera()
    if (!this.editorCamera) {
      this.logger.warn("Editor mouse input: no Camera found in scene, mouse grabbing disabled")
      return
    }

    this.editorProbe = Physics.createGlobalProbe()

    const touchStart = this.createEvent("TouchStartEvent")
    touchStart.bind((args: TouchStartEvent) => this.onEditorTouchStart(args))

    const touchMove = this.createEvent("TouchMoveEvent")
    touchMove.bind((args: TouchMoveEvent) => {
      this.mouseScreenPos = args.getTouchPosition()
    })

    const touchEnd = this.createEvent("TouchEndEvent")
    touchEnd.bind(() => this.onEditorTouchEnd())

    this.logger.info("Editor mouse input ready: click/drag a tool to grab and throw it")
  }

  private findCamera(): Camera | null {
    let found: Camera | null = null
    const rootCount = global.scene.getRootObjectsCount()
    for (let i = 0; i < rootCount && !found; i++) {
      SceneObjectUtils.forEachSceneObjectInSubHierarchy(global.scene.getRootObject(i), (obj) => {
        if (found) return
        const cam = obj.getComponent("Component.Camera") as Camera
        if (cam) found = cam
      })
    }
    return found
  }

  private onEditorTouchStart(args: TouchStartEvent) {
    this.mouseScreenPos = args.getTouchPosition()

    if (!this.editorCamera || !this.editorProbe || this.mouseGrabbedObject) {
      return
    }

    const camPos = this.editorCamera.getSceneObject().getTransform().getWorldPosition()
    const near = this.editorCamera.screenSpaceToWorldSpace(this.mouseScreenPos, 5)
    const far = this.editorCamera.screenSpaceToWorldSpace(this.mouseScreenPos, 500)

    // Forgiving pick: sphere-sweep the camera ray, take the nearest grabbable.
    const hits = this.editorProbe.sphereCastAllSync(2.5, near, far)
    for (let i = 0; i < hits.length; i++) {
      const sceneObj = hits[i].collider.getSceneObject()
      const grabbable = this.findGrabbableObjectComponent(sceneObj)
      if (grabbable && !grabbable.isCurrentlyGrabbed()) {
        this.grabObjPos = sceneObj.getTransform().getWorldPosition()
        // Euclidean camera distance - always positive, so the object never gets
        // slammed up against the camera. Used as the view-plane depth for drags.
        this.grabDepth = this.grabObjPos.distance(camPos)
        this.grabCursorWorld = this.editorCamera.screenSpaceToWorldSpace(this.mouseScreenPos, this.grabDepth)

        // Grab in place - the object does not move until the cursor is dragged.
        grabbable.editorGrab()
        this.mouseGrabbedObject = grabbable
        this.logger.info(`Editor mouse grabbed: ${sceneObj.name}`)
        break
      }
    }
  }

  private onEditorTouchEnd() {
    if (this.mouseGrabbedObject) {
      this.mouseGrabbedObject.editorRelease()
      this.logger.info("Editor mouse released - thrown")
    }
    this.mouseGrabbedObject = null
  }

  /**
   * While grabbing in the editor, move the object within its view-plane by the
   * cursor's displacement since grab. A still cursor means zero displacement, so
   * the object stays exactly where it was grabbed (mimics an on-device pinch).
   */
  private updateEditorDrag() {
    if (!this.mouseGrabbedObject || !this.editorCamera) {
      return
    }
    const cursorWorld = this.editorCamera.screenSpaceToWorldSpace(this.mouseScreenPos, this.grabDepth)
    const delta = cursorWorld.sub(this.grabCursorWorld)
    this.mouseGrabbedObject.editorMove(this.grabObjPos.add(delta))
  }

  /**
   * Diagnostic function to check all objects with GrabbableObject components
   */
  private diagnosticCheckGrabbableObjects() {
    this.logger.header("GestureManager Diagnostic Check")

    const allObjects = global.scene.getRootObjectsCount()
    let grabbableCount = 0

    for (let i = 0; i < allObjects; i++) {
      const obj = global.scene.getRootObject(i)
      SceneObjectUtils.forEachSceneObjectInSubHierarchy(obj, (foundObj) => {
        const grabbable = this.findGrabbableObjectComponent(foundObj)
        if (grabbable) {
          grabbableCount++
          const collider = foundObj.getComponent("Physics.ColliderComponent") as ColliderComponent
          const body = foundObj.getComponent("Physics.BodyComponent") as BodyComponent

          this.logger.info(`Found GrabbableObject: ${foundObj.name}`)
          if (collider) {
            this.logger.info(`  Has ColliderComponent (intangible: ${collider.intangible})`)
          } else if (body) {
            this.logger.info(`  Has BodyComponent (dynamic: ${body.dynamic})`)
          } else {
            this.logger.warn(`  NO COLLIDER OR BODY COMPONENT on ${foundObj.name}!`)
          }
        }
      })
    }

    this.logger.info(`Total GrabbableObjects found: ${grabbableCount}`)
  }

  private setupHandTracking() {
    try {
      this.leftHand = IK.HandInputData.getHand("left")
      this.rightHand = IK.HandInputData.getHand("right")
      this.logger.info("Hand tracking initialized successfully")
    } catch (e) {
      this.logger.warn("Could not access hand tracking data. Make sure Hand Tracking is enabled in the scene.")
    }
  }

  /**
   * Create small sphere colliders on finger tips for overlap detection
   */
  private createFingerTipColliders() {
    if (this.leftHandTrackingAsset) {
      this.leftIndexTipCollider = this.createFingerTipCollider(
        this.leftHandTrackingAsset,
        "index-3",
        "LeftIndexTip",
        true
      )
      this.leftThumbTipCollider = this.createFingerTipCollider(
        this.leftHandTrackingAsset,
        "thumb-3",
        "LeftThumbTip",
        true
      )

      if (this.debugLeftHandPrefab) {
        this.leftIndexDebugSphere = this.debugLeftHandPrefab.instantiate(null)
        this.leftIndexDebugSphere.enabled = true
        this.leftIndexDebugSphere.name = "DebugLeftIndex"

        const leftIndexCollider = this.leftIndexDebugSphere.getComponent("Physics.ColliderComponent")
        if (leftIndexCollider) {
          leftIndexCollider.destroy()
        }

        this.leftThumbDebugSphere = this.debugLeftHandPrefab.instantiate(null)
        this.leftThumbDebugSphere.enabled = true
        this.leftThumbDebugSphere.name = "DebugLeftThumb"

        const leftThumbCollider = this.leftThumbDebugSphere.getComponent("Physics.ColliderComponent")
        if (leftThumbCollider) {
          leftThumbCollider.destroy()
        }

        this.logger.debug("Created left hand debug spheres")
      }
    }

    if (this.rightHandTrackingAsset) {
      this.rightIndexTipCollider = this.createFingerTipCollider(
        this.rightHandTrackingAsset,
        "index-3",
        "RightIndexTip",
        false
      )
      this.rightThumbTipCollider = this.createFingerTipCollider(
        this.rightHandTrackingAsset,
        "thumb-3",
        "RightThumbTip",
        false
      )

      if (this.debugRightHandPrefab) {
        this.rightIndexDebugSphere = this.debugRightHandPrefab.instantiate(null)
        this.rightIndexDebugSphere.enabled = true
        this.rightIndexDebugSphere.name = "DebugRightIndex"

        const rightIndexCollider = this.rightIndexDebugSphere.getComponent("Physics.ColliderComponent")
        if (rightIndexCollider) {
          rightIndexCollider.destroy()
        }

        this.rightThumbDebugSphere = this.debugRightHandPrefab.instantiate(null)
        this.rightThumbDebugSphere.enabled = true
        this.rightThumbDebugSphere.name = "DebugRightThumb"

        const rightThumbCollider = this.rightThumbDebugSphere.getComponent("Physics.ColliderComponent")
        if (rightThumbCollider) {
          rightThumbCollider.destroy()
        }

        this.logger.debug("Created right hand debug spheres")
      }
    }
  }

  /**
   * Create a single finger tip collider (position will be updated manually)
   */
  private createFingerTipCollider(
    handAsset: HandTracking3DAsset,
    attachmentPoint: string,
    name: string,
    isLeftHand: boolean
  ): SceneObject {
    const fingerObj = global.scene.createSceneObject(name)

    const collider = fingerObj.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createSphereShape()
    shape.radius = this.detectionRadius
    collider.shape = shape
    collider.intangible = true

    collider.overlapFilter.includeStatic = true
    collider.overlapFilter.includeDynamic = true
    // Grabbables carry an intangible, oversized GrabZone collider (GrabbableObject): detect it.
    collider.overlapFilter.includeIntangible = true

    collider.onOverlapEnter.add((e: OverlapEnterEventArgs) => {
      this.onFingerOverlapEnter(e, isLeftHand)
    })

    collider.onOverlapExit.add((e: OverlapExitEventArgs) => {
      this.onFingerOverlapExit(e, isLeftHand)
    })

    this.logger.debug(`Created ${name} collider (radius: ${this.detectionRadius})`)
    return fingerObj
  }

  /**
   * Called when a finger tip collider enters an overlap
   */
  private onFingerOverlapEnter(e: OverlapEnterEventArgs, isLeftHand: boolean) {
    const overlappedObject = e.overlap.collider.getSceneObject()
    const handName = isLeftHand ? "Left" : "Right"

    this.logger.debug(`${handName} hand finger detected overlap with ${overlappedObject.name}`)

    const grabbable = this.findGrabbableObjectComponent(overlappedObject)

    if (grabbable) {
      if (isLeftHand) {
        this.leftHandOverlappingObjects.add(grabbable)
      } else {
        this.rightHandOverlappingObjects.add(grabbable)
      }
      this.logger.info(`${handName} hand added GRABBABLE object: ${overlappedObject.name}`)
    } else {
      this.logger.debug(`${overlappedObject.name} does not have GrabbableObject component`)
    }
  }

  /**
   * Called when a finger tip collider exits an overlap
   */
  private onFingerOverlapExit(e: OverlapExitEventArgs, isLeftHand: boolean) {
    const overlappedObject = e.overlap.collider.getSceneObject()

    const grabbable = this.findGrabbableObjectComponent(overlappedObject)

    if (grabbable) {
      if (isLeftHand) {
        this.leftHandOverlappingObjects.delete(grabbable)
      } else {
        this.rightHandOverlappingObjects.delete(grabbable)
      }
    }
  }

  /**
   * Find GrabbableObject component on a scene object
   */
  /** Every GrabbableObject in the scene. Rescanned on each gesture: balls are spawned at runtime. */
  private grabbables(): GrabbableObject[] {
    const found: GrabbableObject[] = []
    for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
      SceneObjectUtils.forEachSceneObjectInSubHierarchy(global.scene.getRootObject(i), (o) => {
        if (o.name === "GrabZone") return
        const g = this.findGrabbableObjectComponent(o)
        if (g && found.indexOf(g) < 0) found.push(g)
      })
    }
    return found
  }

  /**
   * The nearest free grabbable that wants this gesture and whose visual bounds are within
   * grabAssistRadius of the hand: between thumb and index tips for a pinch, the index knuckle
   * area for a fist.
   */
  private nearestGrabbable(hand: any, gestureType: "pinch" | "grab"): GrabbableObject | null {
    if (this.grabAssistRadius <= 0) return null
    const point: vec3 =
      gestureType === "pinch"
        ? hand.indexTip.position.add(hand.thumbTip.position).uniformScale(0.5)
        : hand.indexKnuckle
          ? hand.indexKnuckle.position
          : hand.indexTip.position
    let best: GrabbableObject | null = null
    let bestDistance = this.grabAssistRadius
    for (const g of this.grabbables()) {
      const object = g.getSceneObject()
      if (!object.isEnabledInHierarchy || g.isCurrentlyGrabbed() || g.getGestureType() !== gestureType) continue
      const d = this.distanceToBounds(object, point)
      if (d <= bestDistance) {
        bestDistance = d
        best = g
      }
    }
    return best
  }

  /** Distance from a point to the object's (and its children's) visual bounds; 0 inside. */
  private distanceToBounds(object: SceneObject, point: vec3): number {
    let best = Number.POSITIVE_INFINITY
    SceneObjectUtils.forEachSceneObjectInSubHierarchy(object, (o) => {
      const visual = o.getComponent("Component.BaseMeshVisual") as BaseMeshVisual
      if (!visual || !visual.enabled) return
      const min = visual.worldAabbMin()
      const max = visual.worldAabbMax()
      const dx = Math.max(min.x - point.x, 0, point.x - max.x)
      const dy = Math.max(min.y - point.y, 0, point.y - max.y)
      const dz = Math.max(min.z - point.z, 0, point.z - max.z)
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz))
    })
    if (best === Number.POSITIVE_INFINITY) {
      best = object.getTransform().getWorldPosition().distance(point)
    }
    return best
  }

  private findGrabbableObjectComponent(sceneObject: SceneObject): GrabbableObject | null {
    // A GrabZone child counts as its grabbable parent.
    if (sceneObject.name === "GrabZone" && sceneObject.getParent()) {
      return this.findGrabbableObjectComponent(sceneObject.getParent())
    }
    const allComponents = sceneObject.getComponents("Component.ScriptComponent")
    for (let i = 0; i < allComponents.length; i++) {
      const comp = allComponents[i]
      if (comp && typeof (comp as any).onGrab === "function" && typeof (comp as any).onRelease === "function") {
        return comp as GrabbableObject
      }
    }
    return null
  }

  private setupGestureEvents(handType: GestureModule.HandType) {
    const handName = handType === GestureModule.HandType.Left ? "Left" : "Right"

    this.gestureModule.getPinchDownEvent(handType).add((args: PinchDownArgs) => {
      this.logger.debug(`${handName} Hand Pinch Down`)
      this.onPinchDown(handType)
    })

    this.gestureModule.getPinchUpEvent(handType).add((args: PinchUpArgs) => {
      this.logger.debug(`${handName} Hand Pinch Up`)
      this.onPinchUp(handType)
    })

    this.gestureModule.getGrabBeginEvent(handType).add((args: GrabBeginArgs) => {
      this.logger.debug(`${handName} Hand Grab Begin`)
      this.onGrabBegin(handType)
    })

    this.gestureModule.getGrabEndEvent(handType).add((args: GrabEndArgs) => {
      this.logger.debug(`${handName} Hand Grab End`)
      this.onGrabEnd(handType)
    })
  }

  private onPinchDown(handType: GestureModule.HandType) {
    const isLeft = handType === GestureModule.HandType.Left

    if (isLeft) {
      this.leftPinchActive = true
    } else {
      this.rightPinchActive = true
    }

    this.attemptGrab(handType, "pinch")
  }

  private onGrabBegin(handType: GestureModule.HandType) {
    const isLeft = handType === GestureModule.HandType.Left

    if (isLeft) {
      this.leftGrabActive = true
    } else {
      this.rightGrabActive = true
    }

    this.attemptGrab(handType, "grab")
  }

  /**
   * Attempt to grab an object with the specified gesture type
   */
  private attemptGrab(handType: GestureModule.HandType, gestureType: "pinch" | "grab") {
    const isLeft = handType === GestureModule.HandType.Left
    const handName = isLeft ? "Left" : "Right"

    const hand = isLeft ? this.leftHand : this.rightHand

    if (!hand || !hand.isTracked()) {
      this.logger.debug("Hand not tracked")
      return
    }

    const overlappingObjects = isLeft ? this.leftHandOverlappingObjects : this.rightHandOverlappingObjects

    this.logger.debug(
      `${gestureType} detected, checking overlaps... (${overlappingObjects.size} objects overlapping)`
    )

    // Touching objects first; otherwise the nearest one within grabAssistRadius of the hand, so a
    // pinch or fist that lands just next to a ball, dart or racket still grabs it (finger-tip
    // colliders alone need the fingers almost inside the mesh on device).
    let candidates: GrabbableObject[] = Array.from(overlappingObjects)
    if (candidates.length === 0) {
      const assisted = this.nearestGrabbable(hand, gestureType)
      if (!assisted) {
        this.logger.debug("No objects in range to grab")
        return
      }
      this.logger.debug(`Grab assist picked ${assisted.getSceneObject().name}`)
      candidates = [assisted]
    }

    for (const grabbableObject of candidates) {
      if (!grabbableObject.isCurrentlyGrabbed()) {
        const objectGestureType = grabbableObject.getGestureType()

        if (objectGestureType === gestureType) {
          grabbableObject.onGrab(hand)

          if (isLeft) {
            this.leftHandGrabbedObject = grabbableObject
          } else {
            this.rightHandGrabbedObject = grabbableObject
          }

          this.logger.info(`Grabbed object with ${gestureType}!`)
          break
        } else {
          if (gestureType === "pinch" && objectGestureType === "grab") {
            this.logger.info(`This object needs GRAB gesture (close full hand), not pinch!`)
          } else if (gestureType === "grab" && objectGestureType === "pinch") {
            this.logger.info(`This object needs PINCH gesture (thumb + index), not grab!`)
          } else {
            this.logger.debug(`Object requires ${objectGestureType}, but ${gestureType} was used - skipping`)
          }
        }
      }
    }
  }

  private onPinchUp(handType: GestureModule.HandType) {
    const isLeft = handType === GestureModule.HandType.Left

    if (isLeft) {
      this.leftPinchActive = false
    } else {
      this.rightPinchActive = false
    }

    this.releaseGrabbedObject(handType, "pinch")
  }

  private onGrabEnd(handType: GestureModule.HandType) {
    const isLeft = handType === GestureModule.HandType.Left
    const handName = isLeft ? "Left" : "Right"

    this.logger.debug(`${handName} Hand Grab End - attempting to release`)

    if (isLeft) {
      this.leftGrabActive = false
    } else {
      this.rightGrabActive = false
    }

    this.releaseGrabbedObject(handType, "grab")
  }

  @bindUpdateEvent
  onUpdate() {
    if (this.isEditorMode) {
      this.updateEditorDrag()
      return
    }

    this.updateFingerColliderPositions()
    this.updateDebugSpheres()

    this.checkPinchStrength(GestureModule.HandType.Left)
    this.checkPinchStrength(GestureModule.HandType.Right)
  }

  /**
   * Update finger collider positions to follow hand tracking
   */
  private updateFingerColliderPositions() {
    if (this.leftHand && this.leftHand.isTracked()) {
      if (this.leftIndexTipCollider) {
        this.leftIndexTipCollider.getTransform().setWorldPosition(this.leftHand.indexTip.position)
      }
      if (this.leftThumbTipCollider) {
        this.leftThumbTipCollider.getTransform().setWorldPosition(this.leftHand.thumbTip.position)
      }
    }

    if (this.rightHand && this.rightHand.isTracked()) {
      if (this.rightIndexTipCollider) {
        this.rightIndexTipCollider.getTransform().setWorldPosition(this.rightHand.indexTip.position)
      }
      if (this.rightThumbTipCollider) {
        this.rightThumbTipCollider.getTransform().setWorldPosition(this.rightHand.thumbTip.position)
      }
    }
  }

  /**
   * Update debug sphere positions to follow finger tips
   */
  private updateDebugSpheres() {
    if (this.leftHand && this.leftHand.isTracked()) {
      if (this.leftIndexDebugSphere) {
        this.leftIndexDebugSphere.getTransform().setWorldPosition(this.leftHand.indexTip.position)
      }
      if (this.leftThumbDebugSphere) {
        this.leftThumbDebugSphere.getTransform().setWorldPosition(this.leftHand.thumbTip.position)
      }
    }

    if (this.rightHand && this.rightHand.isTracked()) {
      if (this.rightIndexDebugSphere) {
        this.rightIndexDebugSphere.getTransform().setWorldPosition(this.rightHand.indexTip.position)
      }
      if (this.rightThumbDebugSphere) {
        this.rightThumbDebugSphere.getTransform().setWorldPosition(this.rightHand.thumbTip.position)
      }
    }
  }

  private checkPinchStrength(handType: GestureModule.HandType) {
    const isLeft = handType === GestureModule.HandType.Left
    const isPinching = isLeft ? this.leftPinchActive : this.rightPinchActive
    const grabbedObject = isLeft ? this.leftHandGrabbedObject : this.rightHandGrabbedObject

    if (!isPinching || !grabbedObject) return

    if (grabbedObject.getGestureType() !== "pinch") return

    const hand = isLeft ? this.leftHand : this.rightHand

    if (hand && hand.isTracked()) {
      const pinchStrength = hand.getPinchStrength() ?? 0

      if (pinchStrength < this.minPinchStrength) {
        this.logger.debug(`Pinch strength too low (${pinchStrength}), releasing object`)
        this.releaseGrabbedObject(handType, "pinch")
      }
    }
  }

  private releaseGrabbedObject(handType: GestureModule.HandType, gestureType: "pinch" | "grab") {
    const isLeft = handType === GestureModule.HandType.Left
    const handName = isLeft ? "Left" : "Right"
    const grabbedObject = isLeft ? this.leftHandGrabbedObject : this.rightHandGrabbedObject

    if (!grabbedObject) {
      this.logger.debug(`${handName} hand has no grabbed object to release`)
      return
    }

    const objectGestureType = grabbedObject.getGestureType()

    this.logger.debug(`Attempting release - object gesture: ${objectGestureType}, release gesture: ${gestureType}`)

    if (objectGestureType === gestureType) {
      grabbedObject.onRelease()

      if (isLeft) {
        this.leftHandGrabbedObject = null
      } else {
        this.rightHandGrabbedObject = null
      }

      this.logger.info(`Released object (${gestureType})`)
    } else {
      this.logger.debug(`Gesture mismatch - object needs ${objectGestureType}, got ${gestureType}`)
    }
  }
}
