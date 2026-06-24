/**
 * Specs Inc. 2026
 * World Label component for the BLE Playground Spectacles lens.
 */
@component
export class WorldLabel extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WorldLabel – world-space label with scale-in animation</span><br/><span style="color: #94A3B8; font-size: 11px;">Scales from zero to full size after a random delay; hides the frame background when the text is empty.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Render mesh visual used as the label background frame; hidden when text length is zero")
  frameRend: RenderMeshVisual

  @input
  @hint("Text component that displays the label content")
  public textComp: Text

  private trans: Transform = null

  onAwake() {
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
