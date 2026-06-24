/**
 * Specs Inc. 2026
 * Circle Animation component for the SnapML Starter Spectacles lens.
 */
@component
export class CircleAnimation extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CircleAnimation – calibration ring animation</span><br/><span style="color: #94A3B8; font-size: 11px;">Animates a ring mesh to visualize surface calibration progress.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Components</span>')
  @input
  @allowUndefined
  @hint("RenderMeshVisual for the calibration circle ring")
  calRenderer: RenderMeshVisual

  @input
  @allowUndefined
  @hint("Audio component played when calibration completes")
  audio: AudioComponent

  private startSize = 0
  private desiredLoadAmount = 0
  private startCompleteAnimTime = 0
  private updateEvent = null
  private audioPlayed = false
  private onCompleteCallback = null

  onAwake() {
    this.startSize = this.calRenderer.mainPass.StartSize
    this.calRenderer.mainPass.Amount = 0
    this.calRenderer.mainPass.CurrSize = this.startSize
  }

  setLoadAmount(amount: number) {
    this.desiredLoadAmount = amount
    if (this.desiredLoadAmount == 1) {
      this.startCompleteAnimTime = getTime()
    }
  }

  private update() {
    const currAmount = this.calRenderer.mainPass.Amount
    if (currAmount < 0.01) {
      this.calRenderer.mainPass.CurrSize = this.PingPong(this.startSize * 2, this.startSize * 3, getTime() * 0.75)
    } else if (currAmount > 0.99) {
      if (!this.audioPlayed) {
        this.audioPlayed = true
        this.audio.play(1)
      }

      this.calRenderer.mainPass.CurrSize = this.PingPong(0.095, 0, (getTime() - this.startCompleteAnimTime) * 1)
      if (this.calRenderer.mainPass.CurrSize < 0.001) {
        this.calRenderer.mainPass.CurrSize = 0
        this.onCompleteCallback?.()
        this.removeEvent(this.updateEvent)
      }
    }
    this.calRenderer.mainPass.Amount = MathUtils.lerp(currAmount, this.desiredLoadAmount, getDeltaTime() * 6)
  }

  private PingPong(min, max, t) {
    const range = max - min
    const freq = t * (Math.PI * 2)
    return min + 0.5 * (1 + Math.sin(freq)) * range
  }

  public startCalibration(callback: () => void) {
    this.audioPlayed = false
    this.onCompleteCallback = callback
    this.calRenderer.mainPass.Amount = 0
    this.desiredLoadAmount = 0
    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(() => {
      this.update()
    })
  }
}
