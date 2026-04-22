/**
 * Specs Inc. 2026
 * Picture Behavior component for the Crop Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {CaptionBehavior} from "./CaptionBehavior"
import {ChatGPT} from "./ChatGPT"
import {CropRegion} from "./CropRegion"

const BOX_MIN_SIZE = 8 //min size in cm for image capture

@component
export class PictureBehavior extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PictureBehavior – positions crop area and triggers image capture</span><br/><span style="color: #94A3B8; font-size: 11px;">Tracks hand pinch positions to define the crop rectangle and sends the image to ChatGPT on release.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Scene References</span>')
  @input
  @hint("Corner objects defining the four crop boundary points")
  circleObjs: SceneObject[]

  @input
  @hint("Camera object used for positioning in editor preview mode")
  editorCamObj: SceneObject

  @input
  @hint("Anchor transform that frames and scales the captured image")
  picAnchorObj: SceneObject

  @input
  @hint("Loading indicator shown while awaiting AI response")
  loadingObj: SceneObject

  @input
  @hint("Render mesh visual that displays the captured crop image")
  captureRendMesh: RenderMeshVisual

  @input
  @hint("Camera crop texture that provides the cropped region feed")
  screenCropTexture: Texture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Dependencies</span>')
  @input
  @hint("CropRegion component that controls the crop rectangle texture")
  cropRegion: CropRegion

  @input
  @hint("ChatGPT component that sends the captured image for AI analysis")
  chatGPT: ChatGPT

  @input
  @hint("CaptionBehavior component that displays the AI response text")
  caption: CaptionBehavior

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

  private camTrans: Transform
  private loadingTrans: Transform

  private circleTrans: Transform[]

  private rightHand = SIK.HandInputData.getHand("right")
  private leftHand = SIK.HandInputData.getHand("left")

  private picAnchorTrans = null

  private leftDown = true
  private rightDown = true
  private rotMat = new mat3()

  private updateEvent = null

  onAwake() {
    this.logger = new Logger("PictureBehavior", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    this.loadingObj.enabled = false
    this.loadingTrans = this.loadingObj.getTransform()
    this.captureRendMesh.mainMaterial = this.captureRendMesh.mainMaterial.clone()

    this.camTrans = this.editorCamObj.getTransform()

    this.picAnchorTrans = this.picAnchorObj.getTransform()
    this.circleTrans = this.circleObjs.map((obj) => obj.getTransform())

    this.rightHand.onPinchUp.add(this.rightPinchUp)
    this.rightHand.onPinchDown.add(this.rightPinchDown)
    this.leftHand.onPinchUp.add(this.leftPinchUp)
    this.leftHand.onPinchDown.add(this.leftPinchDown)

    if (this.isEditor) {
      //place this transform in front of camera for testing
      const trans = this.getSceneObject().getTransform()
      trans.setWorldPosition(this.camTrans.getWorldPosition().add(this.camTrans.forward.uniformScale(-60)))
      trans.setWorldRotation(quat.lookAt(this.camTrans.forward, vec3.up()))
      //wait for small delay and capture image
      const delayedEvent = this.createEvent("DelayedCallbackEvent")
      delayedEvent.bind(() => {
        this.loadingObj.enabled = true
        this.cropRegion.enabled = false
        this.captureRendMesh.mainPass.captureImage = ProceduralTextureProvider.createFromTexture(this.screenCropTexture)
        this.chatGPT.makeImageRequest(this.captureRendMesh.mainPass.captureImage, (response) => {
          this.loadingObj.enabled = false
          this.loadCaption(response)
        })
      })
      delayedEvent.reset(0.1)
    } else {
      //send offscreen
      this.getSceneObject().getTransform().setWorldPosition(vec3.up().uniformScale(1000))
      this.updateEvent = this.createEvent("UpdateEvent")
      this.updateEvent.bind(this.update.bind(this))
    }
  }

  private leftPinchDown = () => {
    this.logger.debug("LEFT Pinch down")
    this.leftDown = true
  }

  private leftPinchUp = () => {
    this.logger.debug("LEFT Pinch up")
    this.leftDown = false
    if (!this.rightDown) {
      this.processImage()
    }
  }

  private rightPinchDown = () => {
    this.logger.debug("RIGHT Pinch down")
    this.rightDown = true
  }

  private rightPinchUp = () => {
    this.logger.debug("RIGHT Pinch up")
    this.rightDown = false
    if (!this.leftDown) {
      this.processImage()
    }
  }

  private loadCaption(text: string) {
    //position caption 5cm above top of box formed by circles
    const topCenterPos = this.circleTrans[0]
      .getWorldPosition()
      .add(this.circleTrans[1].getWorldPosition())
      .uniformScale(0.5)
    const captionPos = topCenterPos.add(this.picAnchorTrans.up.uniformScale(1)) //1.5
    const captionRot = this.picAnchorTrans.getWorldRotation()
    this.caption.openCaption(text, captionPos, captionRot)
  }

  private processImage() {
    if (this.updateEvent != null) {
      //remove all events
      this.removeEvent(this.updateEvent)
      this.updateEvent = null
      this.rightHand.onPinchUp.remove(this.rightPinchUp)
      this.rightHand.onPinchDown.remove(this.rightPinchDown)
      this.leftHand.onPinchUp.remove(this.leftPinchUp)
      this.leftHand.onPinchDown.remove(this.leftPinchDown)
      //make sure image area is above threshold
      if (this.getHeight() < BOX_MIN_SIZE || this.getWidth() < BOX_MIN_SIZE) {
        this.logger.warn("too small, destroying.")
        this.getSceneObject().destroy()
        return
      }
      //remove update loop and process image
      this.loadingObj.enabled = true
      this.cropRegion.enabled = false

      this.chatGPT.makeImageRequest(this.captureRendMesh.mainPass.captureImage, (response) => {
        this.loadingObj.enabled = false
        this.loadCaption(response)
      })
    }
  }

  localTopLeft() {
    return this.camTrans.getInvertedWorldTransform().multiplyPoint(this.circleTrans[0].getWorldPosition())
  }

  localBottomRight() {
    return this.camTrans.getInvertedWorldTransform().multiplyPoint(this.circleTrans[2].getWorldPosition())
  }

  getWidth() {
    return Math.abs(this.localBottomRight().x - this.localTopLeft().x)
  }

  getHeight() {
    return Math.abs(this.localBottomRight().y - this.localTopLeft().y)
  }

  update() {
    if (this.rightDown || this.leftDown) {
      //have to do this or else it wont show up in capture
      if (this.screenCropTexture.getColorspace() == 3) {
        this.captureRendMesh.mainPass.captureImage = ProceduralTextureProvider.createFromTexture(this.screenCropTexture)
      }

      //set top left and bottom right to both pinch positions
      this.circleTrans[0].setWorldPosition(this.leftHand.thumbTip.position)
      this.circleTrans[2].setWorldPosition(this.rightHand.thumbTip.position)
      const topLeftPos = this.circleTrans[0].getWorldPosition()
      const bottomRightPos = this.circleTrans[2].getWorldPosition()
      const centerPos = topLeftPos.add(bottomRightPos).uniformScale(0.5)
      const camPos = this.camTrans.getWorldPosition()
      const directionToCenter = camPos.sub(centerPos).normalize()
      const right = this.camTrans.up.cross(directionToCenter).normalize()

      //set top right and bottom left to remaining points to form a rectangle relative to worldCameraForward
      const width = this.getWidth()
      const topRightPos = topLeftPos.add(right.uniformScale(width)) // Add width along the X-axis
      const bottomLeftPos = bottomRightPos.add(right.uniformScale(-width)) // Subtract height along the Y-axis

      // Set the positions for the remaining corners
      this.circleTrans[1].setWorldPosition(topRightPos) // Top right
      this.circleTrans[3].setWorldPosition(bottomLeftPos) // Bottom left

      // rotate the picAnchorTrans to stay aligned with the box formed by the circles
      this.picAnchorTrans.setWorldPosition(bottomRightPos)
      const worldWidth = bottomRightPos.distance(bottomLeftPos)
      const worldHeight = topRightPos.distance(bottomRightPos)
      this.picAnchorTrans.setWorldScale(new vec3(worldWidth, worldHeight, 1))
      const rectRight = topRightPos.sub(topLeftPos).normalize()
      const rectUp = topLeftPos.sub(bottomLeftPos).normalize()
      const rectForward = rectRight.cross(rectUp).normalize()
      this.rotMat.column0 = rectRight
      this.rotMat.column1 = rectUp
      this.rotMat.column2 = rectForward
      const rectRotation = quat.fromRotationMat(this.rotMat)
      this.picAnchorTrans.setWorldRotation(rectRotation)

      //set loader position to center of rectangle
      this.loadingTrans.setWorldPosition(centerPos.add(rectForward.uniformScale(0.2)))
      this.loadingTrans.setWorldRotation(rectRotation)
    }
  }
}
