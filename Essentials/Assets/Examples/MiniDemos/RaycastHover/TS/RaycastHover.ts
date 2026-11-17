/**
 * SPECS Inc. 2027
 * Raycast Hover TS component for the Essentials Glasses lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import animate from "InteractionKit.lspkg/Utils/animate"

@component
export class RaycastHoverTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">RaycastHoverTS – scale a panel on raycast hover</span><br/><span style="color: #94A3B8; font-size: 11px;">Detects when the ray between two points hits a collider and animates the target panel scale.</span>')
  @ui.separator

  @input
  @hint("The origin SceneObject of the ray")
  rayStart: SceneObject

  @input
  @hint("The destination SceneObject of the ray")
  rayEnd: SceneObject

  @input
  @hint("The panel SceneObject to scale on hover")
  targetPanel: SceneObject

  @input
  @hint("The collider SceneObject to test the ray against")
  targetCollider: SceneObject

  @input
  @hint("Hover tolerance (cm): the ray is swept as a sphere of this radius, so near misses still count. 0 = exact ray.")
  hoverRadius: number = 3

  @input
  @hint("Seconds the ray must stay off the target before the hover ends (stops flicker at the edges)")
  exitDelay: number = 0.25

  @input
  @hint("Duration of the scale animation in milliseconds")
  animationDuration: number = 500

  @input
  @hint("Default scale of the panel when not hovered")
  normalScale: vec3 = new vec3(1, 1, 1)

  @input
  @hint("Expanded scale of the panel when hovered")
  expandedScale: vec3 = new vec3(1.2, 1.2, 1.2)

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private isHovering: boolean = false
  private lastHitName: string = ""
  private lastOnTargetTime: number = -1
  private probe: Probe | null = null
  private logger: Logger

  onAwake() {
    this.logger = new Logger("RaycastHoverTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    if (!this.rayStart || !this.rayEnd) {
      this.logger.error("Ray start and end points must be defined")
      return
    }

    if (!this.targetPanel) {
      this.logger.error("Target panel must be defined")
      return
    }

    if (!this.targetCollider) {
      this.logger.error("Target collider must be defined")
      return
    }
  }

  @bindUpdateEvent
  updateRaycast() {
    if (!this.rayStart || !this.rayEnd || !this.targetCollider) {
      return
    }
    if (!this.probe) {
      this.probe = Physics.createGlobalProbe()
    }
    const start = this.rayStart.getTransform().getWorldPosition()
    const end = this.rayEnd.getTransform().getWorldPosition()
    // Every hit along the ray counts, not only the nearest: another collider in front of the target
    // doesn't break the hover. A sphere sweep (hoverRadius) also accepts near misses.
    const onHits = (hits: RayCastHit[]) => this.onHits(hits)
    if (this.hoverRadius > 0) {
      this.probe.sphereCastAll(this.hoverRadius, start, end, onHits)
    } else {
      this.probe.rayCastAll(start, end, onHits)
    }
  }

  private onHits(hits: RayCastHit[]) {
    const now = getTime()
    const onTarget = hits.some((hit) => {
      const hitObject = hit.collider.getSceneObject()
      return hitObject === this.targetCollider || hitObject.name === this.targetCollider.name
    })
    if (onTarget) {
      this.lastOnTargetTime = now
      if (!this.isHovering) {
        this.lastHitName = this.targetCollider.name
        this.onRaycastEnter()
      }
    } else if (this.isHovering && now - this.lastOnTargetTime > this.exitDelay) {
      this.onRaycastExit()
    }
  }

  onRaycastEnter() {
    this.logger.info("Raycast entered target: " + this.targetCollider.name)
    this.isHovering = true
    this.scaleUp()
  }

  onRaycastExit() {
    this.logger.info("Raycast exited target: " + this.lastHitName)
    this.isHovering = false
    this.scaleDown()
  }

  scaleUp() {
    this.animatePanelScale(this.expandedScale)
  }

  scaleDown() {
    this.animatePanelScale(this.normalScale)
  }

  // LSTween was removed; this uses the native InteractionKit `animate`
  // utility. animate durations are in seconds (LSTween used ms), and its update
  // callback receives the eased progress 0→1 which we use to lerp world scale.
  private scaleCancel: (() => void) | null = null

  private animatePanelScale(target: vec3) {
    const transform = this.targetPanel.getTransform()
    const startScale = transform.getWorldScale()
    const durationSec = this.animationDuration / 1000

    if (this.scaleCancel) {
      this.scaleCancel()
      this.scaleCancel = null
    }

    if (durationSec <= 0) {
      transform.setWorldScale(target)
      return
    }

    this.scaleCancel = animate({
      duration: durationSec,
      easing: "ease-out-cubic",
      update: (k: number) => {
        transform.setWorldScale(vec3.lerp(startScale, target, k))
      },
      ended: () => {
        this.scaleCancel = null
      },
    })
  }
}
