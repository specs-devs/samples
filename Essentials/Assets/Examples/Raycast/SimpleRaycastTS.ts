/**
 * SPECS Inc. 2027
 * Simple Raycast TS component for the Essentials Glasses lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class SimpleRaycastTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SimpleRaycastTS – perform a simple raycast between two scene objects</span><br/><span style="color: #94A3B8; font-size: 11px;">Casts a ray from rayStart to rayEnd every frame and moves the endpoint attachment to the hit position.</span>')
  @ui.separator

  @input
  @hint("The starting point of the raycast")
  rayStart: SceneObject

  @input
  @hint("The ending point of the raycast")
  rayEnd: SceneObject

  @input
  @hint("Scene object to place at the raycast hit position")
  endPointAttachment: SceneObject

  @input
  @hint("Hide endPointAttachment while the ray hits nothing")
  hideMarkerWhenNoHit: boolean = true

  @input
  @allowUndefined
  @hint("Optional Text that shows what the ray hits and how far away")
  statusText: Text

  @input
  @allowUndefined
  @hint("Optional: only colliders under this object count (UI panels and other content in front are ignored)")
  hitsUnder: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake() {
    this.logger = new Logger("SimpleRaycastTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.logger.debug("EndPointAttachment object defined: " + (this.endPointAttachment !== undefined))
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.debug("EndPointAttachment object at start: " + (this.endPointAttachment !== undefined))
    if (this.endPointAttachment) {
      this.logger.debug("EndPointAttachment object name: " + this.endPointAttachment.name)
    }
  }

  private probe: Probe | null = null
  private lastStatus = ""

  @bindUpdateEvent
  updateObjectMovement() {
    if (!this.rayStart || !this.rayEnd) {
      return
    }
    if (!this.probe) {
      this.probe = Physics.createGlobalProbe()
    }
    const start = this.rayStart.getTransform().getWorldPosition()
    const end = this.rayEnd.getTransform().getWorldPosition()
    this.probe.rayCastAll(start, end, (hits) => {
      const hit = hits.filter((h) => this.counts(h.collider.getSceneObject()))[0]
      if (hit) {
        if (this.endPointAttachment) {
          this.endPointAttachment.enabled = true
          this.endPointAttachment.getTransform().setWorldPosition(hit.position)
        }
        this.setStatus(`Ray hits ${hit.collider.getSceneObject().name} at ${Math.round(hit.position.distance(start))} cm`)
      } else {
        if (this.endPointAttachment && this.hideMarkerWhenNoHit) {
          this.endPointAttachment.enabled = false
        }
        this.setStatus("Ray hits nothing: look at the box")
      }
    })
  }

  /** Whether a hit object counts: anything, or only objects under hitsUnder when it is set. */
  private counts(object: SceneObject): boolean {
    if (!this.hitsUnder) return true
    let current: SceneObject | null = object
    while (current) {
      if (current === this.hitsUnder) return true
      current = current.getParent()
    }
    return false
  }

  private setStatus(value: string) {
    if (this.statusText && value !== this.lastStatus) {
      this.statusText.text = value
      this.lastStatus = value
    }
    if (value !== this.lastLogged) {
      this.logger.info(value)
      this.lastLogged = value
    }
  }

  private lastLogged = ""
}
