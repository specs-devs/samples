/**
 * Glasses Inc. 2026
 * Audio Located Object component for the CustomLocations package.
 * Plays an AudioComponent while the wearer is at the location.
 */
import {LocatedObject} from "./LocatedObject"
import {Logger} from "./Logger"

@component
export class AudioLocatedObject extends BaseScriptComponent implements LocatedObject {
  @ui.label(
    '<span style="color: #60A5FA;">AudioLocatedObject – Plays audio at a location</span><br/><span style="color: #94A3B8; font-size: 11px;">Plays an AudioComponent when the location is activated and stops it when the wearer moves away.</span>'
  )
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Audio</span>')
  @input
  @allowUndefined
  @hint("AudioComponent to play when the location is activated; defaults to one on this SceneObject")
  audio: AudioComponent

  @input
  @hint("Number of loops passed to AudioComponent.play (-1 = loop forever)")
  loops: number = 1

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("AudioLocatedObject", this.enableLogging)
    if (!this.audio) {
      this.audio = this.getSceneObject().getComponent("Component.AudioComponent") as AudioComponent
    }
    if (!this.audio) {
      this.logger.error(`No AudioComponent assigned or found on "${this.getSceneObject().name}"`)
    }
  }

  public activate(): void {
    if (!this.audio) return
    this.audio.play(this.loops)
    this.logger.debug("play")
  }

  public deactivate(): void {
    if (!this.audio) return
    this.audio.stop(true)
    this.logger.debug("stop")
  }

  public localize(): void {}
}
