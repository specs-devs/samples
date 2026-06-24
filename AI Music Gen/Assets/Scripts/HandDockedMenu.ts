/**
 * Specs Inc. 2026
 * Hand Docked Menu component for the AI Music Gen Spectacles lens.
 */
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {HandInputData} from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class HandDockedMenu extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Hand Docked Menu – left-palm tracking menu</span><br/><span style="color: #94A3B8; font-size: 11px;">Shows category buttons when the palm faces the camera; hides otherwise.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Layout</span>')
  @input
  @hint("Horizontal spacing in cm between adjacent menu buttons")
  public buttonHorizontalSpacing: number = 1

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private menuButtons: SceneObject[] = []
  private menuButtonTransforms: Transform[] = []
  private buttonAnimations: CancelSet[] = []

  private isShown: boolean = false

  private handProvider: HandInputData = SIK.HandInputData
  private menuHand = this.handProvider.getHand("left")

  private mCamera = WorldCameraFinderProvider.getInstance()

  onAwake() {
    this.logger = new Logger("HandDockedMenu", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    for (let index = 0; index < this.getSceneObject().getChildrenCount(); index++) {
      this.menuButtons[index] = this.getSceneObject().getChild(index)
      this.menuButtonTransforms[index] = this.getSceneObject().getChild(index).getTransform()
    }

    this.layoutMenu()

    const delay = this.createEvent("DelayedCallbackEvent")
    delay.bind(() => {
      if (global.deviceInfoSystem.isEditor()) {
        this.showMenu()
      } else {
        this.hideMenu()
      }
    })
    delay.reset(0.25)
  }

  @bindUpdateEvent
  onUpdate(): void {
    this.positionMenu()
    this.checkforMenuActivation()
  }

  layoutMenu() {
    for (let index = 0; index < this.menuButtons.length; index++) {
      const buttonTransform = this.menuButtonTransforms[index]
      buttonTransform.setLocalPosition(new vec3(this.buttonHorizontalSpacing * (index + 1), 0, 0))
      buttonTransform.setLocalRotation(quat.quatIdentity())
    }
  }

  checkforMenuActivation() {
    if (global.deviceInfoSystem.isEditor()) {
      return
    }

    if (this.menuHand.isTracked() && this.menuHand.isFacingCamera()) {
      if (!this.isShown) {
        this.showMenu()
      }
    } else {
      if (this.isShown) {
        this.hideMenu()
      }
    }
  }

  positionMenu() {
    const handPosition = this.menuHand.pinkyKnuckle.position
    const handRight = this.menuHand.indexTip.right

    const curPosition = this.getSceneObject().getTransform().getWorldPosition()
    let menuPosition = handPosition.add(handRight.uniformScale(1.5))

    if (global.deviceInfoSystem.isEditor()) {
      menuPosition = this.mCamera.getWorldPosition().add(new vec3(0, -20, -25))
    }

    const nPosition = vec3.lerp(curPosition, menuPosition, 0.2)
    this.getSceneObject().getTransform().setWorldPosition(nPosition)

    let billboardPos = this.mCamera.getWorldPosition().add(this.mCamera.forward().uniformScale(5))
    billboardPos = billboardPos.add(this.mCamera.right().uniformScale(-5))
    const dir = billboardPos.sub(menuPosition).normalize()
    this.getSceneObject().getTransform().setWorldRotation(quat.lookAt(dir, vec3.up()))
  }

  showMenu() {
    this.isShown = true
    for (let i = 0; i < this.menuButtons.length; i++) {
      const btn = this.menuButtons[i]
      btn.enabled = true

      if (i < this.buttonAnimations.length) {
        this.buttonAnimations[i]()
      } else {
        this.buttonAnimations[i] = new CancelSet()
      }

      animate({
        cancelSet: this.buttonAnimations[i],
        duration: 0.2,
        delayFrames: i * 4,
        update: (t: number) => {
          //btn.getChild(0).getComponent("Component.RenderMeshVisual").mainMaterial.mainPass.opacity = MathUtils.lerp(0, 1, t)
          const s = MathUtils.lerp(1.0, 1.3, t)
          btn.getTransform().setLocalScale(new vec3(s, s, s))
        }
      })
    }
  }

  hideMenu() {
    this.isShown = false
    this.menuButtons.forEach((btn) => {
      btn.enabled = false
    })
  }
}
