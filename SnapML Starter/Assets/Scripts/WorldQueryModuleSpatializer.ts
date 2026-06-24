/**
 * Specs Inc. 2026
 * World Query Spatializer component for the SnapML Starter Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {BaseButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"
import {DetectionContainer} from "./DetectionContainer"
import {Detection} from "./DetectionHelpers"
import {MLSpatializer} from "./MLSpatializer"
import {PinholeCapture} from "./PinholeCapture"

// Import WorldQueryModule for hit testing
const WorldQueryModule = require("LensStudio:WorldQueryModule")

// LensStudio World Query Types
type HitTestResult = {
  position: vec3
  normal: vec3
  distance?: number
}

/**
 * Main entry point for ML-based object detection and spatialization
 * Uses MLSpatializer for ML model inference and handles the spatial placement of detections
 * Simplified version with direct placement on button click
 */
@component
export class WorldQuerySpatializer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WorldQuerySpatializer – world-query 3D detection placer</span><br/><span style="color: #94A3B8; font-size: 11px;">Projects 2D ML detections into 3D world space via hit-test rays on button press.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Reference to the MLSpatializer component that handles ML detection")
  mlSpatializer: MLSpatializer

  @input
  @hint("Object to place at detected locations")
  detectionPrefab: ObjectPrefab

  @input
  @hint("Button to trigger detection on click")
  detectButton: BaseButton

  @input
  @hint("Reference to the PinholeCapture component")
  pinholeCapture: PinholeCapture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Detection Settings</span>')
  @input
  @hint("Maximum number of objects to detect and place")
  @widget(new SliderWidget(1, 20, 1))
  maxDetectionCount: number = 5

  @input
  @hint("Distance to project detections in world space")
  rayDistance: number = 200

  @input
  @hint("Enable surface detection with WorldQueryModule")
  enableSurfaceDetection: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private detectionInstances: SceneObject[] = []
  private isInitialized: boolean = false
  private isRunning: boolean = false
  private hitTestSession: HitTestSession

  onAwake(): void {
    this.logger = new Logger("WorldQuerySpatializer", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.info("WorldQuerySpatializer: OnStartEvent triggered")

    if (!this.mlSpatializer) {
      this.logger.error("MLSpatializer reference is not set")
      return
    }

    this.setupButton()

    this.logger.info("MLSpatializer reference found, delaying initialization")

    const delayedInitEvent = this.createEvent("DelayedCallbackEvent")
    delayedInitEvent.bind(() => {
      this.logger.info("Delayed initialization starting after 1 second")
      this.initialize()
    })
    delayedInitEvent.reset(1.0)
  }

  /**
   * Set up button interaction
   */
  private setupButton(): void {
    this.logger.info("Setting up detect button")

    if (!this.detectButton) {
      this.logger.error("Detect button is not set in inspector")
      return
    }

    try {
      this.logger.debug("Adding onTriggerUp listener to button")
      this.detectButton.onTriggerUp.add(() => {
        this.logger.debug("Detect button pressed - triggering detection")
        this.detect()
      })
      this.logger.debug("Button setup complete")

      try {
        const buttonObject = this.detectButton.getSceneObject()
        this.logger.debug("Button scene object name: " + buttonObject.name)
      } catch (e) {
        this.logger.error("Failed to get button's scene object: " + e)
      }
    } catch (e) {
      this.logger.error("Exception during button setup: " + e)
    }
  }

  /**
   * Initialize the component
   */
  private initialize(): void {
    this.logger.info("Starting WorldQuerySpatializer initialization...")

    if (!this.pinholeCapture) {
      this.logger.error("PinholeCapture is not set")
      return
    }

    this.logger.info("PinholeCapture found, saving camera matrix")

    if (!this.pinholeCapture.saveMatrix()) {
      this.logger.warn("Failed to save camera matrix. Retrying in 1 second...")

      const retryEvent = this.createEvent("DelayedCallbackEvent")
      retryEvent.bind(() => {
        this.logger.info("Retrying to save camera matrix")
        if (!this.pinholeCapture.saveMatrix()) {
          this.logger.error("Failed to save camera matrix again after retry")
        } else {
          this.logger.info("Camera matrix saved successfully on retry")
          this.continueInitialization()
        }
      })
      retryEvent.reset(1.0)
      return
    }

    this.logger.info("Camera matrix saved successfully")
    this.continueInitialization()
  }

  /**
   * Continue initialization after camera matrix is saved
   */
  private continueInitialization(): void {
    try {
      this.logger.debug("Initializing detection instances")
      this.initDetectionInstances()

      if (this.enableSurfaceDetection) {
        this.logger.debug("Creating hit test session")
        this.hitTestSession = this.createHitTestSession()
        this.logger.debug("Hit test session created: " + (this.hitTestSession !== null))
      }

      this.isInitialized = true
      this.logger.info("WorldQuerySpatializer initialization complete")
    } catch (e) {
      this.logger.error("Error during initialization: " + e)
    }
  }

  /**
   * Create hit test session with options
   */
  private createHitTestSession(): HitTestSession {
    try {
      this.logger.debug("Creating HitTestSession with options")

      if (typeof WorldQueryModule === "undefined" || !WorldQueryModule) {
        this.logger.error("WorldQueryModule is not available in this environment!")
        return null
      }

      const hasWorldQuerySupport = this.checkWorldQuerySupport()
      if (!hasWorldQuerySupport) {
        this.logger.error("This environment doesn't support WorldQueryModule")
        return null
      }

      const options = HitTestSessionOptions.create()
      if (!options) {
        this.logger.error("Failed to create HitTestSessionOptions")
        return null
      }

      options.filter = true

      this.logger.debug("Calling WorldQueryModule.createHitTestSessionWithOptions")
      const session = WorldQueryModule.createHitTestSessionWithOptions(options)
      this.logger.debug("HitTestSession created successfully: " + (session !== null))
      return session
    } catch (e) {
      this.logger.error("Failed to create HitTestSession: " + e)
      return null
    }
  }

  /**
   * Check if the current environment supports WorldQueryModule
   */
  private checkWorldQuerySupport(): boolean {
    try {
      const testOptions = HitTestSessionOptions.create()
      if (!testOptions) {
        this.logger.debug("HitTestSessionOptions failed - WorldQuery not supported")
        return false
      }

      if (typeof WorldQueryModule === "undefined" || !WorldQueryModule) {
        this.logger.debug("WorldQueryModule is undefined or null")
        return false
      }

      if (typeof WorldQueryModule.createHitTestSessionWithOptions !== "function") {
        this.logger.debug("createHitTestSessionWithOptions is not a function")
        return false
      }

      this.logger.debug("Environment appears to support WorldQueryModule")
      return true
    } catch (e) {
      this.logger.debug("Exception while checking WorldQueryModule support: " + e)
      return false
    }
  }

  /**
   * Initialize detection instances
   */
  private initDetectionInstances(): void {
    if (!this.detectionPrefab) {
      this.logger.error("Please set detection Prefab input")
      return
    }

    const instancesParent = global.scene.createSceneObject("DetectionInstances")
    instancesParent.setParent(this.getSceneObject())

    for (let i = 0; i < this.maxDetectionCount; i++) {
      const instance = this.detectionPrefab.instantiate(null)
      instance.setParent(instancesParent)
      instance.name = "Detection_" + i
      instance.enabled = false
      this.detectionInstances.push(instance)
    }
  }

  /**
   * Run detection and spatialize results on button click
   */
  private detect(): void {
    if (this.isRunning || !this.isInitialized) {
      this.logger.debug("Detection skipped - already running or not initialized")
      return
    }

    if (!this.pinholeCapture || !this.pinholeCapture.isReady || !this.pinholeCapture.isReady()) {
      this.logger.debug("Detection skipped - PinholeCapture not ready")
      return
    }

    this.logger.debug("Starting detection process...")

    this.isRunning = true

    try {
      const matrixSaved = this.pinholeCapture.saveMatrix()

      if (!matrixSaved) {
        this.logger.debug("Failed to save camera matrix during detection")
        this.isRunning = false
        return
      }

      this.logger.debug("Getting latest detections from MLSpatializer")
      const detections = this.mlSpatializer.getLatestDetections()
      this.logger.debug("Got " + detections.length + " detections")

      this.clearAllDetections()

      this.logger.debug("Placing detections in world")
      this.placeDetectionsInWorld(detections)
    } catch (e) {
      this.logger.error("Error processing detection: " + e)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Clear all existing detection instances
   */
  private clearAllDetections(): void {
    for (let i = 0; i < this.detectionInstances.length; i++) {
      this.detectionInstances[i].enabled = false
    }
  }

  /**
   * Place detections in world space directly without smoothing
   */
  private placeDetectionsInWorld(detections: Detection[]): void {
    this.logger.debug("placeDetectionsInWorld called with " + detections.length + " detections")

    if (detections.length === 0) {
      this.logger.debug("No objects detected to place")
      return
    }

    for (let i = 0; i < Math.min(detections.length, this.maxDetectionCount); i++) {
      const detection = detections[i]
      const instance = this.detectionInstances[i]

      this.logger.debug("Processing detection " + i + ": " + detection.label)

      const screenPosX = detection.bbox[0]
      const screenPosY = detection.bbox[1]
      const width = detection.bbox[2]

      this.logger.debug(
        "Screen position: x=" +
          screenPosX.toFixed(2) +
          ", y=" +
          screenPosY.toFixed(2) +
          ", width=" +
          width.toFixed(2)
      )

      const centerOffset = screenPosX - 0.5
      const horizontalCorrection = 0.18 + centerOffset * 0.1
      const correctedScreenPosX = Math.max(0.01, Math.min(0.99, screenPosX - width * 0.5 + horizontalCorrection))

      this.logger.debug("Corrected screen X: " + correctedScreenPosX.toFixed(2))

      if (!this.pinholeCapture || !this.pinholeCapture.isReady()) {
        this.logger.error("PinholeCapture not ready during placement")
        continue
      }

      const cameraPos = this.pinholeCapture.worldSpaceOfTrackingCamera()
      if (!cameraPos) {
        this.logger.error("Could not get camera position for detection " + i)
        continue
      }

      this.logger.debug(
        "Camera position: " +
          cameraPos.x.toFixed(2) +
          ", " +
          cameraPos.y.toFixed(2) +
          ", " +
          cameraPos.z.toFixed(2)
      )

      const worldPos = this.pinholeCapture.captureToWorldTransform(
        new vec2(correctedScreenPosX, screenPosY),
        this.rayDistance
      )

      if (!worldPos) {
        this.logger.error("Projection failed for detection " + i)
        instance.enabled = false
        continue
      }

      this.logger.debug(
        "World position: " + worldPos.x.toFixed(2) + ", " + worldPos.y.toFixed(2) + ", " + worldPos.z.toFixed(2)
      )

      const rayDir = worldPos.sub(cameraPos).normalize()
      this.logger.debug("Ray direction: " + rayDir.x.toFixed(2) + ", " + rayDir.y.toFixed(2) + ", " + rayDir.z.toFixed(2))

      if (this.enableSurfaceDetection && this.hitTestSession) {
        this.logger.debug("Surface detection enabled, attempting hit test")
        const rayStart = cameraPos
        const rayEnd = cameraPos.add(rayDir.uniformScale(this.rayDistance * 2))

        this.logger.debug(
          "Ray start: " + rayStart.x.toFixed(2) + ", " + rayStart.y.toFixed(2) + ", " + rayStart.z.toFixed(2)
        )
        this.logger.debug("Ray end: " + rayEnd.x.toFixed(2) + ", " + rayEnd.y.toFixed(2) + ", " + rayEnd.z.toFixed(2))

        try {
          this.logger.debug("Casting hit test ray for " + detection.label)
          this.hitTestSession.hitTest(rayStart, rayEnd, (hit) => {
            this.logger.debug("Hit test callback received for " + detection.label + ", success: " + (hit !== null))
            this.handleHitTestResult(hit, instance, detection, cameraPos)
          })

          continue
        } catch (e) {
          this.logger.error("Hit test failed: " + e)
        }
      } else {
        this.logger.debug("Surface detection disabled or hit test session not created")
      }

      const position = cameraPos.add(rayDir.uniformScale(this.rayDistance))
      this.logger.debug(
        "Using fallback position: " +
          position.x.toFixed(2) +
          ", " +
          position.y.toFixed(2) +
          ", " +
          position.z.toFixed(2)
      )

      const transform = instance.getTransform()
      transform.setWorldPosition(position)

      const directionToCamera = cameraPos.sub(position).normalize()
      const worldUp = vec3.up()
      const lookAtRotation = quat.lookAt(directionToCamera, worldUp)
      transform.setWorldRotation(lookAtRotation)

      instance.enabled = true

      this.updateDetectionContainerTextOnly(instance, detection, position)

      this.logger.debug(
        "Placed " +
          detection.label +
          " at position " +
          position.x.toFixed(2) +
          ", " +
          position.y.toFixed(2) +
          ", " +
          position.z.toFixed(2)
      )
    }
  }

  /**
   * Handle the result of a hit test and place the object accordingly
   */
  private handleHitTestResult(hit: HitTestResult, instance: SceneObject, detection: Detection, cameraPos: vec3): void {
    this.logger.debug("handleHitTestResult called for " + detection.label + ", hit: " + (hit !== null))

    if (!hit) {
      this.logger.debug("No surface hit found for " + detection.label + ", using fallback placement")

      try {
        const screenPosX = detection.bbox[0]
        const screenPosY = detection.bbox[1]
        const width = detection.bbox[2]

        this.logger.debug("FALLBACK: Using screen position: " + screenPosX.toFixed(2) + ", " + screenPosY.toFixed(2))

        const centerOffset = screenPosX - 0.5
        const horizontalCorrection = 0 + centerOffset * 0.1
        const correctedScreenPosX = Math.max(0.01, Math.min(0.99, screenPosX - width * 0.5 + horizontalCorrection))

        this.logger.debug("FALLBACK: Corrected X: " + correctedScreenPosX.toFixed(2))

        const worldPos = this.pinholeCapture.captureToWorldTransform(
          new vec2(correctedScreenPosX, screenPosY),
          this.rayDistance
        )

        if (!worldPos) {
          this.logger.error("FALLBACK: Failed to create fallback world position")
          instance.enabled = false
          return
        }

        this.logger.debug(
          "FALLBACK: Got world position: " +
            worldPos.x.toFixed(2) +
            ", " +
            worldPos.y.toFixed(2) +
            ", " +
            worldPos.z.toFixed(2)
        )

        const rayDir = worldPos.sub(cameraPos).normalize()
        this.logger.debug(
          "FALLBACK: Ray direction: " +
            rayDir.x.toFixed(2) +
            ", " +
            rayDir.y.toFixed(2) +
            ", " +
            rayDir.z.toFixed(2)
        )

        const position = cameraPos.add(rayDir.uniformScale(this.rayDistance))

        this.logger.debug(
          "FALLBACK: Using fallback position: " +
            position.x.toFixed(2) +
            ", " +
            position.y.toFixed(2) +
            ", " +
            position.z.toFixed(2)
        )

        const transform = instance.getTransform()
        transform.setWorldPosition(position)

        const directionToCamera = cameraPos.sub(position).normalize()
        const worldUp = vec3.up()
        const lookAtRotation = quat.lookAt(directionToCamera, worldUp)
        transform.setWorldRotation(lookAtRotation)

        this.positionVertices(instance, detection, position, lookAtRotation)
        this.updateDetectionContainerTextOnly(instance, detection, position)

        this.logger.debug("FALLBACK: Successfully placed object at fallback position")
      } catch (e) {
        this.logger.error("FALLBACK: Exception during fallback placement: " + e)
        instance.enabled = false
        return
      }

      instance.enabled = true
      return
    }

    const hitPosition = hit.position
    const hitNormal = hit.normal

    this.logger.debug(
      "Surface hit! Position: " +
        hitPosition.x.toFixed(2) +
        ", " +
        hitPosition.y.toFixed(2) +
        ", " +
        hitPosition.z.toFixed(2)
    )
    this.logger.debug(
      "Surface normal: " +
        hitNormal.x.toFixed(2) +
        ", " +
        hitNormal.y.toFixed(2) +
        ", " +
        hitNormal.z.toFixed(2)
    )

    const transform = instance.getTransform()
    transform.setWorldPosition(hitPosition)

    const directionToCamera = cameraPos.sub(hitPosition).normalize()

    const normalizedNormal = hitNormal.normalize()
    const upDot = Math.abs(normalizedNormal.dot(vec3.up()))
    this.logger.debug("Surface orientation (upDot): " + upDot.toFixed(2) + " (1.0 = horizontal)")

    let finalRotation: quat

    if (upDot > 0.9) {
      this.logger.debug("Horizontal surface detected")
      const horizontalDir = new vec3(directionToCamera.x, 0, directionToCamera.z).normalize()
      finalRotation = quat.lookAt(horizontalDir, vec3.up())
    } else {
      this.logger.debug("Vertical/angled surface detected")
      finalRotation = quat.lookAt(directionToCamera, vec3.up())
    }

    transform.setWorldRotation(finalRotation)

    this.positionVertices(instance, detection, hitPosition, finalRotation)

    instance.enabled = true

    this.updateDetectionContainerTextOnly(instance, detection, hitPosition)

    this.logger.debug("Successfully placed " + detection.label + " on surface")
  }

  /**
   * Find a child object by name
   */
  private findChildByName(parent: SceneObject, name: string): SceneObject {
    if (!parent) {
      return null
    }

    const childCount = parent.getChildrenCount()

    for (let i = 0; i < childCount; i++) {
      const child = parent.getChild(i)
      if (child.name === name) {
        return child
      }
    }

    return null
  }

  /**
   * Public method to get the number of active detections
   */
  public getActiveDetectionCount(): number {
    return this.detectionInstances.filter((instance) => instance.enabled).length
  }

  onDestroy(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onDestroy()")
    this.detectionInstances = []
  }

  /**
   * Update only the text fields of a DetectionContainer.
   */
  private updateDetectionContainerTextOnly(
    detectionInstance: SceneObject,
    detection: Detection,
    worldPosition: vec3
  ): void {
    const detectionContainer = detectionInstance.getComponent(DetectionContainer.getTypeName()) as DetectionContainer

    if (!detectionContainer) {
      return
    }

    if (detectionContainer.categoryAndConfidence) {
      const confidencePercent = Math.round(detection.score * 100)
      const labelText = `${detection.label || "detection"}: ${confidencePercent}%`
      detectionContainer.categoryAndConfidence.text = labelText
    }

    if (detectionContainer.distanceFromCamera && this.pinholeCapture) {
      const cameraPos = this.pinholeCapture.worldSpaceOfTrackingCamera()
      if (cameraPos && worldPosition) {
        const distanceMeters = cameraPos.distance(worldPosition)
        detectionContainer.distanceFromCamera.text = `${distanceMeters.toFixed(2)}cm`
      }
    }
  }

  private positionVertices(instance: SceneObject, detection: Detection, centerPosition: vec3, orientation: quat): void {
    if (this.enableLogging) {
      this.logger.debug(`Positioning vertices for detection ${detection.label} at ${centerPosition}`)
    }

    const detectionContainer = instance.getComponent(DetectionContainer.getTypeName()) as DetectionContainer
    if (!detectionContainer || !detectionContainer.polylinePoints || detectionContainer.polylinePoints.length < 4) {
      if (this.enableLogging) {
        this.logger.debug("DetectionContainer or polylinePoints not found or insufficient")
      }
      return
    }

    const vertices = detectionContainer.polylinePoints

    try {
      const width = detection.bbox[2]
      const height = detection.bbox[3]

      const rectangleScale = 0.6
      const rectangleWorldScale = 100

      const halfWidth = (width * rectangleScale * rectangleWorldScale) / 2
      const halfHeight = (height * rectangleScale * rectangleWorldScale) / 2

      const localCorners = [
        new vec3(-halfWidth, halfHeight, 0),
        new vec3(halfWidth, halfHeight, 0),
        new vec3(halfWidth, -halfHeight, 0),
        new vec3(-halfWidth, -halfHeight, 0)
      ]

      for (let i = 0; i < 4 && i < vertices.length; i++) {
        vertices[i].getTransform().setLocalPosition(localCorners[i])
        if (this.enableLogging) {
          this.logger.debug(
            `Vertex ${i}: local=${localCorners[i].toString()} (halfWidth=${halfWidth}, halfHeight=${halfHeight})`
          )
        }
      }

      const v0 = vertices[0].getTransform().getLocalPosition()
      const v1 = vertices[1].getTransform().getLocalPosition()
      const v2 = vertices[2].getTransform().getLocalPosition()
      const v3 = vertices[3].getTransform().getLocalPosition()

      const topY = Math.max(v0.y, v1.y)
      const bottomY = Math.min(v2.y, v3.y)
      const leftX = Math.min(v0.x, v3.x)
      const rightX = Math.max(v1.x, v2.x)

      vertices[0].getTransform().setLocalPosition(new vec3(leftX, topY, 0))
      vertices[1].getTransform().setLocalPosition(new vec3(rightX, topY, 0))
      vertices[2].getTransform().setLocalPosition(new vec3(rightX, bottomY, 0))
      vertices[3].getTransform().setLocalPosition(new vec3(leftX, bottomY, 0))

      if (this.enableLogging) {
        this.logger.debug(`Enforced rectangle: top-left=(${leftX}, ${topY}), bottom-right=(${rightX}, ${bottomY})`)
      }

      if (detectionContainer.polyline) {
        detectionContainer.polyline.refreshLine()
      }
    } catch (e) {
      this.logger.error(`Error positioning vertices: ${e}`)
    }
  }
}
