/**
 * Specs Inc. 2026
 * SpatialAnimationSequence - Pre-spatializes all gallery frames on start,
 * then plays them back rapidly by swapping cached meshes.
 *
 * Same inputs as SpatialGallery — drop-in replacement with pre-processing.
 * Meshes stay under the SpatialImage hierarchy to preserve rendering context.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"

@component
export class SpatialAnimationSequence extends BaseScriptComponent {
  @typename
  SpatialImage: keyof ComponentNameMap

  @ui.label('<span style="color: #60A5FA;">Spatial Animation Sequence – pre-spatializes all frames then auto-cycles</span><br/><span style="color: #94A3B8; font-size: 11px;">Pre-processes all frames, then automatically cycles through cached meshes at the configured FPS.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input("SpatialImage")
  @hint("The SpatialImage custom component used for spatialization")
  image: any

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Gallery</span>')
  @input
  @hint("The ordered list of textures that make up the gallery")
  gallery: Texture[]

  @input
  @hint("If true, the gallery order will be randomized on initialization")
  shuffle: boolean

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Playback</span>')
  @input
  @hint("Playback frames per second")
  @widget(new SliderWidget(1, 30, 1))
  fps: number = 10

  @input
  @hint("Loop playback when reaching the last frame")
  loop: boolean = true

  @input
  @hint("Start playback automatically once all frames are spatialized")
  autoPlay: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Timing</span>')
  @input
  @hint("Seconds to wait before starting spatialization (lets SpatialImage finish its own init)")
  @widget(new SliderWidget(0, 10, 0.5))
  startDelay: number = 3

  @input
  @hint("Per-frame timeout in seconds before retrying")
  @widget(new SliderWidget(5, 120, 5))
  frameTimeout: number = 30

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private meshes: (SceneObject | null)[] = []
  private index: number = -1
  private loadedCount: number = 0
  private failedCount: number = 0
  private isPlaying: boolean = false
  private elapsed: number = 0

  onAwake(): void {
    this.logger = new Logger("SpatialAnimationSequence", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    if (this.shuffle) {
      shuffleArray(this.gallery)
    }
  }

  @bindStartEvent
  private initialiseFrame(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    if (this.gallery.length === 0) {
      this.logger.error("No frames in gallery")
      return
    }

    this.logger.info(`Waiting ${this.startDelay}s for SpatialImage to finish init...`)
    setTimeout(() => {
      this.logger.info(`Pre-spatializing ${this.gallery.length} frames...`)
      this.spatializeNext(0)
    }, this.startDelay * 1000)
  }

  private spatializeNext(idx: number, attempt: number = 1): void {
    if (idx >= this.gallery.length) {
      this.onAllReady()
      return
    }

    const maxRetries = 3
    const retryDelayMs = 2000
    const timeoutMs = this.frameTimeout * 1000
    let handled = false

    this.logger.info(`Spatializing frame ${idx + 1}/${this.gallery.length}${attempt > 1 ? ` (retry ${attempt - 1})` : ""}...`)

    const handleResult = (success: boolean) => {
      if (handled) return
      handled = true
      this.image.onLoaded.remove(onComplete)

      if (success) {
        const mesh = this.image.spatialImage as SceneObject
        if (mesh) {
          // Keep mesh under SpatialImage hierarchy — don't reparent!
          this.meshes.push(mesh)
          // Detach from SpatialImage's internal reference so next setImage won't disable it
          this.image.spatialImage = null
          this.image.renderMeshVisual = null
          mesh.enabled = false
          this.loadedCount++
          this.logger.debug(`Frame ${idx + 1} ready — ${mesh.name}`)
        } else {
          this.meshes.push(null)
          this.failedCount++
        }
        this.spatializeNext(idx + 1)
      } else if (attempt < maxRetries) {
        this.logger.warn(`Frame ${idx + 1} failed, retrying in ${retryDelayMs}ms...`)
        setTimeout(() => {
          this.spatializeNext(idx, attempt + 1)
        }, retryDelayMs)
      } else {
        this.meshes.push(null)
        this.failedCount++
        this.logger.warn(`Frame ${idx + 1} failed after ${maxRetries} attempts`)
        this.spatializeNext(idx + 1)
      }
    }

    const onComplete = (status: number) => {
      handleResult(status === 1)
    }

    // Timeout fallback if onLoaded never fires
    setTimeout(() => {
      if (!handled) {
        this.logger.warn(`Frame ${idx + 1} timed out`)
        handleResult(false)
      }
    }, timeoutMs)

    this.image.onLoaded.add(onComplete)
    this.image.setImage(this.gallery[idx])
  }

  private onAllReady(): void {
    const msg = `Done: ${this.loadedCount}/${this.gallery.length} frames ready` +
      (this.failedCount > 0 ? ` (${this.failedCount} failed)` : "")
    this.logger.info(msg)

    if (this.autoPlay && this.loadedCount > 0) {
      this.play()
    }
  }

  public play(): void {
    if (this.loadedCount === 0) return
    this.logger.info(`Playing ${this.loadedCount} frames at ${this.fps} fps`)

    // Enable the SpatialImage scene object so child meshes can render
    this.image.sceneObject.enabled = true

    this.isPlaying = true
    this.elapsed = 0
    this.showFrame(0)
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  public stop(): void {
    this.isPlaying = false
  }

  private onUpdate(): void {
    if (!this.isPlaying) return

    this.elapsed += getDeltaTime()
    const frameDuration = 1 / this.fps

    if (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration

      let next = this.index + 1
      if (next >= this.gallery.length) {
        if (this.loop) {
          next = 0
        } else {
          this.isPlaying = false
          return
        }
      }
      this.showFrame(next)
    }
  }

  private showFrame(newIndex: number): void {
    // Hide current mesh
    if (this.index >= 0 && this.index < this.meshes.length && this.meshes[this.index]) {
      this.meshes[this.index].enabled = false
    }
    // Show new mesh
    if (newIndex < this.meshes.length && this.meshes[newIndex]) {
      this.meshes[newIndex].enabled = true
    }
    this.index = newIndex
  }
}

function shuffleArray<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}
