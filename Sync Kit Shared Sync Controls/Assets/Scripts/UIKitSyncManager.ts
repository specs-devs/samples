/**
 * Specs Inc. 2026
 * UIKit Sync Manager – demonstrates syncing UIKit Slider, TextInputField, and
 * RectangleButton across a Connected Lens session.
 *
 * Drop this component on any SceneObject and wire up the @input references
 * in the Inspector. It creates (or joins) a shared GeneralDataStore and keeps
 * all UI elements in sync across every user in the session.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {SessionController} from "SpectaclesSyncKit.lspkg/Core/SessionController"
import {Slider} from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider"
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {TextInputField} from "SpectaclesUIKit.lspkg/Scripts/Components/TextInputField/TextInputField"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

// ─── Store key constants ─────────────────────────────────────────────────────

const STORE_ID = "UIKitSyncManager"

const StoreKey = {
  COLOR_R: "COLOR_R",
  COLOR_G: "COLOR_G",
  COLOR_B: "COLOR_B",
  SYNC_TEXT: "SYNC_TEXT",
  BUTTON_TEXT: "BUTTON_TEXT",
} as const

type StoreKeyType = (typeof StoreKey)[keyof typeof StoreKey]

// ─── Component ───────────────────────────────────────────────────────────────

@component
export class UIKitSyncManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">UIKit Sync Manager</span>')
  @ui.label(
    '<span style="color: #94A3B8; font-size: 11px;">Syncs UIKit Sliders, TextInputField, and RectangleButton across a Connected Lens session.</span>'
  )
  @ui.separator

  // ─── Panel Root ───────────────────────────────────────────────────────────

  @ui.label('<span style="color: #60A5FA;">Panel</span>')
  @input
  @hint("Root SceneObject of the UI panel – disabled at start, enabled once the session is ready")
  panelRoot: SceneObject

  // ─── Sliders ──────────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Color Sliders</span>')
  @input
  @hint("UIKit Slider for the Red channel (0–1)")
  sliderR: Slider

  @input
  @hint("UIKit Slider for the Green channel (0–1)")
  sliderG: Slider

  @input
  @hint("UIKit Slider for the Blue channel (0–1)")
  sliderB: Slider

  // ─── Color Target ─────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Color Target</span>')
  @input
  @hint("RenderMeshVisual whose mainMaterial.mainPass.baseColor is driven by the sliders")
  colorMesh: RenderMeshVisual

  // ─── Text Input ───────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Sync Text</span>')
  @input
  @hint("UIKit TextInputField whose content is synced across the session")
  inputField: TextInputField

  // ─── Sync Button ──────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Sync Button</span>')
  @input
  @hint("UIKit RectangleButton that broadcasts a click event to all users")
  syncButton: RectangleButton

  @input
  @hint('Text component on the sync button – updated with the last-clicking user label e.g. "User A Clicked"')
  syncButtonText: Text

  // ─── Logging ──────────────────────────────────────────────────────────────

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  // ─── Private state ────────────────────────────────────────────────────────

  private logger: Logger

  private realtimeStore: GeneralDataStore | null = null
  private isNewStore: boolean = false

  /** Label used when this user presses the sync button ("User A" or "User B"). */
  private userLabel: string = "User A"

  /**
   * Guards to prevent a programmatic slider update from echoing back into the
   * store. Each element corresponds to [R, G, B].
   */
  private sliderGuard: [number, number, number] = [0, 0, 0]

  /** Same guard for the text input field. */
  private textGuard: number = 0

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  onAwake(): void {
    this.logger = new Logger("UIKitSyncManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    if (this.panelRoot) this.panelRoot.enabled = false
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    SessionController.getInstance().notifyOnReady(() => this.onSessionReady())
  }

  // ─── Session setup ────────────────────────────────────────────────────────

  private onSessionReady(): void {
    this.logger.info("Session ready – locating realtime store")
    this.createOrFindStore(() => this.onStoreReady())
  }

  private onStoreReady(): void {
    if (this.isNewStore) {
      // First user in the session: seed the store with current UI values.
      this.userLabel = "User A"
      this.realtimeStore.putFloat(StoreKey.COLOR_R, this.sliderR?.currentValue ?? 0)
      this.realtimeStore.putFloat(StoreKey.COLOR_G, this.sliderG?.currentValue ?? 0)
      this.realtimeStore.putFloat(StoreKey.COLOR_B, this.sliderB?.currentValue ?? 0)
      this.realtimeStore.putString(StoreKey.SYNC_TEXT, this.inputField?.text ?? "")
      this.realtimeStore.putString(StoreKey.BUTTON_TEXT, "Click to Sync!")
    } else {
      // Joining user: pull existing values into the local UI.
      this.userLabel = "User B"
      this.applyColorFromStore()
      this.applyTextFromStore()
      this.applyButtonTextFromStore()
    }

    // Subscribe to remote changes.
    SessionController.getInstance().onRealtimeStoreUpdated.add(this.onStoreUpdated)

    // Wire UIKit Sliders.
    this.sliderR?.onValueChange.add((v) => this.onSliderChanged(0, v))
    this.sliderG?.onValueChange.add((v) => this.onSliderChanged(1, v))
    this.sliderB?.onValueChange.add((v) => this.onSliderChanged(2, v))

    // Wire UIKit TextInputField.
    this.inputField?.onTextChanged.add((text) => this.onInputTextChanged(text))

    // Wire UIKit RectangleButton.
    this.syncButton?.onTriggerUp.add(() => this.onSyncButtonPressed())

    if (this.panelRoot) this.panelRoot.enabled = true
    this.logger.info(`Store ready – this user is "${this.userLabel}"`)
  }

  // ─── Slider handling ──────────────────────────────────────────────────────

  private onSliderChanged(channel: 0 | 1 | 2, value: number): void {
    if (this.sliderGuard[channel] > 0) {
      this.sliderGuard[channel]--
      return
    }

    const keys: StoreKeyType[] = [StoreKey.COLOR_R, StoreKey.COLOR_G, StoreKey.COLOR_B]
    this.realtimeStore?.putFloat(keys[channel], value)
    this.applyColorToTargets()
    this.logger.info(`Slider ${["R", "G", "B"][channel]} → ${value.toFixed(3)}`)
  }

  /** Set a slider value programmatically without triggering an echo into the store. */
  private setSlider(channel: 0 | 1 | 2, value: number): void {
    this.sliderGuard[channel]++
    const sliders = [this.sliderR, this.sliderG, this.sliderB]
    if (sliders[channel]) sliders[channel].currentValue = value
    this.applyColorToTargets()
  }

  private applyColorToTargets(): void {
    const r = this.sliderR?.currentValue ?? 0
    const g = this.sliderG?.currentValue ?? 0
    const b = this.sliderB?.currentValue ?? 0
    const color = new vec4(r, g, b, 1)

    if (this.colorMesh) {
      this.colorMesh.mainMaterial.mainPass.baseColor = color
    }
  }

  private applyColorFromStore(): void {
    this.setSlider(0, this.realtimeStore.getFloat(StoreKey.COLOR_R))
    this.setSlider(1, this.realtimeStore.getFloat(StoreKey.COLOR_G))
    this.setSlider(2, this.realtimeStore.getFloat(StoreKey.COLOR_B))
  }

  // ─── Text input handling ──────────────────────────────────────────────────

  private onInputTextChanged(text: string): void {
    if (this.textGuard > 0) {
      this.textGuard--
      return
    }
    this.realtimeStore?.putString(StoreKey.SYNC_TEXT, text)
    this.logger.info(`Text changed → "${text}"`)
  }

  private applyTextFromStore(): void {
    const text = this.realtimeStore.getString(StoreKey.SYNC_TEXT)
    if (this.inputField && this.inputField.text !== text) {
      this.textGuard++
      this.inputField.text = text
    }
  }

  // ─── Button handling ──────────────────────────────────────────────────────

  private onSyncButtonPressed(): void {
    const label = `${this.userLabel} Clicked`
    this.realtimeStore?.putString(StoreKey.BUTTON_TEXT, label)
    this.setSyncButtonText(label)
    this.logger.info(`Sync button pressed → "${label}"`)
  }

  private setSyncButtonText(text: string): void {
    if (this.syncButtonText) this.syncButtonText.text = text
  }

  private applyButtonTextFromStore(): void {
    const text = this.realtimeStore.getString(StoreKey.BUTTON_TEXT)
    if (text) this.setSyncButtonText(text)
  }

  // ─── Remote store update handler ──────────────────────────────────────────

  private onStoreUpdated = (
    _session: MultiplayerSession,
    store: GeneralDataStore,
    key: string,
    updateInfo: ConnectedLensModule.RealtimeStoreUpdateInfo
  ): void => {
    // Ignore updates that originated from this device.
    const localId = SessionController.getInstance().getLocalUserInfo().connectionId
    if (updateInfo.updaterInfo.connectionId === localId) return

    switch (key as StoreKeyType) {
      case StoreKey.COLOR_R:
        this.setSlider(0, store.getFloat(key))
        break
      case StoreKey.COLOR_G:
        this.setSlider(1, store.getFloat(key))
        break
      case StoreKey.COLOR_B:
        this.setSlider(2, store.getFloat(key))
        break
      case StoreKey.SYNC_TEXT: {
        const text = store.getString(key)
        if (this.inputField && this.inputField.text !== text) {
          this.textGuard++
          this.inputField.text = text
        }
        break
      }
      case StoreKey.BUTTON_TEXT:
        this.setSyncButtonText(store.getString(key))
        break
    }
  }

  // ─── Store lifecycle ──────────────────────────────────────────────────────

  private createOrFindStore(onReady: () => void): void {
    const session = SessionController.getInstance().getSession()

    // Look for an existing store with this ID.
    for (const store of session.allRealtimeStores) {
      if (session.getRealtimeStoreInfo(store).storeId === STORE_ID) {
        this.realtimeStore = store
        this.isNewStore = false
        this.logger.info("Found existing realtime store")
        onReady()
        return
      }
    }

    // None found – create a new persistent unowned store.
    this.isNewStore = true
    const opts = RealtimeStoreCreateOptions.create()
    opts.persistence = RealtimeStoreCreateOptions.Persistence.Session
    opts.ownership = RealtimeStoreCreateOptions.Ownership.Unowned
    opts.allowOwnershipTakeOver = false
    opts.storeId = STORE_ID

    session.createRealtimeStore(
      opts,
      (store) => {
        this.realtimeStore = store
        this.logger.info("Created new realtime store")
        onReady()
      },
      () => {
        this.logger.error("Failed to create realtime store")
      }
    )
  }
}
