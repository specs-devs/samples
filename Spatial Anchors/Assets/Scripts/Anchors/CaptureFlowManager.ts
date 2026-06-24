/**
 * Manages the capture lifecycle matching the working Spatial Anchors pattern:
 * 1. Session opens EARLY (on Capture screen entry) — mapping warms up
 * 2. User sees capture instructions while mapping collects data (~5-10s)
 * 3. On "Start Capture", creates anchor + awaits saveAnchor (blocking)
 *    — save succeeds because mapping already has checkpoint data
 * 4. Fallback timer ensures capture completes even if save hangs
 *
 * This matches the minimum example where the session opens at startup and
 * saveAnchor is called much later, after mapping has had time to checkpoint.
 */
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {Anchor} from "Spatial Anchors.lspkg/Anchor"
import {AnchorController} from "./AnchorController"
import {CaptureState} from "../App/AppState"

/**
 * Fallback timeout (seconds) after anchor creation.
 * If saveAnchor hasn't completed by then, capture finishes anyway.
 * Set high (90s) to give the mapping system enough time — the save MUST
 * complete for the anchor to exist on re-entry.
 */
const CAPTURE_FALLBACK_TIMEOUT_SEC = 90

export class CaptureFlowManager {
  private static instance: CaptureFlowManager

  private logger: Logger
  private anchorController: AnchorController

  private state: CaptureState = CaptureState.Idle
  private preparedAreaId: string | null = null

  // Events
  private onCaptureCompleteEvent: Event<void> = new Event<void>()
  readonly onCaptureComplete: PublicApi<void> = this.onCaptureCompleteEvent.publicApi()

  private onCaptureTimeoutEvent: Event<void> = new Event<void>()
  readonly onCaptureTimeout: PublicApi<void> = this.onCaptureTimeoutEvent.publicApi()

  private onStateChangedEvent: Event<CaptureState> = new Event<CaptureState>()
  readonly onStateChanged: PublicApi<CaptureState> = this.onStateChangedEvent.publicApi()

  private onMappingProgressEvent: Event<{quality?: number, capacityUsed?: number}> = new Event<{quality?: number, capacityUsed?: number}>()
  readonly onMappingProgress: PublicApi<{quality?: number, capacityUsed?: number}> = this.onMappingProgressEvent.publicApi()

  private mappingStatusUnsub: (() => void) | null = null
  private saveCompleteUnsub: (() => void) | null = null
  private fallbackTimerObj: SceneObject | null = null

  /** World anchor created for this capture; removed after save, or deleted on cancel/failure. */
  private pendingAnchor: Anchor | null = null

  private constructor() {
    this.logger = new Logger("CaptureFlowManager", true, true)
    this.anchorController = AnchorController.getInstance()
  }

  static getInstance(): CaptureFlowManager {
    if (CaptureFlowManager.instance) {
      return CaptureFlowManager.instance
    }
    CaptureFlowManager.instance = new CaptureFlowManager()
    return CaptureFlowManager.instance
  }

  /** Current capture state. */
  get currentState(): CaptureState {
    return this.state
  }

  /**
   * Opens the anchor session early so mapping can warm up.
   * Call this when the user enters the Capture screen — BEFORE they press Start Capture.
   * The mapping system starts collecting data immediately.
   */
  async prepareSession(areaId: string): Promise<void> {
    this.preparedAreaId = areaId
    this.logger.info(`Preparing session for area "${areaId}"`)

    await this.anchorController.startSession(areaId)
    this.logger.info(`Session prepared for "${areaId}"`)
  }

  /**
   * Starts the capture: creates anchor and saves it.
   * The session must already be open via prepareSession().
   * Uses blocking saveAnchor — the mapping system should have enough data by now.
   * Fallback timer ensures completion if save still hangs.
   */
  async startCapture(toWorldFromAnchor: mat4): Promise<void> {
    if (this.state === CaptureState.Scanning) {
      this.logger.warn("Capture already in progress — ignoring startCapture call")
      return
    }

    if (!this.anchorController.hasActiveSession) {
      this.logger.error("No active session — call prepareSession first")
      return
    }

    this.setState(CaptureState.Scanning)
    this.pendingAnchor = null
    this.logger.info("Starting capture (session already warmed up)")

    // Listen for save completion
    this.unsubSaveComplete()
    this.saveCompleteUnsub = this.anchorController.onAnchorSaved.add((savedAnchor) => {
      if (this.currentState !== CaptureState.Scanning) {
        this.logger.info("Save completed but capture no longer scanning — ignoring")
        return
      }
      this.logger.info(`Anchor SAVED — capture complete, id: ${savedAnchor.id}`)
      this.completeCapture()
    })

    try {
      const anchor = await this.anchorController.createAnchorAtWorldPose(toWorldFromAnchor)

      if (!anchor) {
        this.logger.warn("Anchor creation returned null — aborting capture")
        this.cleanupCapture()
        this.setState(CaptureState.Idle)
        return
      }

      if (this.currentState !== CaptureState.Scanning) {
        this.logger.info("Capture was cancelled during anchor creation")
        return
      }

      this.pendingAnchor = anchor
      this.logger.info(`Anchor created (Found state) — id: ${anchor.id}. Saving...`)

      // Fire-and-forget save with fallback timer.
      // With session pre-warmed, the save should complete quickly.
      // Fallback timer catches edge cases where it still hangs.
      this.anchorController.saveAnchorInBackground(anchor)
      this.startFallbackTimer()

    } catch (e) {
      this.cleanupCapture()
      if (this.currentState !== CaptureState.Scanning) {
        this.logger.info("Capture error after cancellation — ignoring")
        this.pendingAnchor = null
        return
      }
      await this.deletePendingAnchorQuietly()
      this.setState(CaptureState.Idle)
      this.logger.error(`Failed during capture: ${e}`)
    }
  }

  /** Cancels an in-progress capture: delete unsaved world anchor, then close session. */
  stopCapture(): void {
    if (this.currentState !== CaptureState.Scanning) {
      return
    }
    this.cleanupCapture()
    const toDelete = this.pendingAnchor
    this.pendingAnchor = null
    this.setState(CaptureState.Cancelled)
    this.logger.info("Capture cancelled by user")
    void this.finishStopCapture(toDelete)
  }

  /** Closes any prepared session without capturing. */
  async cancelPreparedSession(): Promise<void> {
    this.cleanupCapture()
    this.preparedAreaId = null
    if (this.anchorController.hasActiveSession) {
      await this.anchorController.closeSession()
      this.logger.info("Prepared session closed (no capture)")
    }
  }

  /** Resets the capture state back to Idle so a new capture can begin. */
  reset(): void {
    this.cleanupCapture()
    this.pendingAnchor = null
    this.preparedAreaId = null
    this.setState(CaptureState.Idle)
  }

  private async finishStopCapture(anchor: Anchor | null): Promise<void> {
    if (!global.deviceInfoSystem.isEditor() && anchor) {
      try {
        await this.anchorController.deleteAnchor(anchor)
      } catch (err) {
        this.logger.warn(`deleteAnchor on cancel (session may already be closing): ${err}`)
      }
    }
    await this.anchorController.closeSession()
  }

  private async deletePendingAnchorQuietly(): Promise<void> {
    const a = this.pendingAnchor
    this.pendingAnchor = null
    if (!a || global.deviceInfoSystem.isEditor()) return
    try {
      await this.anchorController.deleteAnchor(a)
    } catch (err) {
      this.logger.warn(`deletePendingAnchorQuietly: ${err}`)
    }
  }

  // -------------------------------------------------------
  // Internals
  // -------------------------------------------------------

  private completeCapture(): void {
    if (this.currentState !== CaptureState.Scanning) return
    this.cleanupCapture()
    this.pendingAnchor = null
    this.setState(CaptureState.Complete)
    this.onCaptureCompleteEvent.invoke()
  }

  private startFallbackTimer(): void {
    this.cancelFallbackTimer()
    const helper = global.scene.createSceneObject("_captureFallback")
    this.fallbackTimerObj = helper
    const sc = helper.createComponent("ScriptComponent") as ScriptComponent
    const evt = sc.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    evt.bind(() => {
      if (this.fallbackTimerObj === helper) {
        this.fallbackTimerObj = null
      }
      helper.destroy()
      if (this.currentState !== CaptureState.Scanning) return
      const savePending = this.anchorController.isSavePending
      this.logger.info(
        `Fallback timer fired (${CAPTURE_FALLBACK_TIMEOUT_SEC}s) — completing capture. ` +
        `Save still pending: ${savePending}. Anchor is usable (Found state).`
      )
      this.completeCapture()
    })
    evt.reset(CAPTURE_FALLBACK_TIMEOUT_SEC)
  }

  private cancelFallbackTimer(): void {
    if (this.fallbackTimerObj) {
      this.fallbackTimerObj.destroy()
      this.fallbackTimerObj = null
    }
  }

  private cleanupCapture(): void {
    this.unsubMappingStatus()
    this.unsubSaveComplete()
    this.cancelFallbackTimer()
  }

  private setState(newState: CaptureState): void {
    if (this.state === newState) return
    this.state = newState
    this.onStateChangedEvent.invoke(newState)
  }

  private unsubMappingStatus(): void {
    if (this.mappingStatusUnsub) {
      this.mappingStatusUnsub()
      this.mappingStatusUnsub = null
    }
  }

  private unsubSaveComplete(): void {
    if (this.saveCompleteUnsub) {
      this.saveCompleteUnsub()
      this.saveCompleteUnsub = null
    }
  }
}
