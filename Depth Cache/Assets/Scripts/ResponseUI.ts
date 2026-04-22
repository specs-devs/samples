/**
 * Specs Inc. 2026
 * Response UI component for the Depth Cache Spectacles lens.
 */
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {WorldLabel} from "./WorldLabel"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

const MAIN_RESPONSE_CHARACTER_COUNT = 175

@component
export class ResponseUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ResponseUI – AI response bubble and world labels</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages the response bubble and instantiates world-space labels from Gemini output.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component displaying the AI response message")
  responseAIText: Text

  @input
  @hint("Prefab for label world objects")
  worldLabelPrefab: ObjectPrefab

  @input
  @hint("Prefab for arrow world objects")
  worldArrowPrefab: ObjectPrefab

  @input
  @hint("Root scene object for the response UI bubble")
  responseUIObj: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private responseBubbleTrans: Transform

  onAwake() {
    this.logger = new Logger("ResponseUI", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.responseBubbleTrans = this.responseUIObj.getTransform()
    this.responseBubbleTrans.setLocalScale(vec3.zero())
  }

  openResponseBubble(message: string) {
    if (message.length > MAIN_RESPONSE_CHARACTER_COUNT) {
      message = message.substring(0, MAIN_RESPONSE_CHARACTER_COUNT) + "..."
    }
    this.responseAIText.text = message
    this.animateResponseBubble(true)
  }

  closeResponseBubble() {
    this.responseAIText.text = ""
    this.animateResponseBubble(false)
  }

  loadWorldLabel(label: string, worldPosition: vec3, useArrow: boolean) {
    const prefab = useArrow ? this.worldArrowPrefab : this.worldLabelPrefab
    const labelObj = prefab.instantiate(this.getSceneObject())
    labelObj.getTransform().setWorldPosition(worldPosition)
    const worldLabel = labelObj.getComponent(WorldLabel.getTypeName())
    worldLabel.textComp.text = label
  }

  clearLabels() {
    const points = []
    for (let i = 0; i < this.getSceneObject().getChildrenCount(); i++) {
      const childObj = this.getSceneObject().getChild(i)
      points.push(childObj)
    }
    for (let i = 0; i < points.length; i++) {
      const child = points[i]
      child.destroy()
    }
  }

  private animateResponseBubble(open: boolean) {
    const currScale = this.responseBubbleTrans.getLocalScale()
    const desiredScale = open ? vec3.one() : vec3.zero()
    animate({
      easing: "ease-out-elastic",
      duration: 1,
      update: (t) => {
        this.responseBubbleTrans.setLocalScale(vec3.lerp(currScale, desiredScale, t))
      },
      ended: null,
      cancelSet: new CancelSet()
    })
  }
}
