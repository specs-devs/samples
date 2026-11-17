// Preload ThemeService before any UIKit visual to break a circular-import init-order
// crash in the package (Visual.ts imports ThemeService before defining COLORS, and the
// theme chain reads COLORS at module-load). Entering the import cycle via ThemeService
// lets Visual.ts finish defining COLORS first. Must remain the FIRST import.
import "SpectaclesUIKit.lspkg/Scripts/Themes/ThemeService"
/**
 * VideoPlayer – programmatic video player with transport controls.
 *
 * Project-owned, robust rewrite of the InteractionKitExamples ExampleVideoPlayer.
 * The transport timeline is driven by the real VideoTextureProvider instead of a
 * simulated clock, which fixes: (1) the video freezing after the real clip ends
 * while the UI kept counting, and (2) inconsistent audio restarts caused by the
 * controls acting on a finished provider with a stale, made-up timestamp.
 *
 * Source of truth for playback state:
 *   - duration      -> provider.totalDuration (read on onPlaybackReady)
 *   - current time  -> provider.currentTime   (read every frame while Playing)
 *   - playing state -> provider.status === VideoStatus.Playing
 *   - end of clip   -> provider.onPlaybackDone
 *
 * No prefabs. Assign a VideoTexture in the inspector — full UI is built at runtime.
 * Public API: play(), pause(), resume(), stop(), seek(t), seekRelative(dt),
 *             setVolume(v), setPlaybackRate(r), isPlaying(), getCurrentTime().
 */
import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import { ElementContent } from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent"
import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import { FlexAlign, FlexDirection, FlexJustify } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import { Slider } from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider"
import { Billboard } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Billboard/Billboard"

import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

// Fonts are supplied as inputs (wired in the scene to the project's existing
// SpecsSans font assets) rather than bundled with the script.

type FontWeight = "light" | "regular" | "medium" | "bold"

const CONTENT_Z_OFFSET     = 0.08
const LAYOUT_Z_LIFT        = 0.005
const LABEL_EDGE_INSET     = 0.75
const PANEL_CONTENT_Z_LIFT = 0.005
const CONTENT_RO           = 8
const BTN_CONTENT_RO       = 3

const ASPECT_RATIOS: Record<string, number> = {
  "16:9": 9 / 16,
  "4:3":  3 / 4,
  "1:1":  1.0,
}

@component
export class VideoPlayer extends BaseScriptComponent {

  @ui.label('<span style="color: #60A5FA;">VideoPlayer – provider-driven video player</span><br/><span style="color: #94A3B8; font-size: 11px;">No prefabs. Assign a VideoTexture. Timeline is read from the real VideoTextureProvider. API: play(), pause(), resume(), stop(), seek(t), seekRelative(dt), setVolume(v), setPlaybackRate(r), isPlaying(), getCurrentTime().</span>')
  @ui.separator

  // ── Video ──────────────────────────────────────────────────────────────
  @ui.group_start("Video")
  @input
  @hint("Video texture asset to display and control (must have VideoTextureProvider)")
  videoTexture: Texture

  @input("number", "60.0")
  @hint("Fallback duration shown until the real clip length is read from the provider (onPlaybackReady)")
  videoDuration: number = 60.0

  @input
  @hint("Start playing automatically once the provider is ready")
  autoPlay: boolean = false

  @input("number", "0")
  @hint("Times to play. 0 or negative = loop forever (mapped to VideoTextureProvider.play(-1); play(0) is rejected by the runtime).")
  loopCount: number = 0
  @ui.group_end

  // ── Controls ───────────────────────────────────────────────────────────
  @ui.separator
  @ui.group_start("Controls")
  @input("number", "5.0")
  @hint("Seconds to seek per forward / rewind button press")
  seekStepSeconds: number = 5.0

  @input
  @hint("Show the volume slider below the transport controls")
  showVolumeSlider: boolean = true

  @input("number", "1.0")
  @hint("Initial volume (0 – 1)")
  initialVolume: number = 1.0

  @input("number", "1.0")
  @hint("Initial playback rate (0.5 = half speed, 2.0 = double speed). Applied at load; changing it live requires a reload.")
  initialPlaybackRate: number = 1.0
  @ui.group_end

  // ── Layout ─────────────────────────────────────────────────────────────
  @ui.separator
  @ui.group_start("Layout")
  @input("number", "32.0")
  @hint("Panel content area width in cm")
  panelWidth: number = 32.0

  @input("string")
  @hint("Video display aspect ratio — determines the height of the video cell")
  @widget(new ComboBoxWidget([
    new ComboBoxItem("16:9", "16:9"),
    new ComboBoxItem("4:3",  "4:3"),
    new ComboBoxItem("1:1",  "1:1"),
  ]))
  aspectRatio: string = "16:9"

  @input("number", "0")
  @hint("World X position")
  positionX: number = 0

  @input("number", "0")
  @hint("World Y position")
  positionY: number = 0

  @input("number", "-110")
  @hint("Distance from camera in cm (negative = in front)")
  positionZ: number = -110

  @input("number", "1.5")
  @hint("Corner radius of the video display in cm (0 = sharp corners)")
  videoCornerRadius: number = 1.5
  @ui.group_end

  // ── Typography ─────────────────────────────────────────────────────────
  @ui.separator
  @ui.group_start("Typography")
  @input("number", "24")
  @hint("Font size for the current time / duration label")
  timeLabelFontSize: number = 24

  @input("number", "20")
  @hint("Font size for the transport buttons (Play, Pause, Seek back/forward)")
  buttonFontSize: number = 20

  @input("number", "22")
  @hint("Font size for the Volume label and percentage readout")
  volumeLabelFontSize: number = 22
  @ui.group_end

  // ── Logging ────────────────────────────────────────────────────────────
  @ui.separator
  @ui.group_start("Logging")
  @input
  @hint("Enable general logging (play, pause, seek events)")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, ready, done)")
  enableLoggingLifecycle: boolean = false
  @ui.group_end

  // ── Fonts ────────────────────────────────────────────────────────────────
  @ui.separator
  @ui.group_start("Fonts")
  @input @hint("Light weight (e.g. SpecsSans-Light)")     fontLight: Font
  @input @hint("Regular weight (e.g. SpecsSans-Regular)") fontRegular: Font
  @input @hint("Medium weight (e.g. SpecsSans-Medium)")   fontMedium: Font
  @input @hint("Bold weight (e.g. SpecsSans-Bold)")       fontBold: Font
  @ui.group_end

  // ── Private state ──────────────────────────────────────────────────────
  private provider:         VideoTextureProvider | null = null
  private seekSlider:       Slider | null = null
  private volumeSlider:     Slider | null = null
  private timeText:         Text   | null = null

  private playBtnObj:       SceneObject | null = null
  private pauseBtnObj:      SceneObject | null = null

  private _duration:        number  = 0     // real clip length once known, else the fallback
  private _currentTime:     number  = 0     // cached playhead, mirrored from provider.currentTime
  private _ready:           boolean = false // provider has decoded and reported ready
  private _autoPlayFired:   boolean = false // guard so autoPlay only triggers once
  private skipSeekSync:     boolean = false
  private skipVolumeSync:   boolean = false
  private initialized:      boolean = false
  private resumeOnEnable:   boolean = false // was playing when disabled, so resume when enabled again
  private logger:           Logger

  onAwake(): void {
    this.logger = new Logger("VideoPlayer", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    // Stop the audio when the player is hidden (e.g. an example carousel moves on), pick up again when shown.
    this.createEvent("OnDisableEvent").bind(() => {
      this.resumeOnEnable = this.isPlayingReal()
      if (this.resumeOnEnable) this.pause()
    })
    this.createEvent("OnEnableEvent").bind(() => {
      if (this.initialized && this.resumeOnEnable) this.resume()
      this.resumeOnEnable = false
    })
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this._duration = Math.max(0, this.videoDuration)
    this.buildUI()
    this.initProvider()
    this.initialized = true
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (!this.initialized) return
    // Mirror the real playhead from the provider — never simulate it.
    if (this.provider && this._ready) {
      if (this.provider.status === VideoStatus.Playing) {
        this._currentTime = this.provider.currentTime
      }
      // Keep duration honest if the provider only reports it a little late.
      if (this.provider.totalDuration > 0) this._duration = this.provider.totalDuration
    }
    this.syncSeekSlider()
    this.syncTimeLabel()
    this.syncPlayPauseButtons()
  }

  // ── Provider ──────────────────────────────────────────────────────────────
  private initProvider(): void {
    if (!this.videoTexture) {
      if (this.enableLogging) this.logger.debug("no videoTexture assigned")
      return
    }
    this.provider = this.videoTexture.control as VideoTextureProvider
    if (!this.provider) {
      if (this.enableLogging) this.logger.debug("videoTexture.control is not a VideoTextureProvider")
      return
    }

    // playbackRate is applied when the video is loaded, so set it before playback.
    this.provider.playbackRate = Math.max(0.1, this.initialPlaybackRate)
    this.provider.volume       = Math.max(0, Math.min(1, this.initialVolume))

    // Real clip length arrives with onPlaybackReady; that is also the safe point to autoplay.
    this.provider.onPlaybackReady.add(() => {
      this._ready = true
      const d = this.provider.totalDuration
      if (d > 0) this._duration = d
      if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onPlaybackReady (duration=" + this._duration.toFixed(2) + "s)")
      this.syncSeekSlider()
      this.syncTimeLabel()
      this.syncPlayPauseButtons()
      if (this.autoPlay && !this._autoPlayFired) {
        this._autoPlayFired = true
        this.play()
      }
    })

    // Fires when the requested play count finishes. Never fires when loopCount === 0 (infinite).
    this.provider.onPlaybackDone.add(() => {
      if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onPlaybackDone")
      this._currentTime = this._duration
      this.syncSeekSlider()
      this.syncTimeLabel()
      this.syncPlayPauseButtons()
    })

    // Preload so the first frame and duration are ready before the user (or autoPlay) hits play.
    // load(loopOnLoad) hints the decoder about looped playback.
    if (typeof this.provider.load === "function") {
      this.provider.load(this.loopCount <= 0 || this.loopCount > 1)
    } else if (this.autoPlay && !this._autoPlayFired) {
      // Older runtime without load(): play immediately; duration fills in on ready.
      this._autoPlayFired = true
      this.play()
    }
  }

  private isPlayingReal(): boolean {
    return !!this.provider && this.provider.status === VideoStatus.Playing
  }

  // ── UI sync (reads real state) ──────────────────────────────────────────────
  private syncSeekSlider(): void {
    if (!this.seekSlider || this._duration <= 0) return
    this.skipSeekSync = true
    this.seekSlider.currentValue = Math.max(0, Math.min(1, this._currentTime / this._duration))
    this.skipSeekSync = false
  }

  private syncTimeLabel(): void {
    if (!this.timeText) return
    this.timeText.text = this.fmt(this._currentTime) + " / " + this.fmt(this._duration)
  }

  private syncPlayPauseButtons(): void {
    const playing = this.isPlayingReal()
    if (this.playBtnObj)  this.playBtnObj.enabled  = !playing
    if (this.pauseBtnObj) this.pauseBtnObj.enabled =  playing
  }

  private fmt(s: number): string {
    const t = Math.max(0, Math.floor(s))
    const m = Math.floor(t / 60)
    const sec = t % 60
    return m + ":" + (sec < 10 ? "0" : "") + sec
  }

  // ── UI build ──────────────────────────────────────────────────────────────
  private buildUI(): void {
    const root = this.sceneObject
    root.createComponent(Billboard.getTypeName())
    // Relative to the parent, so the player follows wherever its parent is placed.
    root.getTransform().setLocalPosition(new vec3(this.positionX, this.positionY, this.positionZ))

    const pw     = this.panelWidth
    const aspect = ASPECT_RATIOS[this.aspectRatio] ?? (9 / 16)
    const videoH = pw * aspect
    const extraH = this.showVolumeSlider ? 4.5 : 0
    const ph     = videoH + 11.5 + extraH

    const content = this.scenePanel(root, "VideoPlayerPanel", pw, ph)
    const col = this.flexColumn(content, pw, ph, { gap: 0.8, padX: 0.5, padY: 0.5 })

    // 1. Video display ──────────────────────────────────────────────────
    this.flexChild(col, { w: pw, h: videoH }, (cell) => {
      this.buildVideoCell(cell, pw, videoH)
    })

    // 2. Time label ────────────────────────────────────────────────────
    this.flexChild(col, { w: pw, h: 2.2 }, (cell) => {
      this.timeText = this.dynamicText(
        cell, "Time", "0:00 / " + this.fmt(this._duration),
        this.timeLabelFontSize, new vec3(0, 0, 0.1), new vec4(1, 1, 1, 0.7),
        this.fontRegular, HorizontalAlignment.Center
      )
    })

    // 3. Seek slider ───────────────────────────────────────────────────
    this.flexChild(col, { w: pw, h: 2.5 }, (cell) => {
      const s = cell.createComponent(Slider.getTypeName()) as Slider
      ;(s as any)._size = new vec3(pw, 2.2, 1)
      s.initialize()
      s.currentValue = 0
      this.seekSlider = s
      s.onValueChange.add((v: number) => {
        if (this.skipSeekSync) return
        const t = v * this._duration
        this.seek(t)
      })
    })

    // 4. Transport controls ────────────────────────────────────────────
    const btnH = 4.0
    const btnW = (pw - 2.4) / 3
    this.flexChild(col, { w: pw, h: btnH }, (cell) => {
      const row = this.flexRow(cell, pw, btnH, {
        gap: 1.2, justify: FlexJustify.Center, align: FlexAlign.Center,
      })
      // Seek back
      this.flexChild(row, { w: btnW, h: btnH }, (bo) => {
        const btn = this.btn(bo, "Secondary", "Capsule", btnW, btnH)
        this.content(bo, { text: "⏮ " + this.seekStepSeconds + "s", textSize: this.buttonFontSize, fontWeight: "medium", renderOrderOffset: BTN_CONTENT_RO })
        btn.onTriggerUp.add(() => this.seekRelative(-this.seekStepSeconds))
      })
      // Play / Pause toggle (two objects stacked in the same slot)
      this.flexChild(row, { w: btnW, h: btnH }, (slot) => {
        this.playBtnObj = this.obj(slot, "PlayBtn")
        const playBtn = this.btn(this.playBtnObj, "Primary", "Capsule", btnW, btnH)
        this.content(this.playBtnObj, { text: "▶ Play", textSize: this.buttonFontSize, fontWeight: "bold", renderOrderOffset: BTN_CONTENT_RO })
        playBtn.onTriggerUp.add(() => {
          // Resume only when genuinely paused; otherwise (re)start from the beginning.
          if (this.provider && this.provider.status === VideoStatus.Paused) this.resume()
          else this.play()
        })

        this.pauseBtnObj = this.obj(slot, "PauseBtn")
        this.pauseBtnObj.enabled = false
        const pauseBtn = this.btn(this.pauseBtnObj, "Primary", "Capsule", btnW, btnH)
        this.content(this.pauseBtnObj, { text: "⏸ Pause", textSize: this.buttonFontSize, fontWeight: "bold", renderOrderOffset: BTN_CONTENT_RO })
        pauseBtn.onTriggerUp.add(() => this.pause())
      })
      // Seek forward
      this.flexChild(row, { w: btnW, h: btnH }, (bo) => {
        const btn = this.btn(bo, "Secondary", "Capsule", btnW, btnH)
        this.content(bo, { text: "⏭ " + this.seekStepSeconds + "s", textSize: this.buttonFontSize, fontWeight: "medium", renderOrderOffset: BTN_CONTENT_RO })
        btn.onTriggerUp.add(() => this.seekRelative(this.seekStepSeconds))
      })
    })

    // 5. Volume slider (optional) ──────────────────────────────────────
    if (this.showVolumeSlider) {
      this.flexChild(col, { w: pw, h: 4.2 }, (cell) => {
        const volCol = this.flexColumn(cell, pw, 4.2, { gap: 0.4 })
        this.flexChild(volCol, { w: pw, h: 1.8 }, (hdr) => {
          this.label(hdr, "Volume", pw, 1.8, { textSize: this.volumeLabelFontSize, align: "center", fontWeight: "medium" })
        })
        this.flexChild(volCol, { w: pw, h: 2.2 }, (sCell) => {
          const vs = sCell.createComponent(Slider.getTypeName()) as Slider
          ;(vs as any)._size = new vec3(pw, 2.2, 1)
          vs.initialize()
          vs.currentValue = Math.max(0, Math.min(1, this.initialVolume))
          this.volumeSlider = vs
          vs.onValueChange.add((v: number) => {
            if (this.skipVolumeSync) return
            if (this.provider) this.provider.volume = v   // volume can change live
          })
        })
      })
    }
  }

  private buildVideoCell(parent: SceneObject, w: number, h: number): void {
    const rrObj = this.obj(parent, "VideoDisplay")
    const rr = rrObj.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
    rr.cornerRadius = this.videoCornerRadius
    rr.initialize()
    rr.size = new vec2(w, h)
    if (this.videoTexture) {
      rr.useTexture = true
      rr.texture = this.videoTexture
      rr.textureMode = "Stretch"
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Start playback from the beginning. */
  public play(loops?: number): void {
    if (!this.provider) { if (this.enableLogging) this.logger.debug("play: no provider"); return }
    const requested = loops ?? this.loopCount
    // The runtime rejects play(0) ("Play count should be non-zero") and loops
    // forever on any negative value, so map our "0 = loop forever" input to -1.
    const n = requested <= 0 ? -1 : requested
    this.provider.play(n)
    this._currentTime = 0
    this.syncPlayPauseButtons()
    if (this.enableLogging) this.logger.debug("play(playCount=" + n + ")")
  }

  /** Pause playback at the current position. */
  public pause(): void {
    if (!this.provider) return
    this.provider.pause()
    this.syncPlayPauseButtons()
    if (this.enableLogging) this.logger.debug("pause()")
  }

  /** Resume from a paused position. Falls back to play() if not actually paused. */
  public resume(): void {
    if (!this.provider) return
    if (this.provider.status === VideoStatus.Paused) this.provider.resume()
    else this.provider.play(this.loopCount <= 0 ? -1 : this.loopCount)
    this.syncPlayPauseButtons()
    if (this.enableLogging) this.logger.debug("resume()")
  }

  /** Stop and reset to the beginning. */
  public stop(): void {
    if (!this.provider) return
    this.provider.stop()
    this._currentTime = 0
    this.syncSeekSlider()
    this.syncTimeLabel()
    this.syncPlayPauseButtons()
    if (this.enableLogging) this.logger.debug("stop()")
  }

  /** Seek to an absolute time in seconds. */
  public seek(seconds: number): void {
    const dur = this._duration > 0 ? this._duration : this.videoDuration
    this._currentTime = Math.max(0, Math.min(seconds, dur))
    if (this.provider && this._ready) this.provider.seek(this._currentTime)
    this.syncSeekSlider()
    this.syncTimeLabel()
    if (this.enableLogging) this.logger.debug("seek(" + this._currentTime.toFixed(2) + ")")
  }

  /** Seek relative to the current position (negative = rewind). */
  public seekRelative(delta: number): void {
    this.seek(this._currentTime + delta)
  }

  /** Set volume (0–1). Also updates the volume slider UI. Safe to call during playback. */
  public setVolume(volume: number): void {
    const v = Math.max(0, Math.min(1, volume))
    if (this.provider) this.provider.volume = v
    if (this.volumeSlider) {
      this.skipVolumeSync = true
      this.volumeSlider.currentValue = v
      this.skipVolumeSync = false
    }
    if (this.enableLogging) this.logger.debug("setVolume(" + v.toFixed(2) + ")")
  }

  /**
   * Set playback rate (0.5 = half speed, 1.0 = normal, 2.0 = double).
   * playbackRate is applied at load time; a live change only takes effect after the
   * next load, so this reloads the provider to apply it mid-session.
   */
  public setPlaybackRate(rate: number): void {
    const r = Math.max(0.1, rate)
    if (!this.provider) return
    this.provider.playbackRate = r
    if (typeof this.provider.unload === "function" && typeof this.provider.load === "function") {
      const wasPlaying = this.isPlayingReal()
      this.provider.unload()
      this.provider.load(this.loopCount <= 0 || this.loopCount > 1)
      if (wasPlaying) this.provider.play(this.loopCount <= 0 ? -1 : this.loopCount)
    }
    if (this.enableLogging) this.logger.debug("setPlaybackRate(" + r.toFixed(2) + ")")
  }

  public isPlaying(): boolean                           { return this.isPlayingReal() }
  public getCurrentTime(): number                       { return this._currentTime }
  public getDuration(): number                          { return this._duration }
  public getProvider(): VideoTextureProvider | null     { return this.provider }

  // ── Composition helpers (unchanged from the example) ─────────────────────

  private fontForWeight(weight: FontWeight): Font {
    switch (weight) {
      case "light":  return this.fontLight  || this.fontRegular
      case "medium": return this.fontMedium || this.fontRegular
      case "bold":   return this.fontBold   || this.fontRegular
      default:       return this.fontRegular
    }
  }

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    if (position) so.getTransform().setLocalPosition(position)
    return so
  }

  private liftInZ(so: SceneObject, z: number): void {
    const t = so.getTransform()
    const p = t.getLocalPosition()
    t.setLocalPosition(new vec3(p.x, p.y, p.z + z))
  }

  private dynamicText(
    parent: SceneObject, name: string, text: string, size: number,
    localPos: vec3, color: vec4, font: Font,
    hAlign: HorizontalAlignment = HorizontalAlignment.Center
  ): Text {
    const textObj = this.obj(parent, name, localPos)
    const tc = textObj.createComponent("Component.Text") as Text
    tc.text = text; tc.size = size; tc.textFill.color = color; tc.font = font
    tc.horizontalAlignment = hAlign
    tc.verticalAlignment = VerticalAlignment.Center
    tc.horizontalOverflow = HorizontalOverflow.Overflow
    tc.verticalOverflow = VerticalOverflow.Overflow
    const pass = (tc as any).getMaterial(0).mainPass
    pass.depthTest = true; pass.depthWrite = true
    return tc
  }

  private scenePanel(
    parent: SceneObject, name: string, width: number, height: number
  ): SceneObject {
    const frameObj = this.obj(parent, name)
    const frame = frameObj.createComponent(Frame.getTypeName()) as Frame
    frame.autoShowHide = false
    frame.allowTranslation = true
    frame.autoScaleContent = true
    ;(frame as any)._showCloseButton = true
    ;(frame as any)._showFollowButton = true
    ;(frame as any)._innerSize = new vec2(width, height)
    ;(frame as any)._padding = new vec2(0.3, 0.3)
    return this.obj(frameObj, "FrameContent", new vec3(0, 0, PANEL_CONTENT_Z_LIFT))
  }

  private btn(
    so: SceneObject, style: string, shape: string,
    width: number, height: number, renderOrder: number = 0
  ): Button {
    const button = so.createComponent(Button.getTypeName()) as Button
    ;(button as any)._themeOverride = "SnapOS2"
    ;(button as any)._shapeSnapOS2 = shape
    ;(button as any)._styleSnapOS2 = style
    ;(button as any)._size = new vec3(width, height, 1)
    ;(button as any)._renderOrder = renderOrder
    button.initialize()
    return button
  }

  private content(
    so: SceneObject,
    opts: {
      text?: string; contentAlignment?: string; textSize?: number
      paddingLeft?: number; paddingRight?: number; sizeOverride?: vec2
      useThemeColors?: boolean; textColorOverride?: vec4; fontWeight?: FontWeight
      renderOrderOffset?: number; zOffset?: number
    }
  ): ElementContent {
    const ec = so.createComponent(ElementContent.getTypeName()) as ElementContent
    const a = ec as any
    a._zOffset = opts.zOffset ?? CONTENT_Z_OFFSET
    a._renderOrderOffset = opts.renderOrderOffset ?? CONTENT_RO
    a._font = this.fontForWeight(opts.fontWeight ?? "regular")
    if (opts.text !== undefined) a._text = opts.text
    if (opts.contentAlignment) a._contentAlignment = opts.contentAlignment
    if (opts.textSize) a._textSize = opts.textSize
    if (opts.paddingLeft !== undefined) a._paddingLeft = opts.paddingLeft
    if (opts.paddingRight !== undefined) a._paddingRight = opts.paddingRight
    if (opts.sizeOverride) a._sizeOverride = opts.sizeOverride
    if (opts.useThemeColors !== undefined) a._useThemeColors = opts.useThemeColors
    if (opts.textColorOverride) {
      a._useTextColorOverride = true; a._textColorOverride = opts.textColorOverride
    }
    return ec
  }

  private label(
    so: SceneObject, text: string, width: number, height: number,
    opts?: {
      textSize?: number; align?: string; color?: vec4
      fontWeight?: FontWeight; renderOrderOffset?: number
    }
  ): ElementContent {
    const align = opts?.align ?? "center"
    return this.content(so, {
      text, sizeOverride: new vec2(width, height), useThemeColors: false,
      textSize: opts?.textSize ?? 32, contentAlignment: align,
      textColorOverride: opts?.color, fontWeight: opts?.fontWeight ?? "regular",
      paddingLeft:  align === "left"  ? LABEL_EDGE_INSET : 0,
      paddingRight: align === "right" ? LABEL_EDGE_INSET : 0,
      renderOrderOffset: opts?.renderOrderOffset,
    })
  }

  private flexColumn(
    parent: SceneObject, width: number, height: number,
    opts?: { gap?: number; padY?: number; padX?: number; justify?: FlexJustify; align?: FlexAlign }
  ): SceneObject {
    return this.makeFlex(parent, FlexDirection.Column, width, height, opts)
  }

  private flexRow(
    parent: SceneObject, width: number, height: number,
    opts?: { gap?: number; padY?: number; padX?: number; justify?: FlexJustify; align?: FlexAlign }
  ): SceneObject {
    return this.makeFlex(parent, FlexDirection.Row, width, height, opts)
  }

  private makeFlex(
    parent: SceneObject, direction: FlexDirection, width: number, height: number,
    opts?: { gap?: number; padY?: number; padX?: number; justify?: FlexJustify; align?: FlexAlign }
  ): SceneObject {
    const container = this.obj(parent, "Flex")
    this.liftInZ(container, LAYOUT_Z_LIFT)
    const fl = container.createComponent(FlexLayout.getTypeName()) as FlexLayout
    // Items are added manually via addItems() before init; disable
    // auto-discovery so addItems() doesn't throw on an uninitialized layout.
    fl.autoDiscoverItemsOnStart = false
    const fi = container.createComponent(FlexItem.getTypeName()) as FlexItem
    if (width > 0) fi.overrideWidth = width
    if (height > 0) fi.overrideHeight = height
    fl.onInitialized.add(() => {
      fl.width = width; fl.height = height; fl.direction = direction
      if (direction === FlexDirection.Row) fl.columnGap = opts?.gap ?? 0
      else fl.rowGap = opts?.gap ?? 0
      fl.paddingTop    = opts?.padY ?? 0; fl.paddingBottom = opts?.padY ?? 0
      fl.paddingLeft   = opts?.padX ?? 0; fl.paddingRight  = opts?.padX ?? 0
      fl.justifyContent = opts?.justify ?? FlexJustify.Start
      fl.alignItems     = opts?.align   ?? FlexAlign.Stretch
    })
    return container
  }

  private flexChild(
    parent: SceneObject,
    size: { w?: number; h?: number; grow?: number },
    builder: (child: SceneObject) => void
  ): SceneObject {
    const child = this.obj(parent, "Item")
    this.liftInZ(child, LAYOUT_Z_LIFT)
    const fi = child.createComponent(FlexItem.getTypeName()) as FlexItem
    if (size.w !== undefined && size.w > 0) fi.overrideWidth  = size.w
    if (size.h !== undefined && size.h > 0) fi.overrideHeight = size.h
    fi.flexGrow   = size.grow ?? 0
    fi.flexShrink = 0
    builder(child)
    const parentFl = parent.getComponent(FlexLayout.getTypeName()) as FlexLayout | null
    if (parentFl) parentFl.addItems([fi])
    return child
  }
}
