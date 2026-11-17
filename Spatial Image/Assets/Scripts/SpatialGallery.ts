/**
 * SPECS Inc. 2027
 * Defines Spatial Gallery, shuffle Array for the Spatial Image Gallery lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent, bindEnableEvent, bindDisableEvent } from "SnapDecorators.lspkg/decorators";
import { setTimeout, clearTimeout, CancelToken } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { SpatialImageSwapper } from "./SpatialImageSwapper";

/**
 * Standalone gallery that spatializes images on demand via left/right navigation.
 *
 * @version 2.0.0
 */
@component
export class SpatialGallery extends BaseScriptComponent {
  @typename
  SpatialImage: keyof ComponentNameMap

  @ui.label('<span style="color: #60A5FA;">Spatial Gallery – standalone browsable gallery of spatialized images</span><br/><span style="color: #94A3B8; font-size: 11px;">Navigates through a list of textures, spatializing each on selection. No external frame dependencies.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input("SpatialImage")
  @hint("The SpatialImage custom component used for spatialization")
  image: any

  @input
  @allowUndefined
  @hint("Optional swapper that shows each image flat while it is being spatialized")
  swapper: SpatialImageSwapper

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Gallery</span>')
  @input
  @hint("The ordered list of textures that make up the gallery")
  gallery: Texture[]

  @input
  @hint("If true, the gallery order will be randomized on initialization")
  shuffle: boolean

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Auto-Advance</span>')
  @input
  @hint("Automatically advance to the next image after it loads")
  autoAdvance: boolean = false

  @input
  @hint("Seconds to wait on each image before advancing to the next")
  @widget(new SliderWidget(1, 60, 1))
  advanceDelay: number = 5

  @input
  @hint("Loop back to the first image after the last")
  loop: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private index: number = 0
  private advancePending: boolean = false

  onAwake(): void {
    this.logger = new Logger("SpatialGallery", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    if (this.shuffle) {
      shuffleArray(this.gallery)
    }
  }

  /**
   * Moves the gallery to the next image.
   */
  public leftPressed(): void {
    let newIndex = this.index - 1
    if (newIndex < 0) {
      newIndex += this.gallery.length
    }
    this.setIndex(newIndex)
  }

  /**
   * Move the gallery to the previous image.
   */
  public rightPressed(): void {
    this.setIndex((this.index + 1) % this.gallery.length)
  }

  // The InteractionKit setTimeout runs on a global dispatcher, not on this
  // component, so it keeps firing while the gallery is hidden. Track it and
  // pause the auto-advance whenever this object is disabled (e.g. another
  // carousel example is shown); otherwise every hidden tick sends one more
  // photo to the Spatial Image API and builds one more mesh.
  private advanceTimer: CancelToken | null = null
  private started: boolean = false

  @bindStartEvent
  private initialiseFrame(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()");
    this.started = true

    if (this.autoAdvance) {
      this.image.onLoaded.add((status: number) => {
        if (status === 1) {
          this.scheduleAdvance()
        }
      })
    }

    this.setIndex(this.index)
  }

  @bindDisableEvent
  private onDisable(): void {
    this.cancelAdvance()
  }

  @bindEnableEvent
  private onEnable(): void {
    // The first enable comes before onStart, which sets the first image itself.
    if (!this.started || !this.autoAdvance) return
    this.scheduleAdvance()
  }

  private cancelAdvance(): void {
    this.advancePending = false
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer)
      this.advanceTimer = null
    }
  }

  private scheduleAdvance(): void {
    this.cancelAdvance()
    this.advancePending = true
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null
      if (!this.advancePending || !this.getSceneObject().isEnabledInHierarchy) return
      this.advancePending = false

      let next = this.index + 1
      if (next >= this.gallery.length) {
        if (this.loop) {
          next = 0
        } else {
          return
        }
      }
      this.setIndex(next)
    }, this.advanceDelay * 1000)
  }

  private setIndex(newIndex: number) {
    this.advancePending = false
    this.index = newIndex
    const texture = this.gallery[this.index]
    const aspectRatio = texture.getWidth() / texture.getHeight()
    this.image.sceneObject.getTransform().setLocalScale(new vec3(aspectRatio, 1, 1))
    this.image.setImage(texture)
    if (this.swapper) {
      this.swapper.setImage(texture)
    }
  }
}

function shuffleArray<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}
