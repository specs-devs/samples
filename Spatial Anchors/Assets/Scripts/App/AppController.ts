import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {AppScreen, AppLifecycleState, CaptureState} from "./AppState"
import {EventBus} from "../Shared/EventBus"
import {UIController} from "../UI/UIController"
import {ScreenFactory} from "../UI/ScreenFactory"
import {StorageController} from "../Storage/StorageController"
import {AnchorController} from "../Anchors/AnchorController"
import {CaptureFlowManager} from "../Anchors/CaptureFlowManager"
import {WidgetController} from "../Widgets/WidgetController"
import {WidgetType} from "../Widgets/WidgetTypes"
import {SnapToSurface} from "../Widgets/Actions/SnapToSurface"
import {AreaInfo} from "../UI/Components/AreaGridBuilder"
import {MAX_AREAS, CAMERA_GAZE_OFFSET, CAPTURE_ANCHOR_FORWARD_DISTANCE, LOCALIZATION_TIMEOUT_MS} from "../Shared/Constants"
import {Anchor} from "Spatial Anchors.lspkg/Anchor"
import {AnchorComponent} from "Spatial Anchors.lspkg/AnchorComponent"


@component
export class AppController extends BaseScriptComponent {

  @ui.label('<span style="color: #60A5FA;">AppController – Main entry point and lifecycle coordinator</span><br/><span style="color: #94A3B8; font-size: 11px;">Attach to a single SceneObject. Wire minimal inspector refs below.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Scene References</span>')

  @input
  @hint("Parent SceneObject for all programmatic UI")
  rootContainer: SceneObject

  @input
  @hint("Parent SceneObject for spawned widgets (has AnchorComponent)")
  widgetParent: SceneObject

  @input
  @hint("World camera reference")
  camera: Camera

  @input
  @hint("WorldQueryModule for surface snapping")
  worldQueryModule: WorldQueryModule

  // ── Widget Prefabs ─────────────────────────────────
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Widget Prefabs</span>')

  @input
  @allowUndefined
  @hint("Prefab for Note Widget (scene object with NoteWidget script)")
  noteWidgetPrefab: ObjectPrefab

  @input
  @allowUndefined
  @hint("Prefab for Watch Widget (scene object with WatchWidget script)")
  watchWidgetPrefab: ObjectPrefab

  @input
  @allowUndefined
  @hint("Prefab for Photo Widget (scene object with PhotoWidget script)")
  photoWidgetPrefab: ObjectPrefab

  // ── Logging ──────────────────────────────────────────
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onDestroy)")
  enableLoggingLifecycle: boolean = false

  // ── Private state ────────────────────────────────────
  private logger: Logger
  private lifecycleState: AppLifecycleState = AppLifecycleState.Idle
  private currentScreen: AppScreen = AppScreen.GetStarted
  private currentAreaName: string | null = null
  private currentAreaId: string | null = null
  private snapToSurfaceActive: boolean = false
  private widgetsRestored: boolean = false
  private isExiting: boolean = false
  private isNewArea: boolean = false
  private captureTimerHelper: SceneObject | null = null
  private captureStartTime: number = 0

  private anchorUnsubscribes: (() => void)[] = []
  private anchorFallbackTimer: SceneObject | null = null

  // Controllers
  private eventBus: EventBus
  private uiController: UIController
  private screenFactory: ScreenFactory
  private storageController: StorageController
  private anchorController: AnchorController
  private captureFlowManager: CaptureFlowManager
  private widgetController: WidgetController
  private snapToSurface: SnapToSurface

  onAwake(): void {
    this.logger = new Logger("AppController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.lifecycleState = AppLifecycleState.Initializing
    this.initializeControllers()
    this.subscribeToEvents()
    this.subscribeToCaptureEvents()
    this.lifecycleState = AppLifecycleState.Ready

    this.logger.info("AppController initialized — GetStarted screen will show after deferred UI init")
  }

  onDestroy(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onDestroy()")
    this.cleanup()
  }

  // ── Public API ───────────────────────────────────────

  getLifecycleState(): AppLifecycleState {
    return this.lifecycleState
  }

  getCurrentScreen(): AppScreen {
    return this.currentScreen
  }

  getCurrentAreaName(): string | null {
    return this.currentAreaName
  }

  // ── Initialization ───────────────────────────────────

  private initializeControllers(): void {
    this.eventBus = EventBus.getInstance(this.logger)
    this.storageController = StorageController.getInstance()
    this.anchorController = AnchorController.getInstance()
    this.captureFlowManager = CaptureFlowManager.getInstance()
    const prefabMap: Record<string, ObjectPrefab> = {}
    if (this.noteWidgetPrefab) prefabMap[WidgetType.Note] = this.noteWidgetPrefab
    if (this.watchWidgetPrefab) prefabMap[WidgetType.Watch] = this.watchWidgetPrefab
    if (this.photoWidgetPrefab) prefabMap[WidgetType.Photo] = this.photoWidgetPrefab
    this.widgetController = new WidgetController(this.widgetParent, this.logger, prefabMap)
    this.snapToSurface = new SnapToSurface(this.worldQueryModule, this.logger)

    // Single UIController: reuse the scene's "UIController" object if present, or a
    // component on this object — do NOT always createComponent (that left the wired
    // UIController uninitialized and built a second orphaned panel stack).
    this.uiController = this.resolveUIController()

    // When snap is active and a new widget is spawned, add it to snap tracking
    this.widgetController.onWidgetAdded.add((widget) => {
      if (!this.snapToSurfaceActive) return

      const frameObj = this.widgetController.getTransformTargetForWidget(widget)
      if (frameObj) {
        this.snapToSurface.repinObject(frameObj)
      }

      const frame = this.widgetController.getFrameForWidget(widget)
      if (frame && frameObj) {
        frame.onTranslationStart.add(() => {
          this.snapToSurface.unpinObject(frameObj)
        })
        frame.onTranslationEnd.add(() => {
          if (this.snapToSurfaceActive) {
            this.snapToSurface.repinObject(frameObj)
          }
        })
      }
    })

    // Defer UI build to allow UIController's onAwake to run
    const initEvent = this.createEvent("OnStartEvent") as OnStartEvent
    initEvent.bind(() => {
      this.uiController.initialize(this.rootContainer)
      this.screenFactory = new ScreenFactory(this.uiController, this.eventBus, this.logger)
      this.screenFactory.buildAllScreens()
      this.navigateTo(AppScreen.GetStarted)
      this.refreshMyAreasGrid()
    })

    if (this.enableLogging) this.logger.debug("Controllers initialized")
  }

  private subscribeToEvents(): void {
    // SideNavigation emits "navigate" with an AppScreen value
    this.eventBus.on<AppScreen>("navigate", (screen) => {
      // "New Area" button emits navigate → Capture. Intercept and go directly to InArea.
      if (screen === AppScreen.Capture) {
        this.prepareNewArea()
        this.isNewArea = true
        this.navigateTo(AppScreen.InArea, this.currentAreaName)
        return
      }
      this.navigateTo(screen)
    })

    // CaptureScreen "Start Capturing" button
    this.eventBus.on("startCapture", () => {
      this.startCapture()
    })

    // CaptureScreen / InCaptureScreen "Exit Capture" button
    this.eventBus.on("exitCapture", () => {
      this.stopCapture()
    })

    // AreaGridBuilder emits "areaSelected" with AreaInfo
    this.eventBus.on<AreaInfo>("areaSelected", (info) => {
      this.handleAreaSelected(info)
    })

    // InAreaScreen widget spawn buttons
    this.eventBus.on<{type: string}>("spawnWidget", (data) => {
      this.spawnWidget(data.type as WidgetType)
    })

    // InAreaScreen "Recall Widgets" button
    this.eventBus.on("recallWidgets", () => {
      this.recallWidgets()
    })

    // InAreaScreen "Snap to Surface" toggle
    this.eventBus.on("toggleSnapToSurface", () => {
      this.toggleSnapToSurface()
    })

    // InAreaScreen "Exit Area" button
    this.eventBus.on("exitArea", () => {
      void this.exitAreaAsync()
    })

    // MyAreasScreen "Delete All Areas" button
    this.eventBus.on("deleteAllAreas", () => {
      this.deleteAllAreas()
    })

    if (this.enableLogging) this.logger.debug("Event subscriptions registered")
  }

  private subscribeToCaptureEvents(): void {
    // Capture completes only after the anchor save succeeds (blocking save).
    // The scanning phase is the capture itself — user scans while on InCapture.
    // Once save finishes, close session and navigate to MyAreas.
    this.captureFlowManager.onCaptureComplete.add(() => {
      void this.onCaptureCompleteAsync()
    })

    this.captureFlowManager.onCaptureTimeout.add(() => {
      void this.onCaptureTimeoutAsync()
    })

    this.captureFlowManager.onStateChanged.add((state: CaptureState) => {
      if (state === CaptureState.Scanning) {
        this.startCaptureTimer()
      }
    })

    // Show mapping quality during capture on the InCapture screen
    this.captureFlowManager.onMappingProgress.add((status) => {
      if (this.currentScreen !== AppScreen.InCapture) return
      const qualityPct = status.quality != null ? Math.round(status.quality * 100) : null
      const sec = Math.floor((Date.now() - this.captureStartTime) / 1000)
      if (qualityPct != null && qualityPct > 0) {
        this.screenFactory?.setCaptureStatus(
          `Mapping… quality ~${qualityPct}% (${sec}s)\nKeep moving slowly; save completes after a checkpoint.`
        )
      } else if (sec > 0 && sec % 15 === 0) {
        this.screenFactory?.setCaptureStatus(
          `Still mapping… (${sec}s)\n` +
            `Quality can read 0% for a long time. Keep walking/panning — the device needs parallax to checkpoint.`
        )
      }
    })

    // Area capacity errors are now handled inside AnchorController with logging
  }

  private async onCaptureCompleteAsync(): Promise<void> {
    this.stopCaptureTimer()
    this.logger.info("Capture complete — anchor in Found state")

    // Area is persisted via the onAnchorSaved handler in subscribeToAnchorEvents
    this.captureFlowManager.reset()
    this.navigateTo(AppScreen.InArea, this.currentAreaName)
  }

  private async onCaptureTimeoutAsync(): Promise<void> {
    this.stopCaptureTimer()
    this.logger.warn("Capture failed — save did not complete")

    await this.anchorController.closeSession()
    this.currentAreaName = null
    this.currentAreaId = null

    this.screenFactory?.setCaptureStatus("Scan failed. Please try again.")
    this.captureFlowManager.reset()
    this.navigateTo(AppScreen.GetStarted)
  }

  /**
   * Prefer the scene root object named "UIController" (how this template is wired),
   * then a UIController on this object; only then create one dynamically.
   */
  private resolveUIController(): UIController {
    const typeName = UIController.getTypeName()
    const onSelf = this.getSceneObject().getComponent(typeName) as UIController | null
    if (onSelf) {
      return onSelf
    }
    const rootCount = global.scene.getRootObjectsCount()
    for (let i = 0; i < rootCount; i++) {
      const root = global.scene.getRootObject(i)
      if (root.name === "UIController") {
        const onRoot = root.getComponent(typeName) as UIController | null
        if (onRoot) {
          return onRoot
        }
      }
    }
    return this.getSceneObject().createComponent(typeName) as UIController
  }

  // ── Anchor Localization Status ────────────────────────

  private subscribeToAnchorEvents(): void {
    this.unsubscribeFromAnchorEvents()

    const unsubFound = this.anchorController.onAnchorFound.add((anchor: Anchor) => {
      this.logger.info(`Area anchor found via scan — id: ${anchor.id}`)
      this.cancelAnchorFallbackTimer()
      this.onAnchorLocalized(anchor)
    })
    this.anchorUnsubscribes.push(unsubFound)

    const unsubLost = this.anchorController.onAnchorLost.add(() => {
      this.logger.warn("Area anchor lost — re-localizing")
      this.screenFactory?.setLocalizationStatus("Area lost — searching again...")
    })
    this.anchorUnsubscribes.push(unsubLost)

    const unsubSaved = this.anchorController.onAnchorSaved.add(() => {
      this.logger.info("Anchor save confirmed — persisting area to storage")
      if (this.currentAreaName && this.currentAreaId) {
        this.storageController.saveArea(this.currentAreaName, this.currentAreaId)
      }
    })
    this.anchorUnsubscribes.push(unsubSaved)
  }

  /**
   * Called when an anchor is localized — either from onAnchorNearby→onFound
   * (re-entry after restart) or from session reuse (after capture).
   * Attaches widgetParent to anchor and restores widgets (once only).
   */
  private onAnchorLocalized(anchor: Anchor): void {
    // CRITICAL: Set widgetParent's world transform to anchor pose IMMEDIATELY,
    // before attaching AnchorComponent (which only updates on next frame via
    // UpdateEvent). This ensures widgets restored below get correct parent
    // coordinates — Frame/InteractableManipulation may capture positions during
    // initialize(), so the parent MUST be at the anchor pose before spawning.
    const pose = anchor.toWorldFromAnchor
    if (pose) {
      this.widgetParent.getTransform().setWorldTransform(pose)
      this.logger.info(`Pre-set widgetParent to anchor pose before restore`)
    } else {
      this.logger.warn(`Anchor ${anchor.id} toWorldFromAnchor is undefined — state: ${anchor.state}`)
    }

    this.attachWidgetParentToAnchor(anchor)
    this.screenFactory?.setLocalizationStatus("Area found!")

    if (!this.widgetsRestored && this.currentAreaName) {
      this.widgetsRestored = true
      this.widgetController.restoreWidgets(this.currentAreaName, this.storageController)
      this.logger.info("Widgets restored after anchor localization")
    }
  }

  /** Attach widgetParent to anchor using AnchorComponent (official API). */
  private attachWidgetParentToAnchor(anchor: Anchor): void {
    // Remove existing AnchorComponent if any
    const typeName = AnchorComponent.getTypeName() as unknown as string
    const existing = this.widgetParent.getComponent(typeName as any)
    if (existing) {
      this.logger.info("Removing existing AnchorComponent from widgetParent")
      existing.destroy()
    }

    // Add AnchorComponent per official docs — ties widgetParent to anchor pose
    const anchorComp = this.widgetParent.createComponent(typeName as any) as AnchorComponent
    anchorComp.anchor = anchor
    this.logger.info(`AnchorComponent attached to widgetParent for anchor ${anchor.id}`)
  }

  /** Remove AnchorComponent from widgetParent. */
  private detachWidgetParentFromAnchor(): void {
    const typeName = AnchorComponent.getTypeName() as unknown as string
    const existing = this.widgetParent.getComponent(typeName as any)
    if (existing) {
      existing.destroy()
      this.logger.info("AnchorComponent removed from widgetParent")
    }
  }

  private unsubscribeFromAnchorEvents(): void {
    this.cancelAnchorFallbackTimer()
    for (const unsub of this.anchorUnsubscribes) {
      unsub()
    }
    this.anchorUnsubscribes = []
  }

  /**
   * Localization timeout: if the anchor isn't found within 15s, inform the user.
   * Matches the old Spatial Persistence sample's LOCALIZATION_TIMEOUT_MS = 15000.
   */
  private startAnchorFallbackTimer(): void {
    this.cancelAnchorFallbackTimer()
    const helper = global.scene.createSceneObject("_anchorFallback")
    this.anchorFallbackTimer = helper
    const sc = helper.createComponent("ScriptComponent") as ScriptComponent
    const evt = sc.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    evt.bind(() => {
      if (this.anchorFallbackTimer === helper) {
        this.anchorFallbackTimer = null
      }
      helper.destroy()

      if (this.widgetsRestored) return
      if (this.currentScreen !== AppScreen.InArea) return
      if (!this.currentAreaName) return

      this.logger.warn("Anchor not found after 15s — localization failed")
      this.screenFactory?.setLocalizationStatus(
        "Could not find the saved area.\nKeep scanning slowly, or go back and try again."
      )
    })
    evt.reset(LOCALIZATION_TIMEOUT_MS / 1000)
  }

  private cancelAnchorFallbackTimer(): void {
    if (this.anchorFallbackTimer) {
      this.anchorFallbackTimer.destroy()
      this.anchorFallbackTimer = null
    }
  }

  // ── Navigation ───────────────────────────────────────

  private navigateTo(screen: AppScreen, areaName?: string): void {
    const prev = this.currentScreen
    this.currentScreen = screen

    if (areaName !== undefined) {
      this.currentAreaName = areaName
    }

    if (this.enableLogging) {
      this.logger.debug(`Navigate: ${prev} → ${screen}` +
        (areaName ? ` (area: ${areaName})` : ""))
    }

    this.uiController?.showScreen(screen)
    this.handleScreenEntry(screen)
  }

  // ── Screen Entry Handlers ────────────────────────────

  private handleScreenEntry(screen: AppScreen): void {
    switch (screen) {
      case AppScreen.GetStarted:
        this.lifecycleState = AppLifecycleState.Ready
        break

      case AppScreen.Capture:
        this.lifecycleState = AppLifecycleState.Ready
        // Generate area ID and pre-open session so mapping warms up
        // while user reads capture instructions (~5-10s).
        if (!this.currentAreaId) {
          this.prepareNewArea()
        }
        if (this.currentAreaId) {
          this.captureFlowManager.prepareSession(this.currentAreaId)
        }
        break

      case AppScreen.InCapture:
        this.lifecycleState = AppLifecycleState.CapturingArea
        break

      case AppScreen.MyAreas:
        this.lifecycleState = AppLifecycleState.Ready
        this.refreshMyAreasGrid()
        break

      case AppScreen.InArea:
        this.lifecycleState = AppLifecycleState.InArea
        this.widgetsRestored = false
        this.logger.info(`InArea entry: area="${this.currentAreaName}", id="${this.currentAreaId}", isNew=${this.isNewArea}`)
        if (this.currentAreaName && this.currentAreaId) {
          if (this.isNewArea) {
            this.isNewArea = false
            void this.enterNewArea()
          } else {
            this.enterExistingArea()
          }
        } else {
          this.logger.warn("InArea entry: missing areaName or areaId — cannot proceed")
        }
        break
    }
  }

  // ── Action Handlers ──────────────────────────────────

  /** Generate area name/ID early so session can open on Capture screen entry. */
  private prepareNewArea(): void {
    const areaCount = this.storageController.getAreaCount()
    if (areaCount >= MAX_AREAS) {
      this.logger.warn("Maximum number of areas reached")
      return
    }
    this.currentAreaName = `Area ${areaCount + 1}`
    this.currentAreaId = "area_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 10)
    this.logger.info(`Prepared new area: "${this.currentAreaName}" → "${this.currentAreaId}"`)
  }

  private startCapture(): void {
    if (this.enableLogging) this.logger.debug("startCapture()")

    if (!this.currentAreaName || !this.currentAreaId) {
      this.logger.error("startCapture: no area prepared — cannot start")
      return
    }

    this.navigateTo(AppScreen.InCapture)

    // Anchor pose: a few units along camera -Z (in front of user)
    const toWorldFromAnchor = this.camera
      .getSceneObject()
      .getTransform()
      .getWorldTransform()
      .mult(mat4.fromTranslation(new vec3(0, 0, -CAPTURE_ANCHOR_FORWARD_DISTANCE)))
    this.captureFlowManager.startCapture(toWorldFromAnchor)
  }

  private stopCapture(): void {
    if (this.enableLogging) this.logger.debug("stopCapture()")
    this.stopCaptureTimer()

    if (this.captureFlowManager.currentState === CaptureState.Scanning) {
      this.captureFlowManager.stopCapture()
    } else {
      // Session was prepared but capture never started — close it
      this.captureFlowManager.cancelPreparedSession()
    }

    this.logger.info("stopCapture: capture cancelled — area was not persisted")
    this.currentAreaName = null
    this.currentAreaId = null

    this.navigateTo(AppScreen.GetStarted)
  }

  private handleAreaSelected(info: AreaInfo): void {
    if (this.enableLogging) this.logger.debug(`areaSelected: ${info.name} (index=${info.index})`)

    if (!info.occupied) {
      // New Area — go directly to InArea. Anchor is created silently in background.
      this.prepareNewArea()
      this.isNewArea = true
      this.navigateTo(AppScreen.InArea, this.currentAreaName)
      return
    }

    // Existing area — enter it and scan for the previously saved anchor
    const areas = this.storageController.getAreas()
    const areaId = areas[info.name]

    if (areaId) {
      this.currentAreaId = areaId
      this.isNewArea = false
      this.navigateTo(AppScreen.InArea, info.name)
    } else {
      this.logger.warn(`Area "${info.name}" occupied but no areaId found in storage`)
    }
  }

  // ── Area Entry ──────────────────────────────────────

  /**
   * New area: uses the old working sample's exact pattern:
   *   selectArea(id, callback) → in callback: createAreaAnchor(pos, rot)
   *   → createWorldAnchor → saveAnchor (chained) → onAnchorFound fires AFTER save
   *
   * The session cueing system handles close→open safely. The user walks around
   * during the save phase (mapping needs visual data). Widgets appear after save.
   */
  private enterNewArea(): void {
    this.logger.info(`Entering NEW area: "${this.currentAreaName}" (${this.currentAreaId})`)
    this.screenFactory?.setLocalizationStatus(
      "Look and move around slowly to map the area.\nWidgets will appear once the area is saved."
    )

    this.storageController.clearWidgets(this.currentAreaName)
    this.subscribeToAnchorEvents()

    const cameraTransform = this.camera.getSceneObject().getTransform()

    this.anchorController.selectArea(this.currentAreaId, () => {
      const offset = cameraTransform.back.uniformScale(CAMERA_GAZE_OFFSET)
      const position = cameraTransform.getWorldPosition().add(offset)
      const rotation = quat.lookAt(vec3.forward(), vec3.up())

      this.anchorController.createAreaAnchor(position, rotation)
      this.logger.info(`New area: anchor create+save started — user must walk around`)

      // Save area mapping to storage so it shows in MyAreas
      const serializedAreas = this.storageController.getAreas()
      if (!(this.currentAreaName in serializedAreas)) {
        this.storageController.saveArea(this.currentAreaName, this.currentAreaId)
      }

      if (global.deviceInfoSystem.isEditor()) {
        this.screenFactory?.setLocalizationStatus("Area ready (editor)")
      }
    })
  }

  /**
   * Existing area: uses the old working sample's pattern:
   *   selectArea(id, callback) → in callback: followSession already subscribed
   *   → onAnchorNearby → onFound → onAnchorLocalized → restore widgets
   */
  private enterExistingArea(): void {
    this.logger.info(`Entering EXISTING area: "${this.currentAreaName}" (${this.currentAreaId})`)
    this.screenFactory?.setLocalizationStatus("Look and move around to help recognize the area.")
    this.subscribeToAnchorEvents()

    this.anchorController.selectArea(this.currentAreaId, () => {
      this.logger.info("Existing area: session ready, waiting for anchor rediscovery via scan...")
      this.startAnchorFallbackTimer()
    })
  }

  private async exitAreaAsync(): Promise<void> {
    if (this.isExiting) {
      this.logger.info("exitArea: already exiting — ignoring")
      return
    }

    if (this.anchorController.isSavePending) {
      this.logger.warn("exitArea: anchor save still in progress — cannot exit yet")
      this.screenFactory?.setLocalizationStatus(
        "Area is still being saved — keep walking around.\nYou can exit once the save completes."
      )
      return
    }

    this.isExiting = true
    this.logger.info("exitArea() — begin")
    this.unsubscribeFromAnchorEvents()

    if (this.currentAreaName) {
      this.widgetController.saveAllWidgets(this.storageController, this.currentAreaName)
      const verified = this.storageController.loadWidgets(this.currentAreaName)
      this.logger.info(`exitArea: saved & verified ${verified.length} widgets for "${this.currentAreaName}"`)
    } else {
      this.logger.warn("exitArea: no currentAreaName — widgets NOT saved")
    }

    // Area was already saved to storage in enterNewArea callback.
    // The anchor save (createAreaAnchor chain) runs independently —
    // closeSession will wait for it via the cue system.

    await this.finishExitArea()
  }

  private async finishExitArea(): Promise<void> {
    this.detachWidgetParentFromAnchor()

    // Do NOT close the session here — the cue system in selectArea handles
    // session lifecycle. Closing here cancels any pending saveAnchor with
    // "tracking cancelled". The old working sample never closes on exit.
    this.logger.info("exitArea: session left open for cue system")

    this.logger.info("exitArea: clearAllWidgets start")
    this.widgetController.clearAllWidgets()
    this.logger.info("exitArea: clearAllWidgets done")

    this.snapToSurface.stopSession()
    this.snapToSurfaceActive = false

    this.widgetsRestored = false
    this.isExiting = false
    this.currentAreaName = null
    this.currentAreaId = null
    this.logger.info("exitArea: navigating to MyAreas")
    this.navigateTo(AppScreen.MyAreas)
  }

  private spawnWidget(type: WidgetType): void {
    if (this.enableLogging) this.logger.debug(`spawnWidget: ${type}`)

    if (!this.currentAreaName) {
      this.logger.error("Cannot spawn widget — no active area")
      return
    }

    if (!this.anchorController.anchor) {
      this.logger.warn("Cannot spawn widget — anchor not saved yet. Keep walking around.")
      this.screenFactory?.setLocalizationStatus(
        "Anchor not ready yet — keep looking and moving around.\nWidgets will be available once the area is saved."
      )
      return
    }

    this.widgetController.spawnWidget(type, this.storageController, this.currentAreaName)
  }

  private recallWidgets(): void {
    if (this.enableLogging) this.logger.debug("recallWidgets()")
    const cameraTransform = this.camera.getSceneObject().getTransform()
    this.widgetController.recallAllWidgets(cameraTransform)
    this.screenFactory?.setRecallActive(this.widgetController.isRecallActive())
  }

  private toggleSnapToSurface(): void {
    this.snapToSurfaceActive = !this.snapToSurfaceActive
    if (this.snapToSurfaceActive) {
      // Start snap session with NO existing widgets — only newly spawned
      // widgets will be added via the onWidgetAdded subscription
      this.snapToSurface.startContinuousSnap([])
      this.logger.info("Snap to Surface: ON — only new widgets will be snapped")
    } else {
      this.snapToSurface.stopContinuousSnap()
      this.logger.info("Snap to Surface: OFF")
    }
    this.screenFactory?.setSnapActive(this.snapToSurfaceActive)
  }

  private deleteAllAreas(): void {
    this.logger.info("deleteAllAreas — clearing all storage")
    this.detachWidgetParentFromAnchor()
    void this.anchorController.closeSession()
    this.storageController.clearAllAreas()
    this.widgetController.clearAllWidgets()
    this.currentAreaName = null
    this.currentAreaId = null
    this.refreshMyAreasGrid()
    this.navigateTo(AppScreen.GetStarted)
  }

  // ── Capture Timer ──────────────────────────────────

  private startCaptureTimer(): void {
    this.stopCaptureTimer()
    this.captureStartTime = Date.now()

    this.captureTimerHelper = global.scene.createSceneObject("_captureTimer")
    const sc = this.captureTimerHelper.createComponent("ScriptComponent") as ScriptComponent
    const evt = sc.createEvent("UpdateEvent") as SceneEvent

    let lastSec = -1
    evt.bind(() => {
      const sec = Math.floor((Date.now() - this.captureStartTime) / 1000)
      if (sec === lastSec) return
      lastSec = sec
      if (sec === 45 || sec === 90 || sec === 120) {
        this.screenFactory?.setCaptureStatus(
          `Still saving map… (${sec}s)\n` +
            `This is normal. Walk 2–3 m, turn, look at floor and walls — SLAM needs motion, not standing still.`
        )
      } else if (sec > 0 && sec % 10 === 0) {
        this.screenFactory?.setCaptureStatus(
          `Mapping for save… (${sec}s)\n` +
            `Move slowly; the lens waits for a device mapping checkpoint before it can store the area.`
        )
      }
    })
  }

  private stopCaptureTimer(): void {
    if (this.captureTimerHelper) {
      this.captureTimerHelper.destroy()
      this.captureTimerHelper = null
    }
  }

  // ── Helpers ──────────────────────────────────────────

  private refreshMyAreasGrid(): void {
    const areas = this.storageController.getAreas()
    const areaNames = Object.keys(areas)
    const areaInfos: AreaInfo[] = []

    for (let i = 0; i < areaNames.length; i++) {
      areaInfos.push({index: i, name: areaNames[i], occupied: true})
    }

    this.screenFactory?.refreshMyAreas(areaInfos)
  }

  // ── Cleanup ──────────────────────────────────────────

  private cleanup(): void {
    this.stopCaptureTimer()
    this.eventBus.removeAllListeners()
    void this.anchorController?.closeSession()
    this.widgetController?.clearAllWidgets()
    this.snapToSurface?.stopSession()
    if (this.enableLogging) this.logger.debug("Cleanup complete")
  }
}
