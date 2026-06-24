/**
 * Specs Inc. 2026
 * World Label component for the Depth Cache Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class WorldLabel extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WorldLabel – floating label with scale-in animation</span><br/><span style="color: #94A3B8; font-size: 11px;">Attach to a scene object to animate it scaling in after a random delay.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Render mesh visual for the frame background")
  frameRend: RenderMeshVisual

  @input
  @hint("Text component displaying the label content")
  public textComp: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private trans: Transform = null

  onAwake() {
    this.logger = new Logger("WorldLabel", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.trans = this.getSceneObject().getTransform()
    this.trans.setLocalScale(vec3.zero())
    const delayTime = Math.random() * 1.7
    const delayEvent = this.createEvent("DelayedCallbackEvent")
    delayEvent.bind(() => {
      this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this))
    })
    delayEvent.reset(delayTime)
  }

  onUpdate() {
    this.trans.setLocalScale(vec3.lerp(this.trans.getLocalScale(), vec3.one(), getDeltaTime() * 7))
    const textSize = this.textComp.text.length
    this.frameRend.enabled = textSize > 0
  }
}
