import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { CancelSet } from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { TextSize, TextFont } from "./TextSizes";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { createImage } from "./ImageFactory";
import { ICON_Z_OFFSET, CLOSE_TEXTURE, TITLE_HEIGHT, PANEL_PADDING as PADDING, Z_CONTENT } from "./UIConstants";
import { scaleIn, scaleOut } from "./UIAnimations";
import {
  createIconButton,
  createTooltip,
  createAudioComponent,
  createText,
} from "./UIBuilders";

const CONFIRM_DIALOG_SFX: AudioTrackAsset = requireAsset(
  "../../../Audio/confirmDialog.wav",
) as AudioTrackAsset;

const DIALOGUE_WIDTH = 28;
const OPTION_BTN_HEIGHT = 4;
const OPTION_GAP = 1.2;
const CLOSE_BTN_SIZE = 2.8;
const CONFIRM_BTN_WIDTH = 10;
const CONFIRM_BTN_GAP = 2.5;
const ANIM_DURATION = 0.3;

@component
export class DialogueObject extends BaseScriptComponent {
  private backPlate: BackPlate;
  private titleText: Text;
  private closeBtn: RoundButton;
  private closeTooltip: Tooltip;
  private contentContainer: SceneObject;
  private contentObjects: SceneObject[] = [];
  private animCancels = new CancelSet();
  private fullScale = vec3.one();
  private audioComponent: AudioComponent;

  public readonly onOptionSelected = new Event<number>();
  public readonly onConfirmed = new Event<void>();
  public readonly onClosed = new Event<void>();

  onAwake(): void {
    const root = this.getSceneObject();
    root.enabled = false;

    const plateObj = global.scene.createSceneObject("DialoguePlate");
    plateObj.setParent(root);
    this.backPlate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    this.backPlate.style = "dark";

    this.titleText = createText({
      parent: root,
      name: "DialogueTitle",
      size: TextSize.XL,
      font: TextFont.SemiBold,
      color: new vec4(1, 1, 1, 1),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
    });

    const closeBtnObj = global.scene.createSceneObject("DialogueClose");
    closeBtnObj.setParent(root);
    this.closeBtn = closeBtnObj.createComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;
    this.closeBtn.width = CLOSE_BTN_SIZE;
    this.closeBtn.initialize();

    const closeIconSize = CLOSE_BTN_SIZE * 0.4;
    createImage(CLOSE_TEXTURE, {
      parent: closeBtnObj,
      name: "CloseIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: closeIconSize,
    });

    this.closeTooltip = createTooltip(closeBtnObj, "Close", {
      hoverSource: this.closeBtn,
    });

    this.closeBtn.onTriggerUp.add(() => {
      this.close();
    });

    this.contentContainer = global.scene.createSceneObject("DialogueContent");
    this.contentContainer.setParent(root);

    this.audioComponent = createAudioComponent(root);
  }

  showSelection(title: string, options: string[], selectedIndex: number): void {
    this.clearContent();

    const contentHeight =
      options.length * OPTION_BTN_HEIGHT + (options.length - 1) * OPTION_GAP;
    this.layoutPlate(title, contentHeight);

    const optBtnWidth = DIALOGUE_WIDTH - PADDING.x * 2;
    const topY = contentHeight / 2 - OPTION_BTN_HEIGHT / 2;

    for (let i = 0; i < options.length; i++) {
      const relY = topY - i * (OPTION_BTN_HEIGHT + OPTION_GAP);

      const result = createIconButton({
        parent: this.contentContainer,
        name: `Option_${i}`,
        width: optBtnWidth,
        height: OPTION_BTN_HEIGHT,
        label: options[i],
        toggleable: true,
        toggled: i === selectedIndex,
        position: new vec3(0, relY, 0),
        fontSize: TextSize.M,
      });

      const index = i;
      result.button.onTriggerUp.add(() => {
        this.onOptionSelected.invoke(index);
        this.close();
      });

      this.contentObjects.push(result.sceneObject);
    }

    this.animateIn();
  }

  showGridSelection(
    title: string,
    options: string[],
    selectedIndex: number,
    columns: number = 2,
  ): void {
    this.clearContent();

    const rows = Math.ceil(options.length / columns);
    const contentHeight = rows * OPTION_BTN_HEIGHT + (rows - 1) * OPTION_GAP;
    this.layoutPlate(title, contentHeight);

    const innerWidth = DIALOGUE_WIDTH - PADDING.x * 2;
    const colGap = OPTION_GAP;
    const colWidth = (innerWidth - (columns - 1) * colGap) / columns;
    const topY = contentHeight / 2 - OPTION_BTN_HEIGHT / 2;

    for (let i = 0; i < options.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = -innerWidth / 2 + colWidth / 2 + col * (colWidth + colGap);
      const y = topY - row * (OPTION_BTN_HEIGHT + OPTION_GAP);

      const result = createIconButton({
        parent: this.contentContainer,
        name: `Option_${i}`,
        width: colWidth,
        height: OPTION_BTN_HEIGHT,
        label: options[i],
        toggleable: true,
        toggled: i === selectedIndex,
        position: new vec3(x, y, 0),
        fontSize: TextSize.M,
      });

      const index = i;
      result.button.onTriggerUp.add(() => {
        this.onOptionSelected.invoke(index);
        this.close();
      });

      this.contentObjects.push(result.sceneObject);
    }

    this.animateIn();
  }

  showConfirmation(title: string, message: string): void {
    this.clearContent();

    const messageHeight = 4;
    const btnRowHeight = OPTION_BTN_HEIGHT;
    const contentHeight = messageHeight + OPTION_GAP + btnRowHeight;

    this.layoutPlate(title, contentHeight);

    const innerWidth = DIALOGUE_WIDTH - PADDING.x * 2;

    const msgY = contentHeight / 2 - messageHeight / 2;
    const msgText = createText({
      parent: this.contentContainer,
      name: "ConfirmMsg",
      text: message,
      size: TextSize.L,
      color: new vec4(1, 1, 1, 0.8),
      position: new vec3(0, msgY, 0),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -messageHeight / 2,
        messageHeight / 2,
      ),
    });
    this.contentObjects.push(msgText.getSceneObject());

    const btnY = -contentHeight / 2 + btnRowHeight / 2;
    const totalBtnWidth = CONFIRM_BTN_WIDTH * 2 + CONFIRM_BTN_GAP;

    const cancel = createIconButton({
      parent: this.contentContainer,
      name: "CancelBtn",
      width: CONFIRM_BTN_WIDTH,
      height: OPTION_BTN_HEIGHT,
      label: "Cancel",
      position: new vec3(-totalBtnWidth / 2 + CONFIRM_BTN_WIDTH / 2, btnY, 0),
      fontSize: TextSize.M,
    });
    cancel.button.onTriggerUp.add(() => this.close());
    this.contentObjects.push(cancel.sceneObject);

    const confirm = createIconButton({
      parent: this.contentContainer,
      name: "ConfirmBtn",
      width: CONFIRM_BTN_WIDTH,
      height: OPTION_BTN_HEIGHT,
      label: "Confirm",
      position: new vec3(totalBtnWidth / 2 - CONFIRM_BTN_WIDTH / 2, btnY, 0),
      fontSize: TextSize.M,
    });
    confirm.button.onTriggerUp.add(() => {
      this.onConfirmed.invoke();
      this.close();
    });
    this.contentObjects.push(confirm.sceneObject);

    this.animateIn();
  }

  close(): void {
    this.animCancels.cancel();
    const root = this.getSceneObject();
    if (!root.enabled) return;

    scaleOut(root, {
      duration: ANIM_DURATION * 0.5,
      cancelSet: this.animCancels,
      ended: () => this.onClosed.invoke(),
    });
  }

  forceClose(): void {
    this.animCancels.cancel();
    this.getSceneObject().enabled = false;
  }

  isShowing(): boolean {
    return this.getSceneObject().enabled;
  }

  getHeight(): number {
    return this.backPlate.size.y;
  }

  private animateIn(): void {
    this.animCancels.cancel();
    this.audioComponent.audioTrack = CONFIRM_DIALOG_SFX;
    this.audioComponent.play(1);
    scaleIn(this.getSceneObject(), this.fullScale, {
      duration: ANIM_DURATION,
      easing: "ease-out-back",
      cancelSet: this.animCancels,
    });
  }

  private clearContent(): void {
    for (const obj of this.contentObjects) {
      obj.destroy();
    }
    this.contentObjects = [];
  }

  private layoutPlate(title: string, contentHeight: number): void {
    const totalHeight = TITLE_HEIGHT + contentHeight + PADDING.y * 2;

    this.backPlate.size = new vec2(DIALOGUE_WIDTH, totalHeight);
    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(vec3.zero());

    const titleY = totalHeight / 2 - TITLE_HEIGHT / 2;
    this.titleText.text = title;
    const innerWidth = DIALOGUE_WIDTH - PADDING.x * 2;
    this.titleText.worldSpaceRect = Rect.create(
      -innerWidth / 2,
      innerWidth / 2,
      -TITLE_HEIGHT / 2,
      TITLE_HEIGHT / 2,
    );
    this.titleText
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, titleY, Z_CONTENT));

    const closeBtnX = -DIALOGUE_WIDTH / 2 + CLOSE_BTN_SIZE / 2 + 0.5;
    const closeBtnY = totalHeight / 2 - CLOSE_BTN_SIZE / 2 - 0.5;
    this.closeBtn
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(closeBtnX, closeBtnY, Z_CONTENT));

    const contentY = titleY - TITLE_HEIGHT / 2 - contentHeight / 2;
    this.contentContainer
      .getTransform()
      .setLocalPosition(new vec3(0, contentY, Z_CONTENT));
  }
}
