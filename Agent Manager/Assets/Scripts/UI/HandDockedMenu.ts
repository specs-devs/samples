import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { createImage } from "./Shared/ImageFactory";
import {
  BOT_GROUP_TEXTURE,
  ICON_Z_OFFSET,
  TOOLTIP_OFFSET,
} from "./Shared/UIConstants";
import { createTooltip } from "./Shared/UIBuilders";

const POS_LERP = 0.25;
const ROT_LERP = 0.25;
const ULNAR_OFFSET = 4;
const BTN_SIZE = 3;
const ICON_SIZE = BTN_SIZE * 0.5;
const SHOW_ANIM_DURATION = 0.2;
const EDITOR_DISTANCE = -50;
const EDITOR_RIGHT_OFFSET = 0;
const EDITOR_DOWN_OFFSET = 0.25;

@component
export class HandDockedMenu extends BaseScriptComponent {
  public readonly onMenuButtonTapped = new Event<void>();

  private handProvider: HandInputData = SIK.HandInputData;
  private leftHand = this.handProvider.getHand("left");
  private rightHand = this.handProvider.getHand("right");
  private menuHand = this.leftHand;
  private camera = WorldCameraFinderProvider.getInstance();
  private gestureModule: GestureModule = require("LensStudio:GestureModule");

  private isShown = false;
  private panelActive = false;
  private animCancel = new CancelSet();
  private buttonObj: SceneObject;
  private button: RoundButton;
  private menuTooltip: Tooltip;
  private phoneInLeftHand = false;
  private phoneInRightHand = false;

  onAwake(): void {
    this.buttonObj = global.scene.createSceneObject("MenuButton");
    this.buttonObj.setParent(this.getSceneObject());
    this.buttonObj.getTransform().setLocalPosition(vec3.zero());

    this.button = this.buttonObj.createComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;

    createImage(BOT_GROUP_TEXTURE, {
      parent: this.buttonObj,
      name: "MenuIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: ICON_SIZE * 1.25,
    });

    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    this.createEvent("OnStartEvent").bind(() => this.onStart());

    this.bindPhoneInHandEvents();

    const delay = this.createEvent("DelayedCallbackEvent");
    delay.bind(() => {
      if (global.deviceInfoSystem.isEditor()) {
        this.showMenu();
      } else {
        this.hideMenu();
      }
    });
    delay.reset(0.25);
  }

  private bindPhoneInHandEvents(): void {
    this.gestureModule
      .getIsPhoneInHandBeginEvent(GestureModule.HandType.Left)
      .add(() => {
        this.phoneInLeftHand = true;
      });
    this.gestureModule
      .getIsPhoneInHandEndEvent(GestureModule.HandType.Left)
      .add(() => {
        this.phoneInLeftHand = false;
      });
    this.gestureModule
      .getIsPhoneInHandBeginEvent(GestureModule.HandType.Right)
      .add(() => {
        this.phoneInRightHand = true;
      });
    this.gestureModule
      .getIsPhoneInHandEndEvent(GestureModule.HandType.Right)
      .add(() => {
        this.phoneInRightHand = false;
      });
  }

  private onStart(): void {
    this.button.setIsToggleable(true);
    const btnRecord = this.button as unknown as Record<string, string>;
    btnRecord["_style"] = "Ghost";
    this.button.initialize();
    this.button.toggle(this.panelActive);
    this.button.width = BTN_SIZE;

    this.menuTooltip = createTooltip(this.buttonObj, "Menu", {
      offset: TOOLTIP_OFFSET.uniformScale(0.75),
      scale: 0.5,
      hoverSource: this.button,
    });

    this.button.onTriggerUp.add(() => {
      this.onMenuButtonTapped.invoke();
    });
  }

  setPanelActive(active: boolean): void {
    this.panelActive = active;
    this.button.toggle(active);
  }

  private onUpdate(): void {
    if (global.deviceInfoSystem.isEditor()) {
      this.positionMenu();
      return;
    }

    this.checkForMenuActivation();
    if (this.isShown) {
      this.positionMenu();
    }
  }

  private updateActiveHand(): void {
    const leftFacing =
      this.leftHand.isTracked() && this.leftHand.isFacingCamera();
    const rightFacing =
      this.rightHand.isTracked() && this.rightHand.isFacingCamera();
    if (leftFacing && !rightFacing) {
      this.menuHand = this.leftHand;
    } else if (rightFacing && !leftFacing) {
      this.menuHand = this.rightHand;
    }
  }

  private checkForMenuActivation(): void {
    if (global.deviceInfoSystem.isEditor()) {
      return;
    }

    const phoneHeld = this.phoneInLeftHand || this.phoneInRightHand;

    if (!phoneHeld) {
      this.updateActiveHand();
    }

    if (
      !phoneHeld &&
      this.menuHand.isTracked() &&
      this.menuHand.isFacingCamera()
    ) {
      if (!this.isShown) {
        this.showMenu();
      }
    } else {
      if (this.isShown) {
        this.hideMenu();
      }
    }
  }

  private positionMenu(): void {
    const transform = this.getSceneObject().getTransform();

    if (global.deviceInfoSystem.isEditor()) {
      this.positionMenuEditor(transform);
      return;
    }

    this.positionMenuDevice(transform);
  }

  private positionMenuEditor(transform: Transform): void {
    const camPos = this.camera.getWorldPosition();
    const fwd = this.camera.forward();
    const right = this.camera.right();
    const down = this.camera.up().uniformScale(-1);

    const menuPosition = camPos
      .add(fwd.uniformScale(EDITOR_DISTANCE))
      .add(right.uniformScale(EDITOR_DISTANCE * EDITOR_RIGHT_OFFSET))
      .add(down.uniformScale(EDITOR_DISTANCE * EDITOR_DOWN_OFFSET));

    const curPosition = transform.getWorldPosition();
    const delta = curPosition.sub(menuPosition).length;
    if (delta > 0.01) {
      transform.setWorldPosition(
        vec3.lerp(curPosition, menuPosition, POS_LERP),
      );
      const toCamera = camPos.sub(menuPosition).normalize();
      transform.setWorldRotation(quat.lookAt(toCamera, vec3.up()));
    }
  }

  private positionMenuDevice(transform: Transform): void {
    const handPosition = this.menuHand.pinkyKnuckle.position;
    const handRight = this.menuHand.indexTip.right;
    const ulnarSign = this.menuHand.handType === "right" ? -1 : 1;

    const curPosition = transform.getWorldPosition();
    const menuPosition = handPosition.add(
      handRight.uniformScale(ULNAR_OFFSET * ulnarSign),
    );

    const delta = curPosition.sub(menuPosition).length;
    if (delta < 0.01) return;

    const nPosition = vec3.lerp(curPosition, menuPosition, POS_LERP);
    transform.setWorldPosition(nPosition);

    const toCamera = this.camera.getWorldPosition().sub(nPosition).normalize();
    const targetRot = quat.lookAt(toCamera, vec3.up());
    const curRot = transform.getWorldRotation();
    transform.setWorldRotation(quat.slerp(curRot, targetRot, ROT_LERP));
  }

  private showMenu(): void {
    this.isShown = true;
    this.buttonObj.enabled = true;
    this.button.toggle(this.panelActive);
    this.animCancel.cancel();

    animate({
      cancelSet: this.animCancel,
      duration: SHOW_ANIM_DURATION,
      update: (t: number) => {
        const s = MathUtils.lerp(0.01, 1, t);
        this.buttonObj.getTransform().setLocalScale(new vec3(s, s, s));
      },
    });
  }

  private hideMenu(): void {
    this.isShown = false;
    this.animCancel.cancel();
    this.buttonObj.enabled = false;
  }
}
