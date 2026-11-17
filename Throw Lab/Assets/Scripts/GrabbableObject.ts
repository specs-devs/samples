/**
 * SPECS Inc. 2027
 * Grabbable Object component for the Throw Lab Glasses lens.
 */
import TrackedHand from "InteractionKit.lspkg/Providers/HandInputData/TrackedHand"
import Event from "InteractionKit.lspkg/Utils/Event"
import {InteractionManager} from "InteractionKit.lspkg/Core/InteractionManager/InteractionManager"
import {MatchTransform} from "./MatchTransform"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Makes an object grabbable via pinch or grab gesture.
 * Requires a MatchTransform component and a Physics Body component.
 */
@component
export class GrabbableObject extends BaseScriptComponent {
  // Public events for visual feedback systems
  public onGrabStartEvent: Event = new Event()
  public onGrabEndEvent: Event = new Event()

  @ui.label('<span style="color: #60A5FA;">GrabbableObject – Physics grab and throw with hand tracking</span><br/><span style="color: #94A3B8; font-size: 11px;">Requires a MatchTransform and Physics.BodyComponent on the same object.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Object Settings</span>')
  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Ball", "Ball"),
      new ComboBoxItem("Racket", "Racket"),
      new ComboBoxItem("Darts", "Darts")
    ])
  )
  @hint("Type of object - determines grab behavior and rotation")
  objectType: string = "Ball"

  @input
  @hint("Reference to the MatchTransform component on this object")
  matchTransform: MatchTransform

  @input
  @hint("Time in seconds before destroying the object after it's dropped")
  destroyDelay: number = 4.5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Dart Settings</span>')
  @input
  @hint("For Darts: The dartboard/scoreboard to look at when grabbed")
  @showIf("objectType", "Darts")
  scoreBoard: SceneObject

  @input
  @hint("For Darts: Force applied when releasing (throw strength)")
  @showIf("objectType", "Darts")
  dartThrowForce: number = 800.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Throw Settings</span>')
  @input
  @hint("For Balls: extra speed (cm/s) added along the throw direction on release")
  ballThrowForce: number = 100.0

  @input
  @hint("Balls: throw speed = peak hand speed x this. Darts: hand speed x this is added to the dart force.")
  handVelocityMultiplier: number = 1.6

  @input
  @hint("For Balls: minimum release speed (cm/s), so even a gentle flick flies")
  minThrowSpeed: number = 300

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Racket Settings</span>')
  @input
  @hint("For Racket: while held, keep the racket upright and turned (around Y only) toward the ball launcher")
  @showIf("objectType", "Racket")
  racketFacesBallLauncher: boolean = true

  @input
  @hint("For Racket: small hint shown above the racket (empty = none)")
  @showIf("objectType", "Racket")
  racketHint: string = "Look left and hit the ball coming at you"

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Grab Zone</span>')
  @input
  @hint("Size of the invisible grab zone relative to the physics collider (1 = same size). It is intangible: only the hands use it, throwing and collisions keep the real collider.")
  grabZoneScale: number = 1.8

  @input
  @hint("Minimum extra margin (cm) the grab zone adds around the physics collider, so even small objects are easy to pinch")
  grabZoneMinMargin: number = 3

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private bodyComponent: BodyComponent | null = null
  private colliderComponent: ColliderComponent | null = null
  private isGrabbed: boolean = false
  private destroyEvent: DelayedCallbackEvent | null = null
  private grabbedHand: TrackedHand | null = null
  private updateEvent: SceneEvent | null = null
  private previousHandPosition: vec3 = vec3.zero()
  private handVelocity: vec3 = vec3.zero()
  // Recent hand positions, so the release velocity is the motion over the last ~0.1 s
  // instead of one (noisy, often already slowing) frame.
  private velocitySamples: {pos: vec3; time: number}[] = []
  private readonly velocityWindow = 0.1
  // How far back the release looks for the fastest hand motion: the pinch opens only after the hand
  // has started to slow down, so the speed right at release is much lower than the throw.
  private readonly peakWindow = 0.25
  private ballLauncher: SceneObject | null = null
  private ballLauncherSearched = false
  private hintObject: SceneObject | null = null
  private hintCamera: SceneObject | null = null
  // Set while launch() is still making sure a released object really flies.
  private launching = false
  private launchId = 0
  private lastCollisionTime = -1

  onAwake() {
    this.logger = new Logger("GrabbableObject", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.bodyComponent = this.getSceneObject().getComponent("Physics.BodyComponent")

    if (!this.bodyComponent) {
      this.colliderComponent = this.getSceneObject().getComponent("Physics.ColliderComponent")
    }

    if (!this.matchTransform) {
      this.logger.warn("MatchTransform component is required!")
    }

    if (!this.bodyComponent && !this.colliderComponent) {
      this.logger.warn("Physics Body or Collider component is required!")
    }
    if (this.bodyComponent) {
      this.bodyComponent.onCollisionEnter.add(() => {
        this.lastCollisionTime = getTime()
      })
    }
    this.createGrabZone()
    this.warmUpBody()
    if (this.objectType === "Racket") {
      this.setupRacket()
    }
  }

  /**
   * Adds an intangible collider around the object, larger than its physics collider, that the finger
   * tips detect (GestureManager). The physics collider stays as authored, so throws, bounces and hits
   * don't change; only the hit target for grabbing gets bigger.
   */
  private createGrabZone(): void {
    const source = (this.bodyComponent || this.colliderComponent) as ColliderComponent | null
    if (!source || this.grabZoneScale <= 1) return
    const shape = source.shape as any
    const grow = (value: number) => Math.max(value * this.grabZoneScale, value + this.grabZoneMinMargin)
    let zoneShape: Shape | null = null
    if (shape && shape.radius !== undefined && shape.length !== undefined) {
      const capsule = Shape.createCapsuleShape()
      capsule.axis = shape.axis
      capsule.length = shape.length + 2 * (grow(shape.radius) - shape.radius)
      capsule.radius = grow(shape.radius)
      zoneShape = capsule
    } else if (shape && shape.radius !== undefined) {
      const sphere = Shape.createSphereShape()
      sphere.radius = grow(shape.radius)
      zoneShape = sphere
    } else if (shape && shape.size !== undefined) {
      const box = Shape.createBoxShape()
      box.size = new vec3(grow(shape.size.x), grow(shape.size.y), grow(shape.size.z))
      zoneShape = box
    }
    if (!zoneShape) return
    const zone = global.scene.createSceneObject("GrabZone")
    zone.setParent(this.getSceneObject())
    zone.layer = this.getSceneObject().layer
    const collider = zone.createComponent("Physics.ColliderComponent") as ColliderComponent
    collider.fitVisual = false
    collider.shape = zoneShape
    collider.intangible = true
    // Keep the zone out of the body's compound shape. Otherwise the first time the body turns dynamic
    // (first release) the compound is rebuilt and the throw impulse of that frame is lost.
    collider.excludeFromParentCompounding = true
  }

  /**
   * On device, the FIRST switch of an authored-static body to dynamic does not take effect: the object
   * freezes where it was released (later releases work, after a dynamic -> static -> dynamic cycle).
   * Cycle the body once right after spawn, while it sits in the tool picker, so the first throw is a
   * real throw. The body is dynamic for one frame only.
   */
  private warmUpBody(): void {
    const body = this.bodyComponent
    if (!body || body.dynamic) return
    body.dynamic = true
    const restore = this.createEvent("UpdateEvent")
    restore.bind(() => {
      restore.enabled = false
      if (isNull(body) || this.isGrabbed) return
      // Something else launched it meanwhile (BallInstantiator throws its balls right after spawn).
      if (body.velocity.length > 100) return
      body.dynamic = false
      body.velocity = vec3.zero()
      body.angularVelocity = vec3.zero()
    })
  }

  // ---------------------------------------------------------------------------
  // Racket: upright, facing the ball launcher, with a small hint above it
  // ---------------------------------------------------------------------------

  private setupRacket(): void {
    // The prefab used to carry a LookAt toward the scoreboard; it fights the held rotation.
    this.forEachDescendant(this.getSceneObject(), (obj) => {
      const lookAt = obj.getComponent("Component.LookAtComponent")
      if (lookAt) lookAt.enabled = false
    })
    if (this.racketHint && this.racketHint.length > 0) {
      const hint = global.scene.createSceneObject("RacketHint")
      hint.setParent(this.getSceneObject())
      hint.layer = this.getSceneObject().layer
      hint.getTransform().setLocalPosition(new vec3(0, 40, 0))
      const text = hint.createComponent("Component.Text") as Text
      text.text = this.wrapHint(this.racketHint)
      text.size = 60
      text.horizontalAlignment = HorizontalAlignment.Center
      text.verticalAlignment = VerticalAlignment.Center
      text.textFill.color = new vec4(1, 1, 1, 1)
      this.hintObject = hint
      this.createEvent("UpdateEvent").bind(() => this.faceHintToCamera())
    }
  }

  /** Breaks a long hint into two lines at the space closest to the middle ("\\n" in the input also works). */
  private wrapHint(hint: string): string {
    const explicit = hint.replace(/\\n/g, "\n")
    if (explicit.indexOf("\n") >= 0 || explicit.length <= 24) return explicit
    const mid = explicit.length / 2
    let best = -1
    for (let i = 0; i < explicit.length; i++) {
      if (explicit[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
    }
    return best < 0 ? explicit : explicit.substring(0, best) + "\n" + explicit.substring(best + 1)
  }

  private faceHintToCamera(): void {
    if (!this.hintObject) return
    if (!this.hintCamera) {
      this.hintCamera = this.findSceneObject((obj) => !!obj.getComponent("Component.Camera"))
      if (!this.hintCamera) return
    }
    const t = this.hintObject.getTransform()
    const toCamera = this.hintCamera.getTransform().getWorldPosition().sub(t.getWorldPosition())
    toCamera.y = 0
    if (toCamera.length < 0.001) return
    t.setWorldRotation(quat.lookAt(toCamera.normalize(), vec3.up()))
  }

  /** Where the tennis balls come from: the BallInstantiator's spawn point, found once at runtime. */
  private findBallLauncher(): SceneObject | null {
    if (this.ballLauncherSearched) return this.ballLauncher
    this.ballLauncherSearched = true
    this.findSceneObject((obj) => {
      const scripts = obj.getComponents("Component.ScriptComponent")
      for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i] as any
        if (s && typeof s.spawnBall === "function") {
          this.ballLauncher = s.spawnPosition || obj
          return true
        }
      }
      return false
    })
    return this.ballLauncher
  }

  /** Upright rotation (yaw only) that turns the racket face toward the ball launcher. */
  private racketRotation(): quat | null {
    const launcher = this.findBallLauncher()
    if (!launcher) return null
    const toLauncher = launcher.getTransform().getWorldPosition().sub(this.getSceneObject().getTransform().getWorldPosition())
    toLauncher.y = 0
    if (toLauncher.length < 0.001) return null
    return quat.lookAt(toLauncher.normalize(), vec3.up())
  }

  private findSceneObject(match: (obj: SceneObject) => boolean): SceneObject | null {
    let found: SceneObject | null = null
    const count = global.scene.getRootObjectsCount()
    for (let i = 0; i < count && !found; i++) {
      this.forEachDescendant(global.scene.getRootObject(i), (obj) => {
        if (!found && match(obj)) found = obj
      })
    }
    return found
  }

  private forEachDescendant(obj: SceneObject, fn: (obj: SceneObject) => void): void {
    fn(obj)
    const n = obj.getChildrenCount()
    for (let i = 0; i < n; i++) this.forEachDescendant(obj.getChild(i), fn)
  }

  private resetVelocity(pos: vec3): void {
    this.handVelocity = vec3.zero()
    this.velocitySamples = [{pos: pos, time: getTime()}]
  }

  private sampleVelocity(pos: vec3): void {
    const now = getTime()
    this.velocitySamples.push({pos: pos, time: now})
    while (this.velocitySamples.length > 2 && now - this.velocitySamples[0].time > this.peakWindow + 0.1) {
      this.velocitySamples.shift()
    }
    // Average over the last velocityWindow seconds.
    let oldest = this.velocitySamples[0]
    for (let i = this.velocitySamples.length - 1; i >= 0; i--) {
      oldest = this.velocitySamples[i]
      if (now - oldest.time >= this.velocityWindow) break
    }
    const dt = now - oldest.time
    if (dt > 0.0001) {
      this.handVelocity = pos.sub(oldest.pos).uniformScale(1 / dt)
    }
  }

  /** Fastest hand velocity (measured over ~50-120 ms spans) during the last peakWindow seconds. */
  private peakHandVelocity(): vec3 {
    const samples = this.velocitySamples
    if (samples.length < 2) return this.handVelocity
    const now = samples[samples.length - 1].time
    let best = this.handVelocity
    for (let j = samples.length - 1; j > 0; j--) {
      if (now - samples[j].time > this.peakWindow) break
      for (let i = j - 1; i >= 0; i--) {
        const dt = samples[j].time - samples[i].time
        if (dt < 0.05) continue
        if (dt > 0.12) break
        const v = samples[j].pos.sub(samples[i].pos).uniformScale(1 / dt)
        if (v.length > best.length) best = v
        break
      }
    }
    return best
  }

  private cameraForward(): vec3 {
    if (!this.hintCamera) {
      this.hintCamera = this.findSceneObject((obj) => !!obj.getComponent("Component.Camera"))
    }
    // The camera looks down its -Z axis.
    const fwd = this.hintCamera ? this.hintCamera.getTransform().back : new vec3(0, 0, -1)
    return fwd.add(new vec3(0, 0.15, 0)).normalize()
  }


  /**
   * Turns the body dynamic and throws it, then watches the object's real displacement frame by frame.
   *
   * Reading `body.velocity` back is not proof of a throw: on device a body that just turned dynamic can
   * report the velocity it was given while the physics world still treats it as static, so the object
   * froze or dropped on its first releases. So the velocity is re-applied every frame until the object
   * has really moved at throw speed for two frames in a row. If it still has not after a few frames the
   * body is cycled static -> dynamic once, and as a last resort the flight is driven by script.
   */
  private launch(): void {
    if (!this.bodyComponent) return
    const body = this.bodyComponent
    const transform = this.getSceneObject().getTransform()
    this.leaveInteractableRoster()
    this.letThrowsPassPanels()
    body.dynamic = true
    body.velocity = vec3.zero()
    body.angularVelocity = vec3.zero()
    // Darts are thrown with an impulse (mass dependent); balls with a target velocity.
    let impulse: vec3 | null = null
    let velocity: vec3 | null = null
    if (this.objectType === "Darts" && this.scoreBoard) {
      impulse = this.dartImpulse()
    } else if (this.objectType === "Ball" || !this.grabbedHand) {
      velocity = this.ballVelocity()
    }
    if (!impulse && !velocity) return

    const wantedNow = (): vec3 | null => {
      if (velocity) return velocity
      const mass = body.mass
      if (mass > 0 && mass < 1e9) return impulse.uniformScale(1 / mass)
      return null
    }
    const first = wantedNow()
    if (first) body.velocity = first

    this.launchId++
    const id = this.launchId
    this.launching = true
    const gravity = new vec3(0, -980, 0)
    const launchTime = getTime()
    let previous = transform.getWorldPosition()
    let frames = 0
    let goodFrames = 0
    let badFrames = 0
    let cycled = false
    let scripted: vec3 | null = null
    let scriptedTime = 0
    const done = (why: string) => {
      this.logger.info(`launch: ${why} (frame ${frames})`)
      if (this.launchId === id) this.launching = false
      watch.enabled = false
    }
    const watch = this.createEvent("UpdateEvent")
    watch.bind(() => {
      if (isNull(body) || this.launchId !== id || this.isGrabbed) {
        watch.enabled = false
        return
      }
      // Something else took the body over (a dart that stuck to the board turns static).
      if (!body.dynamic && !cycled) {
        done("body no longer dynamic")
        return
      }
      const dt = Math.max(getDeltaTime(), 0.001)
      frames++
      const position = transform.getWorldPosition()
      const moved = position.distance(previous)

      if (scripted) {
        // Last resort: physics never picked the body up, fly it by script.
        scriptedTime += dt
        scripted = scripted.add(gravity.uniformScale(dt))
        const next = position.add(scripted.uniformScale(dt))
        transform.setWorldPosition(next)
        body.velocity = scripted
        previous = next
        if (scriptedTime > 1.5) done("scripted flight finished")
        return
      }

      const wanted = wantedNow()
      // A contact, or a velocity that is neither the one we set nor zero, means the physics world is
      // simulating the body (it hit or bounced off something): leave it alone from here.
      const reported = body.velocity
      if (
        this.lastCollisionTime >= launchTime ||
        (wanted && reported.length > wanted.length * 0.2 && reported.distance(wanted) > wanted.length * 0.5)
      ) {
        done("physics has the body (contact or deflected)")
        return
      }
      if (!wanted) {
        badFrames++
      } else if (moved >= wanted.length * dt * 0.4) {
        goodFrames++
        if (goodFrames >= 2) {
          done(`moving at ${(moved / dt).toFixed(0)} cm/s`)
          return
        }
      } else {
        goodFrames = 0
        badFrames++
        if (!body.dynamic) body.dynamic = true
        body.velocity = wanted
      }
      previous = position

      if (badFrames === 5 && !cycled) {
        // The world never treated the body as dynamic: cycle it once.
        cycled = true
        body.dynamic = false
        this.logger.info("launch: not moving, cycling the body")
      } else if (badFrames >= 12) {
        const speed = wanted ? wanted : this.cameraForward().uniformScale(this.minThrowSpeed)
        scripted = speed
        this.logger.warn("launch: physics did not pick the body up, flying it by script")
      }
    })
  }


  /**
   * Takes this object's colliders out of any Interactable's collider roster.
   *
   * The tool tray is a UIKit Frame. Its Interactable registers every collider found under the Frame
   * as its own, which includes the tools that are already in the tray when the Frame starts. On
   * device (SpecsInteractionModule) the colliders of an Interactable are kept OUT of the physics
   * simulation unless "Include Colliders In Physics" is on, so those first tools could be picked up
   * but froze in place when released; the replacements spawned later were never registered and flew.
   * The Lens Studio Preview uses the legacy physics runtime, where this does not happen.
   */
  private leaveInteractableRoster(): void {
    const mine: ColliderComponent[] = []
    this.forEachDescendant(this.getSceneObject(), (obj) => {
      const colliders = (obj.getComponents("Physics.ColliderComponent") as ColliderComponent[]).concat(
        obj.getComponents("Physics.BodyComponent") as ColliderComponent[]
      )
      colliders.forEach((collider) => {
        if (!mine.some((known) => known.isSame(collider))) mine.push(collider)
      })
    })
    if (mine.length === 0) return
    try {
      const manager = InteractionManager.getInstance()
      mine.forEach((collider) => {
        const owner = manager.getInteractableByCollider(collider)
        if (!owner) return
        const before = owner.colliders.length
        owner.colliders = owner.colliders.filter((other) => !mine.some((own) => own.isSame(other)))
        manager.notifyInteractableOptionsChanged(owner)
        this.logger.info(
          `left the collider roster of Interactable "${owner.sceneObject.name}" (${before} -> ${owner.colliders.length})`
        )
      })
    } catch (e) {
      this.logger.warn("leaveInteractableRoster: " + e)
    }
  }

  /**
   * Thrown objects must pass through UI panels. Every UIKit Frame (the tool tray, the example panel)
   * owns an interaction plane: an invisible but tangible box collider reaching in front of the panel.
   * An object released near the tray hit that box on its first frames, so the throw was blocked or
   * deflected, and it only flew once it had been carried away from the tray.
   *
   * The panel colliders get a filter that ignores dynamic bodies. Hands, cursors and ray casts are not
   * dynamic bodies, so the panels keep working. (A skipColliders filter on the thrown body was tried
   * first and did not stop these contacts.)
   */
  private letThrowsPassPanels(): void {
    const count = global.scene.getRootObjectsCount()
    for (let i = 0; i < count; i++) {
      this.forEachDescendant(global.scene.getRootObject(i), (obj) => {
        if (obj.name.indexOf("InteractionPlane") !== 0) return
        const owners = obj.getParent() ? [obj, obj.getParent()] : [obj]
        owners.forEach((owner) => {
          const colliders = owner.getComponents("Physics.ColliderComponent") as ColliderComponent[]
          colliders.forEach((collider) => {
            if (collider.filter && collider.filter.includeDynamic === false) return
            const filter = Physics.Filter.create()
            filter.includeDynamic = false
            collider.filter = filter
          })
        })
      })
    }
  }

  /**
   * Called by GestureManager when object is grabbed
   */
  onGrab(hand: TrackedHand) {
    if (this.isGrabbed) return

    this.isGrabbed = true
    this.grabbedHand = hand

    if (this.destroyEvent) {
      this.destroyEvent.cancel()
      this.destroyEvent = null
    }

    const currentWorldPos = this.getSceneObject().getTransform().getWorldPosition()
    const currentWorldRot = this.getSceneObject().getTransform().getWorldRotation()

    this.getSceneObject().setParent(null)

    this.getSceneObject().getTransform().setWorldPosition(currentWorldPos)
    this.getSceneObject().getTransform().setWorldRotation(currentWorldRot)

    if (this.bodyComponent && this.bodyComponent.dynamic) {
      this.bodyComponent.dynamic = false
    }
    // From the grab on, so by the release frame the body is back in the physics simulation and the
    // panels are out of the way.
    this.leaveInteractableRoster()
    this.letThrowsPassPanels()

    if (
      this.matchTransform &&
      this.matchTransform.resetOffset &&
      this.matchTransform.setTarget &&
      this.matchTransform.enableMatching
    ) {
      const afterUnparentPos = this.getSceneObject().getTransform().getWorldPosition()

      this.logger.debug(`After unparent - pos: ${afterUnparentPos}`)
      this.logger.debug(`Hand index tip - pos: ${hand.indexTip.position}`)

      this.matchTransform.resetOffset()

      this.matchTransform.setTarget(hand.indexTip.position, hand.indexTip.rotation)

      this.matchTransform.enableMatching()

      if (this.objectType === "Darts" || (this.objectType === "Racket" && this.racketFacesBallLauncher)) {
        this.matchTransform.disableRotationUpdates()
        this.logger.debug("Rotation updates disabled (set by applyTypeSpecificRotation)")
      } else {
        this.matchTransform.enableRotationUpdates()
      }

      this.logger.debug("MatchTransform enabled with offset initialized")
    } else {
      this.logger.error("MatchTransform not available or missing methods!")
    }

    this.previousHandPosition = hand.indexTip.position
    this.resetVelocity(hand.indexTip.position)
    this.applyTypeSpecificRotation(true)

    // UpdateEvent is created conditionally during grab (not a lifecycle pattern)
    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(this.onUpdateWhileGrabbed.bind(this))

    this.onGrabStartEvent.invoke()

    this.logger.info(`(${this.getSceneObject().name}): Grabbed! Update event created.`)
  }

  private updateCounter = 0

  private onUpdateWhileGrabbed() {
    if (!this.isGrabbed || !this.grabbedHand || !this.matchTransform) {
      return
    }

    if (!this.grabbedHand.isTracked()) {
      this.onRelease()
      return
    }

    const currentHandPos = this.grabbedHand.indexTip.position

    this.sampleVelocity(currentHandPos)

    this.previousHandPosition = currentHandPos

    if (this.matchTransform.setTarget) {
      if (this.objectType === "Ball") {
        this.matchTransform.setTarget(this.grabbedHand.indexTip.position, this.grabbedHand.indexTip.rotation)
      } else if (this.objectType === "Racket") {
        this.matchTransform.setTarget(this.grabbedHand.indexTip.position, this.grabbedHand.wrist.rotation)
      } else {
        this.matchTransform.setTarget(
          this.grabbedHand.indexTip.position,
          this.getSceneObject().getTransform().getWorldRotation()
        )
      }
    }

    this.applyTypeSpecificRotation()

    this.updateCounter++
    if (this.updateCounter % 30 === 0) {
      this.logger.debug(`Setting target to ${this.grabbedHand.indexTip.position}`)
    }
  }

  private applyTypeSpecificRotation(snap: boolean = false) {
    const transform = this.getSceneObject().getTransform()

    if (this.objectType === "Racket" && this.racketFacesBallLauncher) {
      const target = this.racketRotation()
      if (target) {
        const k = snap ? 1 : Math.min(1, 12 * getDeltaTime())
        transform.setWorldRotation(quat.slerp(transform.getWorldRotation(), target, k))
      }
      return
    }

    if (this.objectType === "Darts") {
      if (this.scoreBoard) {
        const boardPos = this.scoreBoard.getTransform().getWorldPosition()
        const myPos = transform.getWorldPosition()
        const directionToBoard = boardPos.sub(myPos).normalize()

        const lookAtRotation = quat.lookAt(directionToBoard, vec3.up())

        const xRotation = quat.angleAxis(90 * MathUtils.DegToRad, vec3.right())
        const finalRotation = lookAtRotation.multiply(xRotation)

        transform.setWorldRotation(finalRotation)
      }
    }
  }

  getGestureType(): "pinch" | "grab" {
    if (this.objectType === "Racket") {
      return "grab"
    }
    return "pinch"
  }

  /**
   * Called by GestureManager when object is released
   */
  onRelease() {
    if (!this.isGrabbed) return

    this.isGrabbed = false

    if (this.updateEvent) {
      this.updateEvent.enabled = false
      this.updateEvent = null
    }

    if (this.matchTransform && this.matchTransform.disableMatching) {
      this.matchTransform.disableMatching()
    }

    this.launch()

    this.grabbedHand = null

    this.handVelocity = vec3.zero()
    this.previousHandPosition = vec3.zero()

    this.scheduleDestroy()

    this.logger.info(`(${this.getSceneObject().name}): Released!`)

    this.logger.debug("Invoking onGrabEndEvent")
    this.onGrabEndEvent.invoke()
  }

  private dartImpulse(): vec3 {

    const myPos = this.getSceneObject().getTransform().getWorldPosition()
    const boardPos = this.scoreBoard.getTransform().getWorldPosition()

    const directionToBoard = boardPos.sub(myPos).normalize()

    let throwStrength = this.handVelocity.length * this.handVelocityMultiplier

    if (throwStrength < 2) {
      throwStrength = this.dartThrowForce
    } else {
      throwStrength += this.dartThrowForce
    }

    this.bodyComponent.angularDamping = 0.95

    this.logger.info(`Throwing dart with strength ${throwStrength.toFixed(1)} towards board`)
    this.logger.debug(`Hand velocity: ${this.handVelocity.length.toFixed(1)}`)

    return directionToBoard.uniformScale(throwStrength)
  }

  /** Release velocity (cm/s) for balls: the peak hand motion, a boost along it, and a minimum speed. */
  private ballVelocity(): vec3 {
    const peak = this.peakHandVelocity()
    const dir = peak.length > 50 ? peak.normalize() : this.cameraForward()
    let velocity = peak.uniformScale(this.handVelocityMultiplier).add(dir.uniformScale(this.ballThrowForce))
    if (velocity.length < this.minThrowSpeed) {
      velocity = dir.uniformScale(this.minThrowSpeed)
    }
    this.logger.info(
      `Throwing ${this.objectType}: peak hand ${peak.length.toFixed(1)} cm/s (at release ${this.handVelocity.length.toFixed(1)}) -> ${velocity.length.toFixed(1)} cm/s`
    )
    return velocity
  }


  private scheduleDestroy() {
    if (this.destroyEvent) {
      this.destroyEvent.cancel()
    }

    this.destroyEvent = this.createEvent("DelayedCallbackEvent")
    this.destroyEvent.bind(() => {
      if (this.objectType === "Darts" && this.scoreBoard) {
        const parent = this.getSceneObject().getParent()
        if (parent === this.scoreBoard) {
          this.logger.debug("Dart stuck to board - skipping destroy")
          return
        }
      }

      this.logger.info("Destroying object after delay")
      this.getSceneObject().destroy()
    })
    this.destroyEvent.reset(this.destroyDelay)
  }

  // ===========================================================================
  // Editor (Preview) direct manipulation
  //
  // The Lens Studio Preview has no hand tracking, so the hand-driven path above
  // (onGrab/onUpdateWhileGrabbed/onRelease + MatchTransform) never runs there.
  // These methods let the GestureManager drive a grab with the mouse: the object
  // stays exactly where it is on grab (like a pinch on device), is moved directly
  // by cursor drag, and is thrown on release reusing the same physics as on-device.
  // ===========================================================================

  private editorPrevPos: vec3 = vec3.zero()

  editorGrab() {
    if (this.isGrabbed) return

    this.isGrabbed = true
    this.grabbedHand = null

    if (this.destroyEvent) {
      this.destroyEvent.cancel()
      this.destroyEvent = null
    }

    const transform = this.getSceneObject().getTransform()
    const worldPos = transform.getWorldPosition()
    const worldRot = transform.getWorldRotation()

    // Unparent so it leaves the tool-picker container, preserving world pose
    // (so it does NOT jump anywhere - it stays exactly where it was grabbed).
    this.getSceneObject().setParent(null)
    transform.setWorldPosition(worldPos)
    transform.setWorldRotation(worldRot)

    if (this.bodyComponent && this.bodyComponent.dynamic) {
      this.bodyComponent.dynamic = false
    }
    // From the grab on, so by the release frame the body is back in the physics simulation and the
    // panels are out of the way.
    this.leaveInteractableRoster()
    this.letThrowsPassPanels()

    this.resetVelocity(worldPos)
    this.editorPrevPos = worldPos

    this.onGrabStartEvent.invoke()
    this.logger.info(`(${this.getSceneObject().name}): Editor grab - holding in place`)
  }

  editorMove(worldPos: vec3) {
    if (!this.isGrabbed) return

    this.sampleVelocity(worldPos)
    this.editorPrevPos = worldPos

    this.getSceneObject().getTransform().setWorldPosition(worldPos)

    // Darts keep aiming at the board while held, matching the on-device behavior.
    this.applyTypeSpecificRotation()
  }

  editorRelease() {
    if (!this.isGrabbed) return

    this.isGrabbed = false

    this.launch()

    this.grabbedHand = null
    this.handVelocity = vec3.zero()

    this.scheduleDestroy()

    this.logger.info(`(${this.getSceneObject().name}): Editor release - thrown`)
    this.onGrabEndEvent.invoke()
  }

  isCurrentlyGrabbed(): boolean {
    return this.isGrabbed
  }

  getCollider(): ColliderComponent | null {
    return this.bodyComponent || this.colliderComponent
  }
}
