/**
 * Specs Inc. 2026
 * Gesture Manager handling core logic for the Throw Lab lens.
 */
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
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
  detectionRadius: number = 1.5

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
      this.leftHand = SIK.HandInputData.getHand("left")
      this.rightHand = SIK.HandInputData.getHand("right")
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
    collider.overlapFilter.includeIntangible = false

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
  private findGrabbableObjectComponent(sceneObject: SceneObject): GrabbableObject | null {
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

    if (overlappingObjects.size === 0) {
      this.logger.debug("No objects in range to grab")
      return
    }

    for (const grabbableObject of overlappingObjects) {
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
