/**
 * Specs Inc. 2026
 * Caption Behavior component for the Crop Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"

@component
export class CaptionBehavior extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CaptionBehavior – displays AI caption text with scale-in animation</span><br/><span style="color: #94A3B8; font-size: 11px;">Receives caption text and a world position and rotation, then animates the caption into view.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component that displays the caption content")
  captionText: Text

  @input
  @hint("Scene object whose scale is animated when the caption appears")
  scaleObj: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  private trans: Transform
  private scaleTrans: Transform
  private startPos: vec3

  private scaleCancel: CancelSet = new CancelSet()

  onAwake() {
    this.logger = new Logger("CaptionBehavior", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    this.trans = this.getSceneObject().getTransform()
    this.scaleTrans = this.scaleObj.getTransform()
    this.scaleTrans.setLocalScale(vec3.zero())
  }

  openCaption(text: string, pos: vec3, rot: quat) {
    this.startPos = pos
    this.captionText.text = text
    this.trans.setWorldPosition(pos)
    this.trans.setWorldRotation(rot)
    this.trans.setWorldScale(vec3.one().uniformScale(0.5))
    //animate in caption
    if (this.scaleCancel) this.scaleCancel.cancel()
    animate({
      easing: "ease-out-elastic",
      duration: 1,
      update: (t: number) => {
        this.scaleTrans.setLocalScale(vec3.lerp(vec3.zero(), vec3.one().uniformScale(1.33), t))
      },
      ended: null,
      cancelSet: this.scaleCancel
    })
  }
}
