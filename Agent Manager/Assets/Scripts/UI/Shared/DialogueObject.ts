import { BackPlate } from "UIKit.lspkg/Scripts/BackPlate";
import { CancelSet } from "./MotionAnimate";
import Event from "InteractionKit.lspkg/Utils/Event";
import { TITLE_HEIGHT, PANEL_PADDING as PADDING, Z_CONTENT } from "./UIConstants";
import { scaleIn, scaleOut } from "./UIAnimations";
import {
  createIconButton,
  createAudioComponent,
  createText,
} from "./UIBuilders";
import { TextStyle, TextColor } from "./UIStyle";

const CONFIRM_DIALOG_SFX: AudioTrackAsset = requireAsset(
  "../../../Audio/confirmDialog.wav",
) as AudioTrackAsset;

const DIALOGUE_WIDTH = 28;
const OPTION_BTN_HEIGHT = 4;
const OPTION_GAP = 1.2;
const CONFIRM_BTN_WIDTH = 10;
const CONFIRM_BTN_GAP = 2.5;
const ANIM_DURATION = 0.3;

@component
export class DialogueObject extends BaseScriptComponent {
  private backPlate: BackPlate;
  private titleText: Text;
  private contentContainer: SceneObject;
  private contentObjects: SceneObject[] = [];
  private animCancels = new CancelSet();
  // Set from the first button press until the next show; buttons stay live
  // during the close animation, so this stops a double pinch from firing
  // Confirm (or Cancel then Confirm) twice.
  private closing = false;
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
      style: TextStyle.DialogTitle,
      color: new vec4(1, 1, 1, 1),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
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
      });

      const index = i;
      result.button.onTriggerUp.add(() => {
        if (this.closing) return;
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
      });

      const index = i;
      result.button.onTriggerUp.add(() => {
        if (this.closing) return;
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
      style: TextStyle.Body,
      color: TextColor.Secondary,
      position: new vec3(0, msgY, 0),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Center,
      layoutRect: Rect.create(
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
      style: "Secondary",
    });
    cancel.button.onTriggerUp.add(() => {
      if (this.closing) return;
      this.close();
    });
    this.contentObjects.push(cancel.sceneObject);

    const confirm = createIconButton({
      parent: this.contentContainer,
      name: "ConfirmBtn",
      width: CONFIRM_BTN_WIDTH,
      height: OPTION_BTN_HEIGHT,
      label: "Confirm",
      position: new vec3(totalBtnWidth / 2 - CONFIRM_BTN_WIDTH / 2, btnY, 0),
      style: "Primary",
    });
    confirm.button.onTriggerUp.add(() => {
      if (this.closing) return;
      this.onConfirmed.invoke();
      this.close();
    });
    this.contentObjects.push(confirm.sceneObject);

    this.animateIn();
  }

  close(): void {
    const root = this.getSceneObject();
    if (!root.enabled || this.closing) return;
    this.closing = true;
    this.animCancels.cancel();

    scaleOut(root, {
      duration: ANIM_DURATION * 0.5,
      cancelSet: this.animCancels,
      ended: () => this.onClosed.invoke(),
    });
  }

  forceClose(): void {
    this.closing = false;
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
    this.closing = false;
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
    this.titleText.layoutRect = Rect.create(
      -innerWidth / 2,
      innerWidth / 2,
      -TITLE_HEIGHT / 2,
      TITLE_HEIGHT / 2,
    );
    this.titleText
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, titleY, Z_CONTENT));

    const contentY = titleY - TITLE_HEIGHT / 2 - contentHeight / 2;
    this.contentContainer
      .getTransform()
      .setLocalPosition(new vec3(0, contentY, Z_CONTENT));
  }
}
