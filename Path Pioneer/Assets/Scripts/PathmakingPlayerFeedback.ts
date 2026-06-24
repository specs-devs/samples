/**
 * Specs Inc. 2026
 * Pathmaking Player Feedback component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import {LinearAlgebra} from "./Helpers/LinearAlgebra"
import {LensInitializer} from "./LensInitializer"

@component
export class PathmakingPlayerFeedback extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PathmakingPlayerFeedback – preview joints visual</span><br/><span style="color: #94A3B8; font-size: 11px;">Updates joint transforms to visualize the upcoming path ahead.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Root visual scene object toggled on and off during path making")
  visualSo: SceneObject

  @input
  @hint("Array of joint scene objects representing the path preview points")
  jointsSo: SceneObject[]

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private tr: Transform
  private joints: Transform[] = []
  private vec3up: vec3 = vec3.up()

  onAwake() {
    this.logger = new Logger("PathmakingPlayerFeedback", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    this.tr = this.getSceneObject().getTransform()

    this.jointsSo.forEach((so) => {
      const joint = so.getTransform()
      this.joints.push(joint)
      so.enabled = false
    })
  }

  start(positions: vec3[]) {
    this.update(positions)
    this.visualSo.enabled = true
  }

  stop() {
    this.visualSo.enabled = false
  }

  update(positions: vec3[]) {
    const pos = LensInitializer.getInstance().getPlayerGroundPos()
    this.tr.setWorldPosition(pos)

    // update arrow positions
    const rotations: quat[] = LinearAlgebra.computeCurveRotations(positions)

    let lastRot: quat = quat.quatIdentity()
    // Set poses
    for (let i = 0; i < this.joints.length; i++) {
      if (i < positions.length) {
        this.jointsSo[i].enabled = true

        const targetPos = positions[i]
        this.joints[i].setWorldPosition(targetPos)

        // We need to flip this rotation for the way the art was made
        lastRot = LinearAlgebra.flippedRot(rotations[i], this.vec3up)
        this.joints[i].setWorldRotation(lastRot)
      } else {
        this.joints[i].setWorldPosition(pos)
        this.joints[i].setWorldRotation(lastRot)
      }
    }
  }
}
