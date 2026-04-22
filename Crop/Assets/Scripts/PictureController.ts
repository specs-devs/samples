/**
 * Specs Inc. 2026
 * Picture Controller for the Crop Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"

@component
export class PictureController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PictureController – spawns crop scanner on dual pinch</span><br/><span style="color: #94A3B8; font-size: 11px;">Detects simultaneous close pinch from both hands to instantiate the scanner prefab.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Prefab instantiated when both hands pinch close together")
  scannerPrefab: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  private isEditor = global.deviceInfoSystem.isEditor()

  private rightHand = SIK.HandInputData.getHand("right")
  private leftHand = SIK.HandInputData.getHand("left")

  private leftDown = false
  private rightDown = false

  onAwake() {
    this.logger = new Logger("PictureController", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    this.rightHand.onPinchUp.add(this.rightPinchUp)
    this.rightHand.onPinchDown.add(this.rightPinchDown)
    this.leftHand.onPinchUp.add(this.leftPinchUp)
    this.leftHand.onPinchDown.add(this.leftPinchDown)
    if (this.isEditor) {
      this.createEvent("TouchStartEvent").bind(this.editorTest.bind(this))
    } else {
      const obj = this.getSceneObject()
      if (obj.getChildrenCount() > 0) {
        obj.getChild(0).destroy()
      }
    }
  }

  editorTest() {
    this.logger.info("Creating Editor Scanner...")
    this.createScanner()
  }

  private leftPinchDown = () => {
    this.logger.debug("LEFT Pinch down")
    this.leftDown = true
    if (this.rightDown && this.isPinchClose()) {
      this.createScanner()
    }
  }

  private leftPinchUp = () => {
    this.logger.debug("LEFT Pinch up")
    this.leftDown = false
  }

  private rightPinchDown = () => {
    this.logger.debug("RIGHT Pinch down")
    this.rightDown = true
    if (this.leftDown && this.isPinchClose()) {
      this.createScanner()
    }
  }

  private rightPinchUp = () => {
    this.logger.debug("RIGHT Pinch up")
    this.rightDown = false
  }

  isPinchClose() {
    return this.leftHand.thumbTip.position.distance(this.rightHand.thumbTip.position) < 10
  }

  createScanner() {
    const scanner = this.scannerPrefab.instantiate(this.getSceneObject())
  }
}
