import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {EventBus} from "../Shared/EventBus"
import {AppScreen} from "../App/AppState"

// Re-export so downstream UI files can import from UIController
export {AppScreen}

/** Target inner-size for each screen's Frame. */
const SCREEN_SIZES: Record<AppScreen, vec2> = {
  [AppScreen.GetStarted]: new vec2(33, 14),
  [AppScreen.Capture]: new vec2(33, 20),
  [AppScreen.InCapture]: new vec2(33, 20),
  [AppScreen.MyAreas]: new vec2(33, 25),
  [AppScreen.InArea]: new vec2(30, 22),
}

const TRANSITION_DURATION = 0.4

@component
export class UIController extends BaseScriptComponent {
  // ── Header ─────────────────────────────────────────────────
  @ui.label('<span style="color: #60A5FA;">UIController – Screen state machine & navigation</span><br/><span style="color: #94A3B8; font-size: 11px;">No inspector inputs — call initialize(rootContainer) from AppController.</span>')
  @ui.separator

  // ── Logging ────────────────────────────────────────────────
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  // ── Private state ──────────────────────────────────────────
  private logger: Logger
  private eventBus: EventBus
  private rootContainer: SceneObject
  private frameObj: SceneObject
  private frame: Frame
  private cancelSet: CancelSet = new CancelSet()
  private currentScreen: AppScreen | null = null
  private screenContainers: Map<AppScreen, SceneObject> = new Map()
  private initialized: boolean = false

  // ── Lifecycle ──────────────────────────────────────────────

  onAwake(): void {
    this.logger = new Logger("UIController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.eventBus = EventBus.getInstance()
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Called by AppController after scene setup.
   * Creates the shared Frame and prepares screen containers.
   */
  initialize(rootContainer: SceneObject): void {
    if (this.initialized) {
      this.logger.warn("UIController.initialize() called more than once — ignoring")
      return
    }
    this.rootContainer = rootContainer
    this.createFrame()
    this.createScreenContainers()
    this.initialized = true
    this.logger.debug("Initialized")
  }

  /** Returns the ScreenObject container for a given screen so ScreenFactory can populate it. */
  getScreenContainer(screen: AppScreen): SceneObject | undefined {
    return this.screenContainers.get(screen)
  }

  /** Returns the Frame component for screens that need direct access (e.g. InArea floating panel). */
  getFrame(): Frame {
    return this.frame
  }

  /** Navigate to a screen with animated Frame transition. */
  showScreen(screen: AppScreen): void {
    if (!this.initialized) {
      this.logger.error("showScreen() called before initialize()")
      return
    }
    if (screen === this.currentScreen) return

    const previous = this.currentScreen
    this.logger.debug(`Transition: ${previous ?? "none"} → ${screen}`)

    // Hide previous screen container
    if (previous !== null) {
      const prevContainer = this.screenContainers.get(previous)
      if (prevContainer) prevContainer.enabled = false
    }

    // Show target screen container
    const targetContainer = this.screenContainers.get(screen)
    if (targetContainer) targetContainer.enabled = true

    // Animate Frame size
    this.animateToSize(SCREEN_SIZES[screen])

    this.currentScreen = screen
    this.eventBus.emit("screenChanged", screen)
  }

  getCurrentScreen(): AppScreen | null {
    return this.currentScreen
  }

  // ── Internal ───────────────────────────────────────────────

  private createFrame(): void {
    this.frameObj = global.scene.createSceneObject("UIFrame")
    this.frameObj.setParent(this.rootContainer)
    this.frame = this.frameObj.createComponent(Frame.getTypeName()) as Frame
    // Set @input properties BEFORE initialize()
    ;(this.frame as any).autoShowHide = false
    ;(this.frame as any).useBillboarding = true
    ;(this.frame as any).yOnTranslate = true
    ;(this.frame as any).xOnTranslate = true
    this.frame.initialize()
    // Enable follow behavior AFTER initialize() via public methods
    this.frame.setUseFollow(true)
    this.frame.setFollowing(true)
    this.frame.allowScaling = false
    this.frame.innerSize = SCREEN_SIZES[AppScreen.GetStarted]
    this.frame.showVisual()
    // Offset the panel down by 10
    this.frameObj.getTransform().setLocalPosition(new vec3(0, -15, 0))
    this.logger.info(
      `UIFrame POST-INIT: ` +
      `autoShowHide=${(this.frame as any).autoShowHide}, ` +
      `allowTranslation=${this.frame.allowTranslation}, ` +
      `allowScaling=${this.frame.allowScaling}, ` +
      `innerSize=${this.frame.innerSize}, ` +
      `initialized=${(this.frame as any)._initialized}, ` +
      `collider=${this.frame.collider?.enabled}, ` +
      `interactable=${(this.frame as any)._interactable?.enabled}`
    )
  }

  private createScreenContainers(): void {
    for (const screen of Object.values(AppScreen)) {
      const container = global.scene.createSceneObject(`Screen_${screen}`)
      container.setParent(this.frameObj)
      container.enabled = false
      this.screenContainers.set(screen as AppScreen, container)
    }
    this.logger.debug(`Created ${this.screenContainers.size} screen containers`)
  }

  private animateToSize(targetSize: vec2): void {
    this.cancelSet.cancel()
    const startSize = this.frame.innerSize

    const dx = startSize.x - targetSize.x
    const dy = startSize.y - targetSize.y
    if (Math.sqrt(dx * dx + dy * dy) < 0.01) return

    animate({
      duration: TRANSITION_DURATION,
      cancelSet: this.cancelSet,
      easing: "ease-in-out-cubic",
      update: (t: number) => {
        this.frame.innerSize = vec2.lerp(startSize, targetSize, t)
      },
    })
  }
}
