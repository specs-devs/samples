/**
 * Specs Inc. 2026
 * Raycast Painter TS component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class RaycastPainterTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">RaycastPainterTS – draw a line path by raycasting on paintable surfaces</span><br/><span style="color: #94A3B8; font-size: 11px;">Accumulates world-space hit points into a line renderer as the user touches and drags.</span>')
  @ui.separator

  @input
  @hint("Camera from which the ray will be shot")
  playerCamera!: Component

  @input
  @hint("Max distance for the raycast")
  raycastDistance: number = 100.0

  @input
  @hint("Name pattern to identify paintable objects")
  paintablePattern: string = "Paintable"

  @input
  @hint("Thickness of the painted line in world units")
  lineThickness: number = 0.02

  @input
  @hint("Color of the painted line (RGBA)")
  lineColor: vec4 = new vec4(1, 0, 0, 1)

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private lineRenderer: Component | null = null
  private linePoints: vec3[] = []
  private isPainting: boolean = false
  private touchPosition: vec2 = new vec2(0.5, 0.5)
  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("RaycastPainterTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.initializeLineRenderer()

    this.createEvent("TouchStartEvent").bind(this.onTouchStart.bind(this))
    this.createEvent("TouchMoveEvent").bind(this.onTouchMove.bind(this))
    this.createEvent("TouchEndEvent").bind(this.onTouchEnd.bind(this))
  }

  initializeLineRenderer(): void {
    this.lineRenderer = this.getSceneObject().getComponent("Component.RenderMeshVisual")

    if (!this.lineRenderer) {
      this.logger.warn("No line renderer component found. Line drawing will not work.")
    } else {
      this.clearLine()
      this.logger.info("Line renderer initialized")
    }
  }

  onTouchStart(eventData): void {
    this.touchPosition = eventData.getTouchPosition()
    this.startPainting()
  }

  onTouchMove(eventData): void {
    this.touchPosition = eventData.getTouchPosition()
  }

  onTouchEnd(eventData): void {
    this.stopPainting()
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (!this.isPainting) return

    const camera = this.getCamera()
    if (!camera) return

    const rayDir = this.screenPointToWorldDirection(camera, this.touchPosition)
    const rayOrigin = camera.getTransform().getWorldPosition()

    const globalProbe = Physics.createGlobalProbe()
    const self = this

    globalProbe.rayCast(rayOrigin, rayOrigin.add(rayDir.uniformScale(this.raycastDistance)), (hit) => {
      if (hit) {
        const hitObject = hit.collider.getSceneObject()

        if (self.isPaintableObject(hitObject)) {
          self.addPointToLine(hit.position)
        }
      }
    })
  }

  startPainting(): void {
    this.isPainting = true
    this.clearLine()
  }

  addPointToLine(point: vec3): void {
    if (this.linePoints.length === 0 || this.distance(this.linePoints[this.linePoints.length - 1], point) > 0.1) {
      this.linePoints.push(point)
      this.updateLineRenderer()
    }
  }

  stopPainting(): void {
    this.isPainting = false
  }

  clearLine(): void {
    this.linePoints = []

    if (this.lineRenderer) {
      this.logger.info("Line cleared")
    }
  }

  updateLineRenderer(): void {
    if (this.lineRenderer && this.linePoints.length > 0) {
      this.logger.info("Line updated with " + this.linePoints.length + " points")
    }
  }

  isPaintableObject(obj: SceneObject): boolean {
    const objName = obj.name.toLowerCase()
    const pattern = this.paintablePattern.toLowerCase()
    return objName.includes(pattern)
  }

  getCamera(): Camera {
    if (this.playerCamera) {
      return this.playerCamera as Camera
    }
    return (this.getSceneObject().getComponent("Camera") as Camera) || null
  }

  screenPointToWorldDirection(camera: Camera, screenPoint: vec2): vec3 {
    const cameraTransform = camera.getTransform()
    const ndcX = screenPoint.x * 2 - 1
    const ndcY = 1 - screenPoint.y * 2
    const forward = cameraTransform.forward
    const right = cameraTransform.right
    const up = cameraTransform.up
    const direction = forward.add(right.uniformScale(ndcX).add(up.uniformScale(ndcY))).normalize()
    return direction
  }

  distance(a: vec3, b: vec3): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
}
