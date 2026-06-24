/**
 * Specs Inc. 2026
 * Raycast Color Changer TS component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class RaycastColorChangerTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">RaycastColorChangerTS – change material color on raycast touch</span><br/><span style="color: #94A3B8; font-size: 11px;">Fires a ray on touch and randomizes the material color of the first paintable object hit.</span>')
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
  @hint("Whether colors should change continuously or only once per touch")
  continuousPainting: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private isPainting: boolean = false
  private touchPosition: vec2 = new vec2(0.5, 0.5)
  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("RaycastColorChangerTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.createEvent("TouchStartEvent").bind(this.onTouchStart.bind(this))
    this.createEvent("TouchMoveEvent").bind(this.onTouchMove.bind(this))
    this.createEvent("TouchEndEvent").bind(this.onTouchEnd.bind(this))
  }

  onTouchStart(eventData): void {
    this.touchPosition = eventData.getTouchPosition()
    this.startPainting()
  }

  onTouchMove(eventData): void {
    this.touchPosition = eventData.getTouchPosition()
  }

  onTouchEnd(eventData): void {
    if (this.continuousPainting) {
      this.stopPainting()
    }
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
          self.changeMaterialColor(hitObject)

          if (!self.continuousPainting) {
            self.stopPainting()
          }
        }
      }
    })
  }

  startPainting(): void {
    this.isPainting = true
  }

  stopPainting(): void {
    this.isPainting = false
  }

  changeMaterialColor(hitObject: SceneObject): void {
    const objectRenderer = hitObject.getComponent("Component.RenderMeshVisual")

    if (objectRenderer) {
      const randomColor = new vec4(Math.random(), Math.random(), Math.random(), 1.0)

      try {
        const material = (objectRenderer as any).getMaterial()
        if (material) {
          if (material.mainPass) {
            material.mainPass.baseColor = randomColor
            this.logger.info("Changed color of object: " + hitObject.name)
          }
        } else {
          this.logger.warn("Could not access material for " + hitObject.name)
        }
      } catch (e) {
        this.logger.error("Error changing material color: " + e)
        ;(objectRenderer as any).baseColor = randomColor
      }
    } else {
      this.logger.warn("No renderer component found on object: " + hitObject.name)
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
}
