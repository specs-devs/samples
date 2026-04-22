/**
 * Specs Inc. 2026
 * Pool Table Predictor component for the SnapML Pool Spectacles lens.
 */
import {MultiObjectTracking, Prediction} from "./ML/MultiObjectTracking"

import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {CameraService} from "./CameraService"
import {Detection} from "./ML/DetectionHelpers"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"

const POOL_BALL_DIAMETER_CM = 5.715

@component
export class PoolTablePredictor extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PoolTablePredictor – table alignment and ball tracking</span><br/><span style="color: #94A3B8; font-size: 11px;">Guides the user to align calibration pins and projects ML detections to 3D world positions.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Core References</span>')
  @input
  @hint("Camera service providing device camera data and world-space transforms")
  cameraService: CameraService

  @input
  @hint("Prefab instantiated for each tracked pool ball marker")
  marker: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Scene Objects</span>')
  @input
  @hint("Plane used to define the pool table surface for 3D unprojection")
  positionPlane: SceneObject

  @input
  @hint("Left reference marker (editor only) for initial table alignment")
  markerLeft: SceneObject

  @input
  @hint("Right reference marker (editor only) for initial table alignment")
  markerRight: SceneObject

  @input
  @hint("Interactable corner marker for the left pocket calibration pin")
  cornerLeftMarker: SceneObject

  @input
  @hint("Interactable corner marker for the right pocket calibration pin")
  cornerRightMarker: SceneObject

  @input
  @hint("Text element used to display alignment hint messages to the user")
  hintText: Text

  @input
  @hint("Button to reset the table alignment; shown when palm faces camera")
  resetButton: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private markerObjects: SceneObject[] = []

  private isEditor = global.deviceInfoSystem.isEditor()

  private isMovingLeftMarker = false
  private isMovingRightMarker = false
  private hasMovedLeftMarker = this.isEditor
  private hasMovedRightMarker = this.isEditor
  private lastTablePosition: vec3 = vec3.zero()

  private poolTableFound = false

  public tableAligned = this.isEditor

  private multiObjectTracking = new MultiObjectTracking(
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 6], //max class counts
    POOL_BALL_DIAMETER_CM * 3, //max distance
    POOL_BALL_DIAMETER_CM * 0.25, //merge distance
    20, // max tracklets
    0.25 // max lost time
  )

  private logger: Logger

  onAwake() {
    this.logger = new Logger("PoolTablePredictor", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.updateMarkers()
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    const interactableLeft = this.cornerLeftMarker.getComponent(Interactable.getTypeName()) as Interactable
    const interactableRight = this.cornerRightMarker.getComponent(Interactable.getTypeName()) as Interactable
    interactableLeft.onInteractorTriggerEnd(() => {
      if (!this.hasMovedLeftMarker) {
        this.hasMovedLeftMarker = true
        this.cornerRightMarker.enabled = true
        this.updateHint("Move the R Pin to the right corner pocket")
      }

      this.isMovingLeftMarker = false
    })

    interactableRight.onInteractorTriggerEnd(() => {
      this.isMovingRightMarker = false
      this.hasMovedRightMarker = true
      this.tableAligned = true
      this.updateHint("")
      this.updateMarkers()
    })

    interactableLeft.onInteractorTriggerStart(() => {
      this.isMovingLeftMarker = true
    })
    interactableRight.onInteractorTriggerStart(() => {
      this.isMovingRightMarker = true
    })

    const resetInteractable = this.resetButton.getComponent(Interactable.getTypeName()) as Interactable
    resetInteractable.onInteractorTriggerEnd(() => {
      this.resetAlignment()
    })
    this.resetButton.enabled = false

    if (!this.isEditor) {
      this.resetAlignment()
    }

    this.updateHint("Find a pool table...")
  }

  @bindUpdateEvent
  onUpdate() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onUpdate()")
    this.updateTablePosition()
  }

  updateHint(hint: string) {
    this.hintText.text = hint
  }

  createMarker() {
    const parent = this.getSceneObject().getParent()
    const marker = this.marker.instantiate(parent)
    marker.enabled = false
    this.markerObjects.push(marker)
  }

  resetAlignment() {
    this.cornerRightMarker.enabled = false
    this.cornerLeftMarker.enabled = false
    this.hasMovedLeftMarker = false
    this.hasMovedRightMarker = false
    this.tableAligned = false
    this.poolTableFound = false
    this.logger.info("Table alignment reset")
  }

  updateTablePosition() {
    const lh = SIK.HandInputData.getHand("left")
    const angle = lh.getFacingCameraAngle()
    const palmLeftUp = angle != null && angle < 50

    this.resetButton.enabled = palmLeftUp

    const palmPosition = lh.middleKnuckle.position
    const palmDirection = lh.middleKnuckle.right
    const palmForward = lh.middleKnuckle.forward
    if (palmPosition != null) {
      this.resetButton
        .getTransform()
        .setWorldPosition(palmPosition.add(palmDirection.uniformScale(7.0).add(palmForward.uniformScale(2.0))))
    }

    const mesh = this.positionPlane.getChild(0).getComponent("Component.RenderMeshVisual")
    mesh.enabled =
      this.hasMovedLeftMarker && (this.isMovingRightMarker || (this.isMovingLeftMarker && this.hasMovedRightMarker))

    const interfacePosition = this.hintText
      .getSceneObject()
      .getTransform()
      .getWorldPosition()
      .add(new vec3(0, 2.0, 0))

    if (this.cornerLeftMarker.enabled && !(this.hasMovedLeftMarker || this.isMovingLeftMarker)) {
      this.cornerLeftMarker.getTransform().setWorldPosition(interfacePosition)
    }

    if (this.cornerRightMarker.enabled && !this.hasMovedRightMarker && !this.isMovingRightMarker) {
      this.cornerRightMarker.getTransform().setWorldPosition(interfacePosition)
    }

    this.cornerLeftMarker.getChild(1).enabled = this.isMovingLeftMarker || !this.hasMovedLeftMarker
    this.cornerRightMarker.getChild(1).enabled = this.isMovingRightMarker || !this.hasMovedRightMarker

    const isMoving = this.isMovingLeftMarker || this.isMovingRightMarker

    const frontLeft = this.cornerLeftMarker.getTransform().getWorldPosition()
    const frontRight = this.cornerRightMarker.getTransform().getWorldPosition()

    if (isMoving || this.lastTablePosition.distance(frontLeft) > 1.0) {
      const scale = frontLeft.distance(frontRight)

      // Calculate the distance between the two index tips
      const distance = frontLeft.distance(frontRight)

      // Set the position of the plane to the center point
      this.positionPlane.getTransform().setWorldPosition(frontLeft)

      // Calculate the rotation angle based on the positions of the index tips
      const direction = frontRight.sub(frontLeft).normalize()
      const angleY = Math.atan2(direction.x, direction.z) // Rotate only on the Y axis

      // Set the rotation of the plane
      this.positionPlane.getTransform().setWorldRotation(quat.fromEulerAngles(0, angleY, 0))

      // Scale the plane based on the distance between the index tips
      this.positionPlane.getTransform().setWorldScale(vec3.one().uniformScale(scale))

      this.lastTablePosition = frontLeft
    }
  }

  updateMarkers() {
    if (!this.isEditor) {
      return
    }

    if (this.tableAligned) {
      this.cornerLeftMarker.getTransform().setWorldPosition(this.markerLeft.getTransform().getWorldPosition())
      this.cornerRightMarker.getTransform().setWorldPosition(this.markerRight.getTransform().getWorldPosition())
    }
  }

  //convert from 2D bounding boxes to real world positions
  updateDetections(detections: Detection[]) {
    const predictions: Prediction[] = []
    if (this.tableAligned) {
      for (let i = 0; i < detections.length; i++) {
        const detection = detections[i]

        const bb = detection.bbox
        const uv = new vec2(bb[0], 1.0 - bb[1])
        const R = POOL_BALL_DIAMETER_CM * 0.5 // real radius (same unit as you want your scene)
        const planeY = this.positionPlane.getTransform().getWorldPosition().y
        const pos = this.unproject(uv, planeY, R)

        const isEnabled = this.isOnTable(pos)
        if (isEnabled) {
          const idScore = {
            id: detection.index,
            score: detection.score,
            trackletIndex: 0
          }
          const prediction = new Prediction(pos, [idScore])
          predictions.push(prediction)
        }
      }
    }

    const finalPredictions = this.multiObjectTracking.trackDetections(predictions, getTime())

    for (let i = 0; i < Math.max(finalPredictions.length, this.markerObjects.length); i++) {
      if (this.markerObjects.length <= i) {
        this.createMarker()
      }
      const marker = this.markerObjects[i]

      if (i < finalPredictions.length) {
        marker.getTransform().setWorldPosition(finalPredictions[i].position)
        let idString = finalPredictions[i].id.toString()
        if (finalPredictions[i].id == 16) {
          idString = "P"
        }
        marker.getChild(0).getComponent("Component.Text").text = idString
      }

      marker.enabled = i < finalPredictions.length
    }

    if (detections.length > 3 && !this.poolTableFound) {
      const hint = this.tableAligned ? "" : "Move the L Pin to the left corner pocket of the table"
      this.updateHint(hint)
      this.cornerLeftMarker.enabled = true
      this.poolTableFound = true
      this.logger.info("Pool table found with " + detections.length + " detections")
    }
  }

  //determines if a 3D point is on the table
  isOnTable(pos: vec3) {
    const inverted = this.positionPlane.getTransform().getInvertedWorldTransform()
    const localPos = inverted.multiplyPoint(pos)
    const padding = 0.1

    return localPos.x > -padding && localPos.x < 2.0 + padding && localPos.z > -padding && localPos.z < 1.0 + padding
  }

  //converts a 2D screen position to a 3D point on a 3D plane
  unproject(uv: vec2, planeY: number, planeOffset: number) {
    const uvUncropped = this.cameraService.uvToUncroppedUV(uv)
    const unprojectedCameraSpace = this.cameraService.cameraModel.unprojectFromUV(uvUncropped, 1.0)

    const unprojectedWorldSpace = this.cameraService.CaptureToWorldTransform().multiplyPoint(unprojectedCameraSpace)

    // Get the known Y value in world space
    const knownY = planeY + planeOffset

    // Get camera position in world space
    const cameraPos = this.cameraService.DeviceCameraPosition()

    // This gives us a direction vector in world space
    const dir = unprojectedWorldSpace.sub(cameraPos).normalize()

    // Calculate the scale factor to reach the known Y plane
    // We need to solve: cameraPos.y + dir.y * t = knownY
    // Therefore: t = (knownY - cameraPos.y) / dir.y
    const t = (knownY - cameraPos.y) / dir.y

    // Calculate the final world position
    const worldPos = cameraPos.add(dir.uniformScale(t))
    return worldPos
  }
}
