import WorldCameraFinderProvider from "InteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import Event from "InteractionKit.lspkg/Utils/Event";
import { Frame } from "UIKit.lspkg/Scripts/Components/Frame/Frame";
import { Button } from "UIKit.lspkg/Scripts/Components/Button/Button";
import { createSystemButton } from "../../../UI/Shared/SystemButton";
import { BackPlate } from "UIKit.lspkg/Scripts/BackPlate";
import { Tooltip } from "UIKit.lspkg/Scripts/Tooltip";
import { createImage } from "../../../UI/Shared/ImageFactory";
import {
  TRASH_TEXTURE,
  ATTACH_TEXTURE,
  ICON_Z_OFFSET,
} from "../../../UI/Shared/UIConstants";
import { createTooltip } from "../../../UI/Shared/UIBuilders";
import { CaptureController } from "../Controllers/CaptureController";

const OFFSET_CM = 0.1;
const OVERLAY_Z_OFFSET = 0.2;
const BUTTON_WIDTH = 4;
const BUTTON_ICON_SIZE = 2;
const OVERLAY_HEIGHT = 7;
const BUTTON_MARGIN = 1;
const TOOLTIP_Y_OFFSET = -3;
const TOOLTIP_Z_OFFSET = 0.25;

@component
export class CropGestureFrame extends BaseScriptComponent {
  public picAnchorObj: SceneObject;
  public captureController: CaptureController;

  public readonly onDeletePressed = new Event();
  public readonly onAttachPressed = new Event();

  private frame: Frame;
  private picAnchorTrans: Transform;
  private frameTrans: Transform;
  private camTrans: Transform;

  private isTranslating: boolean = false;
  private parentTrans: Transform;

  private overlayContainer: SceneObject;
  private backPlate: BackPlate;
  private deleteBtn: Button;
  private attachBtn: Button;
  private deleteTooltip: Tooltip;
  private attachTooltip: Tooltip;

  private readonly _scratchInnerSize = new vec2(0, 0);
  private readonly _scratchOverlaySize = new vec2(0, 0);
  /** While closing, stop the frame tracking the shrinking picture so its
   *  innerSize never drops below the border/corner radius (which flips it). */
  private sizeFrozen = false;
  private _lastPicScaleX = -1;
  private _lastPicScaleY = -1;

  onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  private onStart() {
    this.parentTrans = this.getSceneObject().getParent().getTransform();
    this.picAnchorTrans = this.picAnchorObj.getTransform();
    this.frame = this.getSceneObject().getComponent(Frame.getTypeName());
    this.frameTrans = this.getSceneObject().getTransform();
    this.camTrans = WorldCameraFinderProvider.getInstance().getTransform();

    this.buildOverlayButtons();

    // The Frame self-initializes on its OnStartEvent (the new UIKit
    // dropped the manual initialize()). Gate all Frame access on onInitialized
    // (a ReplayEvent), and bind LateUpdate here too since it reads
    // frame.innerSize.
    this.frame.onInitialized.add(() => {
      this.frame.onTranslationStart.add(() => {
        this.isTranslating = true;
      });

      this.frame.onTranslationEnd.add(() => {
        this.isTranslating = false;
      });
      this.frame.showCloseButton = true;
      this.frame.closeButton.initialize();
      this.frame.closeButton.onTriggerUp.add(this.onFrameClosed.bind(this));

      const closeTooltip = createTooltip(
        this.frame.closeButton.getSceneObject(),
        "Close",
        {
          offset: new vec3(0, TOOLTIP_Y_OFFSET, TOOLTIP_Z_OFFSET),
          hoverSource: this.frame.closeButton,
        },
      );

      this.showFrame(false);

      this.createEvent("LateUpdateEvent").bind(this.onLateUpdate.bind(this));
    });
  }

  private buildOverlayButtons() {
    this.overlayContainer = global.scene.createSceneObject("OverlayContainer");
    this.overlayContainer.setParent(this.getSceneObject());

    const plateObj = global.scene.createSceneObject("OverlayBackPlate");
    plateObj.setParent(this.overlayContainer);
    this.backPlate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    this.backPlate.style = "dark";

    const deleteBtnObj = global.scene.createSceneObject("DeleteButton");
    deleteBtnObj.setParent(plateObj);
    this.deleteBtn = createSystemButton(deleteBtnObj, "Secondary");
    this.deleteBtn.size = new vec3(BUTTON_WIDTH, BUTTON_WIDTH, 1);
    this.deleteBtn.initialize();

    createImage(TRASH_TEXTURE, {
      parent: deleteBtnObj,
      name: "DeleteIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: BUTTON_ICON_SIZE,
    });

    this.deleteTooltip = createTooltip(deleteBtnObj, "Delete Image", {
      offset: new vec3(0, TOOLTIP_Y_OFFSET, TOOLTIP_Z_OFFSET),
    });

    const attachBtnObj = global.scene.createSceneObject("AttachButton");
    attachBtnObj.setParent(plateObj);
    this.attachBtn = createSystemButton(attachBtnObj, "Primary");
    this.attachBtn.size = new vec3(BUTTON_WIDTH, BUTTON_WIDTH, 1);
    this.attachBtn.initialize();

    createImage(ATTACH_TEXTURE, {
      parent: attachBtnObj,
      name: "AttachIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: BUTTON_ICON_SIZE,
    });

    this.attachTooltip = createTooltip(attachBtnObj, "Attach to chat", {
      offset: new vec3(0, TOOLTIP_Y_OFFSET, TOOLTIP_Z_OFFSET),
    });

    this.deleteBtn.onTriggerUp.add(() => this.onDeletePressed.invoke());
    this.attachBtn.onTriggerUp.add(() => this.onAttachPressed.invoke());

    this.deleteBtn.onHoverEnter.add(() => this.deleteTooltip.setOn(true));
    this.deleteBtn.onHoverExit.add(() => this.deleteTooltip.setOn(false));
    this.attachBtn.onHoverEnter.add(() => this.attachTooltip.setOn(true));
    this.attachBtn.onHoverExit.add(() => this.attachTooltip.setOn(false));
  }

  private updateOverlayLayout(picScale: vec2) {
    if (picScale.x <= 0 || picScale.y <= 0) {
      return;
    }
    const plateY = -picScale.y / 2 + OVERLAY_HEIGHT / 2;

    this.backPlate.size = new vec2(picScale.x, OVERLAY_HEIGHT);
    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, plateY, OVERLAY_Z_OFFSET));

    const halfW = picScale.x / 2;
    const btnEdgeX = halfW - BUTTON_WIDTH / 2 - BUTTON_MARGIN;

    const deleteBtnObj = this.deleteBtn.getSceneObject();
    deleteBtnObj
      .getTransform()
      .setLocalPosition(new vec3(-btnEdgeX, 0, ICON_Z_OFFSET));

    const attachBtnObj = this.attachBtn.getSceneObject();
    attachBtnObj
      .getTransform()
      .setLocalPosition(new vec3(btnEdgeX, 0, ICON_Z_OFFSET));
  }

  private onFrameClosed() {
    this.captureController.closeCaptureGesture();
  }

  public openFrame() {
    this.sizeFrozen = false;
    this._lastPicScaleX = -1;
    this._lastPicScaleY = -1;
    this.showFrame(true);
  }

  public async closeFrame() {
    this.sizeFrozen = true;
    this.overlayContainer.enabled = false;
    await this.showFrame(false);
  }

  private async showFrame(show: boolean) {
    // Frame.tweenOpacity only fades the body when autoShowHide is on, so it
    // must be set before showVisual (it was left false by the last close).
    // On hide it is still true from the open, so the body fades out.
    if (show) {
      this.frame.autoShowHide = true;
      await this.frame.showVisual();
    } else {
      await this.frame.hideVisual();
    }
    this.frame.collider.enabled = show;
    this.frame.showCloseButton = show;
    this.frame.autoShowHide = show;
    this.overlayContainer.enabled = show;
  }

  private onLateUpdate() {
    if (this.isTranslating) {
      const framePos = this.frameTrans.getWorldPosition()
        .add(this.frameTrans.forward.uniformScale(OFFSET_CM * 2));
      const lookRotation = quat.lookAt(this.camTrans.forward, vec3.up());
      this.picAnchorTrans.setWorldPosition(framePos);
      this.frameTrans.setWorldRotation(lookRotation);
      this.picAnchorTrans.setWorldRotation(lookRotation);
    } else {
      const picPos = this.picAnchorTrans.getWorldPosition()
        .add(this.picAnchorTrans.forward.uniformScale(-OFFSET_CM));
      this.frameTrans.setWorldPosition(picPos);
      this.frameTrans.setWorldRotation(this.picAnchorTrans.getWorldRotation());

      const picScale = this.picAnchorTrans.getWorldScale();
      const scaleChanged =
        Math.abs(picScale.x - this._lastPicScaleX) > 0.0001 ||
        Math.abs(picScale.y - this._lastPicScaleY) > 0.0001;

      if (scaleChanged && !this.sizeFrozen) {
        this._lastPicScaleX = picScale.x;
        this._lastPicScaleY = picScale.y;
        this._scratchInnerSize.x = picScale.x;
        this._scratchInnerSize.y = picScale.y;
        this.frame.innerSize = this._scratchInnerSize;
        this._scratchOverlaySize.x = picScale.x;
        this._scratchOverlaySize.y = picScale.y;
        this.updateOverlayLayout(this._scratchOverlaySize);
      }
    }
  }
}
