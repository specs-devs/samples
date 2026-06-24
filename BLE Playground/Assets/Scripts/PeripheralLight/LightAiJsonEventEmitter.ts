/**
 * Specs Inc. 2026
 * Defines Light Ai Json Event Emitter, Light Key Frame, Light Key Frame Sequence for the BLE
 * Playground lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {LightAiEventListener} from "./LightAiEventListener"

export type LightKeyFrame = {
  lightIndex: number
  brightness: number
  color: [r: number, g: number, b: number]
  time: number
}

export type LightKeyFrameSequence = {
  keyframes: LightKeyFrame[]
}

@component
export class LightAiJsonEventEmitter extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LightAiJsonEventEmitter – keyframe animation player</span><br/><span style="color: #94A3B8; font-size: 11px;">Drives light listeners through a looping JSON keyframe sequence received from the AI.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Render mesh visuals used for editor-only debug sphere color feedback")
  rmvs: RenderMeshVisual[]

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private mats: Material[]

  private lightKeyFrameSequence: LightKeyFrameSequence
  private updateEvent: UpdateEvent
  private startTime: number
  private keyFramesPlayed: boolean[]
  private lightAiEventListeners: LightAiEventListener[]
  private aiLightDataCount: number // The number of lights we have data for
  private loopLength: number

  onAwake() {
    this.logger = new Logger("LightAiJsonEventEmitter", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.lightAiEventListeners = []
    this.keyFramesPlayed = []
    this.mats = []
    for (let i = 0; i < this.rmvs.length; i++) {
      const mat = this.rmvs[i].mainMaterial.clone()
      this.rmvs[i].mainMaterial = mat
      this.mats.push(mat)
    }

    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(() => this.onUpdate())
    this.updateEvent.enabled = false
  }

  onUpdate() {
    const loopTime = getTime() - this.startTime

    if (
      this.lightKeyFrameSequence === undefined ||
      this.lightKeyFrameSequence.keyframes === undefined ||
      this.lightKeyFrameSequence.keyframes.length === 0
    ) {
      this.logger.warn("onUpdate lightKeyFrameSequence not fully defined.")
      return
    }

    for (let i = 0; i < this.lightKeyFrameSequence.keyframes.length; i++) {
      if (
        this.lightKeyFrameSequence.keyframes[i] !== undefined &&
        this.lightKeyFrameSequence.keyframes[i].time !== undefined
      ) {
        if (!this.keyFramesPlayed[i]) {
          if (loopTime > this.lightKeyFrameSequence.keyframes[i].time) {
            this.emitEvent(this.lightKeyFrameSequence.keyframes[i])
            this.keyFramesPlayed[i] = true
          }
        }
      } else {
        this.logger.warn("onUpdate keyframe not fully defined")
      }
    }
    if (loopTime > this.loopLength + 1.5) {
      this.resetLoop()
    }
  }

  private resetLoop() {
    this.keyFramesPlayed = []
    for (let i = 0; i < this.lightKeyFrameSequence.keyframes.length; i++) {
      this.keyFramesPlayed.push(false)
    }
    this.startTime = getTime()
  }

  startAnimation(
    jsonObj: LightKeyFrameSequence,
    lightAiEventListeners: LightAiEventListener[],
    aiLightDataCount: number,
    loopLength: number
  ) {
    this.aiLightDataCount = aiLightDataCount
    this.loopLength = loopLength
    this.lightAiEventListeners = lightAiEventListeners
    this.lightKeyFrameSequence = jsonObj
    this.resetLoop()
    this.updateEvent.enabled = true
  }

  stopAnimation() {
    this.updateEvent.enabled = false
  }

  private emitEvent(lightKeyFrame: LightKeyFrame) {
    if (
      lightKeyFrame === undefined ||
      lightKeyFrame.lightIndex === undefined ||
      lightKeyFrame.brightness === undefined ||
      lightKeyFrame.color === undefined
    ) {
      this.logger.warn("emitEvent: lightKeyFrame, index, brightness, or color undefined.")
      return
    }

    // Because the ai instruction is sent when the websocket connects, the ai generates keyframes for a hardcoded number of lights.
    // If we have more lights than ai data, then one ai data will set multiple lights.
    for (let i = 0; i < this.lightAiEventListeners.length; i++) {
      const aiDataIndex = i % this.aiLightDataCount
      if (lightKeyFrame.lightIndex === aiDataIndex) {
        this.lightAiEventListeners[i].onAiSetBrightnessAndColor(
          lightKeyFrame.brightness,
          lightKeyFrame.color[0],
          lightKeyFrame.color[1],
          lightKeyFrame.color[2]
        )
      }
    }
  }
}
