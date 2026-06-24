import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { createTooltip } from "../Shared/UIBuilders";
import { ActivityIndicatorController } from "../../../Visuals/Scripts/ActivityIndicatorController";
import { CaptureController } from "../../CaptureGesture/Scripts/Controllers/CaptureController";
import { createImage } from "../Shared/ImageFactory";
import { ICON_Z_OFFSET, MICROPHONE_TEXTURE, SEND_TEXTURE } from "../Shared/UIConstants";
import { ImagePreviewBar } from "./ImagePreviewBar";
import { WrappingTextInput } from "./WrappingTextInput";
import { BLEKeyboardManager } from "../../Bluetooth/BLEKeyboardManager";

const TOOLTIP_Y_OFFSET = -3;
const TOOLTIP_Z_OFFSET = 0.25;

const BUTTON_GAP = 1;
const BACKPLATE_PADDING = new vec2(2, 1.5);
const MIC_INSET_RATIO = 0.15;
const Z_BACKPLATE = -0.6;

const Z_MIC_ABOVE_FIELD = 0.3;
const DOT_CYCLE_INTERVAL = 0.4;
const MAX_DOTS = 3;
const PREVIEW_TILT_DEG = -15;
const PREVIEW_GAP = 0.5;
const PREVIEW_WIDTH_RATIO = 0.75;
const PREVIEW_ABOVE_OFFSET = 6;

const CAMERA_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Camera.png",
) as Texture;
const STOP_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Stop.png",
) as Texture;

const CAPTURE_CONTROLLER_PREFAB: ObjectPrefab = requireAsset(
  "../../../Prefabs/CaptureController.prefab",
) as ObjectPrefab;

const MIC_ACTIVITY_INDICATOR_PREFAB: ObjectPrefab = requireAsset(
  "../../../Prefabs/MicActivityIndicator.prefab",
) as ObjectPrefab;

@component
export class InputBarController extends BaseScriptComponent {
  @input
  private textInputField: WrappingTextInput;

  @input
  private micButton: SceneObject;

  @input
  private cameraButton: SceneObject;

  @input
  private sendButton: SceneObject;

  private micRoundButton: RoundButton;
  private cameraRoundButton: RoundButton;
  private micTooltip: Tooltip;
  private cameraTooltip: Tooltip;
  private sendTooltip: Tooltip;
  private backPlate: BackPlate;
  private listeningAnimActive = false;
  private dotCount = 0;
  private dotElapsed = 0;
  private sendRoundButton: RoundButton;
  private sendIconImage: Image;
  private isStopMode = false;
  private captureControllerObj: SceneObject | null = null;
  private captureController: CaptureController | null = null;
  private micActivityIndicator: ActivityIndicatorController;
  private imagePreviewBar: ImagePreviewBar;
  private lastFieldHeight = 0;
  private lastPreviewHeight = 0;
  private lastEditMode = false;
  private cachedLeftBound = 0;
  private cachedRightBound = 0;
  private previewContainer: SceneObject;
  private tickEvent: SceneEvent;

  public readonly onMicTapped = new Event<void>();
  public readonly onCameraTapped = new Event<void>();
  public readonly onSendTapped = new Event<void>();
  public readonly onStopTapped = new Event<void>();
  public readonly onEditModeChanged = new Event<boolean>();
  public readonly onCaptureGestureStarted = new Event<void>();
  public readonly onPreviewImageTapped = new Event<number>();
  public readonly onPreviewImageDeleted = new Event<void>();
  public readonly onHeightChanged = new Event<number>();

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(this.initializeComponents.bind(this));
  }

  private initializeComponents(): void {
    this.micRoundButton = this.micButton.getComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;
    this.cameraRoundButton = this.cameraButton.getComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;
    this.sendRoundButton = this.sendButton.getComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;

    this.micRoundButton.setIsToggleable(true);
    this.micRoundButton.initialize();
    this.cameraRoundButton.setIsToggleable(true);
    this.cameraRoundButton.initialize();
    this.sendRoundButton.initialize();

    this.addButtonIcon(this.micButton, MICROPHONE_TEXTURE);
    this.addButtonIcon(this.cameraButton, CAMERA_TEXTURE);
    this.sendIconImage = this.addButtonIcon(
      this.sendButton,
      SEND_TEXTURE,
      false,
    );

    const tooltipOffset = new vec3(0, TOOLTIP_Y_OFFSET, TOOLTIP_Z_OFFSET);
    this.micTooltip = createTooltip(this.micButton, "Dictate", {
      offset: tooltipOffset,
    });
    this.cameraTooltip = createTooltip(this.cameraButton, "Camera", {
      offset: tooltipOffset,
    });
    this.sendTooltip = createTooltip(this.sendButton, "Send", {
      offset: tooltipOffset,
    });

    this.micRoundButton.onHoverEnter.add(() => this.micTooltip.setOn(true));
    this.micRoundButton.onHoverExit.add(() => this.micTooltip.setOn(false));
    this.cameraRoundButton.onHoverEnter.add(() =>
      this.cameraTooltip.setOn(true),
    );
    this.cameraRoundButton.onHoverExit.add(() =>
      this.cameraTooltip.setOn(false),
    );
    this.sendRoundButton.onHoverEnter.add(() => this.sendTooltip.setOn(true));
    this.sendRoundButton.onHoverExit.add(() => this.sendTooltip.setOn(false));

    this.textInputField.initialize();
    this.layoutButtons();
    this.initMicActivityIndicator();

    this.micRoundButton.onTriggerUp.add(() => this.onMicTapped.invoke());
    this.cameraRoundButton.onTriggerUp.add(() => this.onCameraTapped.invoke());
    this.sendRoundButton.onTriggerUp.add(() => {
      if (this.isStopMode) {
        this.onStopTapped.invoke();
      } else {
        this.onSendTapped.invoke();
      }
    });

    this.createBackPlate();
    this.createImagePreviewBar();
    this.lastFieldHeight = this.textInputField.getSize().y;
    this.tickEvent = this.createEvent("UpdateEvent");
    this.tickEvent.bind(() => {
      this.tickListeningAnim();
      this.tickSizeChange();
    });
    this.tickEvent.enabled = false;

    this.textInputField.onSizeChanged.add(() => this.enableTick());
    this.textInputField.onEditMode.add(() => this.enableTick());
    this.textInputField.onSubmitRequested.add(() => this.onSendTapped.invoke());
    this.textInputField.onTextChanged.add((text: string) => {
      this.setSendEnabled(text.trim().length > 0);
    });
  }

  setBleFocus(focused: boolean): void {
    this.textInputField.setBleFocus(focused);
  }

  connectBLEKeyboard(manager: BLEKeyboardManager): void {
    this.textInputField.connectBLEKeyboard(manager);
  }

  private enableTick(): void {
    if (this.tickEvent) {
      this.tickEvent.enabled = true;
    }
  }

  private createBackPlate(): void {
    const plateObj = global.scene.createSceneObject("InputBarBackPlate");
    plateObj.setParent(this.getSceneObject());
    plateObj.getTransform().setLocalPosition(new vec3(0, 0, Z_BACKPLATE));
    this.backPlate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    this.backPlate.style = "dark";
    this.updateBackPlate();
  }

  private updateBackPlate(): void {
    const fieldSize = this.textInputField.getSize();
    const totalWidth =
      this.cachedRightBound - this.cachedLeftBound + BACKPLATE_PADDING.x * 2;
    const totalHeight = fieldSize.y + BACKPLATE_PADDING.y * 2;

    this.backPlate.size = new vec2(totalWidth, totalHeight);

    const centerX = (this.cachedLeftBound + this.cachedRightBound) / 2;
    const yOffset = (fieldSize.y - this.textInputField.fieldHeight) / 2;
    const fieldOffsetY = this.textInputField
      .getSceneObject()
      .getTransform()
      .getLocalPosition().y;
    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(centerX, fieldOffsetY + yOffset, Z_BACKPLATE));

    this.updatePreviewBarPosition();
  }

  private createImagePreviewBar(): void {
    this.previewContainer = global.scene.createSceneObject(
      "ImagePreviewContainer",
    );
    this.previewContainer.setParent(this.getSceneObject());
    this.previewContainer
      .getTransform()
      .setLocalRotation(
        quat.fromEulerAngles(MathUtils.DegToRad * PREVIEW_TILT_DEG, 0, 0),
      );

    this.imagePreviewBar = this.previewContainer.createComponent(
      ImagePreviewBar.getTypeName(),
    ) as ImagePreviewBar;

    this.imagePreviewBar.onImageTapped.add((index: number) => {
      this.onPreviewImageTapped.invoke(index);
    });

    this.updatePreviewBarPosition();
  }

  private updatePreviewBarPosition(): void {
    if (!this.previewContainer || !this.backPlate) return;
    const platePos = this.backPlate
      .getSceneObject()
      .getTransform()
      .getLocalPosition();
    const bottomY = platePos.y - this.backPlate.size.y / 2;
    this.previewContainer
      .getTransform()
      .setLocalPosition(
        new vec3(platePos.x, bottomY - PREVIEW_GAP, platePos.z),
      );
    this.imagePreviewBar.setMaxWidth(
      this.backPlate.size.x * PREVIEW_WIDTH_RATIO,
    );
  }

  private addButtonIcon(
    button: SceneObject,
    texture: Texture,
    shared?: boolean,
  ): Image {
    const buttonWidth = (
      button.getComponent(RoundButton.getTypeName()) as RoundButton
    ).width;
    return createImage(texture, {
      parent: button,
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: buttonWidth / 2,
      shared,
    });
  }

  setStopMode(active: boolean): void {
    if (this.isStopMode === active) return;
    this.isStopMode = active;
    this.sendIconImage.mainMaterial.mainPass.baseTex = active
      ? STOP_TEXTURE
      : SEND_TEXTURE;
    this.sendTooltip.tip = active ? "Stop" : "Send";
    if (active && this.sendRoundButton) {
      this.sendRoundButton.inactive = false;
    }
  }

  setSendEnabled(enabled: boolean): void {
    if (!this.sendRoundButton) return;
    this.sendRoundButton.inactive = !enabled && !this.isStopMode;
  }

  private layoutButtons(): void {
    const fieldHalfWidth = this.textInputField.getSize().x / 2;
    const buttonSize = this.micRoundButton.width;
    const buttonRadius = buttonSize / 2;
    const micInset = buttonSize * MIC_INSET_RATIO;

    this.micButton.setParent(this.textInputField.getSceneObject());
    this.micButton
      .getTransform()
      .setLocalPosition(
        new vec3(
          -fieldHalfWidth + buttonRadius + micInset,
          0,
          Z_MIC_ABOVE_FIELD,
        ),
      );
    this.textInputField.textOffset = new vec2(buttonSize + micInset * 2, 0);

    this.cameraButton
      .getTransform()
      .setLocalPosition(
        new vec3(-fieldHalfWidth - BUTTON_GAP - buttonRadius, 0, 0),
      );

    this.sendButton
      .getTransform()
      .setLocalPosition(
        new vec3(fieldHalfWidth + BUTTON_GAP + buttonRadius, 0, 0),
      );

    this.cachedLeftBound = -fieldHalfWidth - BUTTON_GAP - 2 * buttonRadius;
    this.cachedRightBound = fieldHalfWidth + BUTTON_GAP + 2 * buttonRadius;
  }

  setText(text: string): void {
    this.textInputField.text = text;
  }

  showPlaceholderText(text: string): void {
    this.textInputField.showPlaceholderText(text);
  }

  setTextColor(color: vec4): void {
    this.textInputField.textComponent.textFill.color = color;
  }

  getText(): string {
    return this.textInputField.text;
  }

  setMicActive(active: boolean): void {
    this.micRoundButton.toggle(active);
    this.micActivityIndicator.setVisible(active);
  }

  setCameraActive(active: boolean): void {
    this.cameraRoundButton.toggle(active);
    if (active) {
      this.enableCaptureController();
    } else {
      this.disableCaptureController();
    }
  }

  private initMicActivityIndicator(): void {
    const indicatorObj = MIC_ACTIVITY_INDICATOR_PREFAB.instantiate(
      this.micButton,
    );
    indicatorObj.getTransform().setLocalPosition(new vec3(0, 0, -0.05));
    indicatorObj.getTransform().setLocalScale(vec3.one().uniformScale(3));
    this.micActivityIndicator = indicatorObj.getComponent(
      ActivityIndicatorController.getTypeName(),
    ) as ActivityIndicatorController;
  }

  private enableCaptureController(): void {
    if (!this.captureControllerObj) {
      this.captureControllerObj = CAPTURE_CONTROLLER_PREFAB.instantiate(
        global.scene.createSceneObject("CaptureControllerParent"),
      );
      this.captureController = this.captureControllerObj.getComponent(
        CaptureController.getTypeName(),
      ) as CaptureController;
      this.captureController.onGestureStarted.add(() => {
        this.onCaptureGestureStarted.invoke();
      });
      this.captureController.onPreviewDeleted.add(() => {
        this.onPreviewImageDeleted.invoke();
      });
      this.captureController.onImageAttached.add((texture: Texture) => {
        const picTrans = this.captureController!.picAnchorObj.getTransform();
        this.imagePreviewBar.addImageAnimated(
          texture,
          picTrans.getWorldPosition(),
          picTrans.getWorldScale(),
          picTrans.getWorldRotation(),
        );
      });
    }
    this.captureControllerObj.enabled = true;
  }

  private disableCaptureController(): void {
    if (this.captureControllerObj) {
      this.captureControllerObj.enabled = false;
    }
  }

  getCaptureController(): CaptureController | null {
    return this.captureController;
  }

  getPendingImages(): Texture[] {
    return this.imagePreviewBar.getImages();
  }

  hasPendingImages(): boolean {
    return this.imagePreviewBar.getImageCount() > 0;
  }

  removePendingImage(index: number): void {
    this.imagePreviewBar.removeImage(index);
  }

  clearPendingImages(): void {
    this.imagePreviewBar.clear();
  }

  getPreviewWorldPosition(index: number): vec3 | null {
    const thumbTransform =
      this.imagePreviewBar.getThumbnailWorldTransform(index);
    if (!thumbTransform) return null;
    return thumbTransform.position.add(
      vec3.up().uniformScale(PREVIEW_ABOVE_OFFSET),
    );
  }

  getTotalHeight(): number {
    if (!this.backPlate) return 0;
    return this.backPlate.size.y + this.getPreviewExtraHeight();
  }

  getPreviewExtraHeight(): number {
    if (!this.imagePreviewBar || this.imagePreviewBar.getImageCount() === 0) {
      return 0;
    }
    return PREVIEW_GAP + this.imagePreviewBar.getVisualHeight();
  }

  getBaselineHeight(): number {
    return this.textInputField.fieldHeight + BACKPLATE_PADDING.y * 2;
  }

  get isTextInputActive(): boolean {
    return this.textInputField.isActive;
  }

  setEnabled(enabled: boolean): void {
    this.getSceneObject().enabled = enabled;
  }

  setTextInputEnabled(enabled: boolean): void {
    this.textInputField.setInteractionEnabled(enabled);
  }

  startListeningAnimation(): void {
    if (this.listeningAnimActive) return;
    this.listeningAnimActive = true;
    this.dotCount = 0;
    this.dotElapsed = 0;
    this.textInputField.text = "Listening.";
    this.enableTick();
  }

  stopListeningAnimation(): void {
    this.listeningAnimActive = false;
  }

  private tickListeningAnim(): void {
    if (!this.listeningAnimActive) return;
    this.dotElapsed += getDeltaTime();
    if (this.dotElapsed >= DOT_CYCLE_INTERVAL) {
      this.dotElapsed -= DOT_CYCLE_INTERVAL;
      this.dotCount = (this.dotCount + 1) % MAX_DOTS;
      this.textInputField.text = "Listening" + ".".repeat(this.dotCount + 1);
    }
  }

  private tickSizeChange(): void {
    const h = this.textInputField.getSize().y;
    const previewH = this.imagePreviewBar.getVisualHeight();
    const fieldChanged = Math.abs(h - this.lastFieldHeight) > 0.01;
    const previewChanged = Math.abs(previewH - this.lastPreviewHeight) > 0.01;

    if (fieldChanged) {
      this.lastFieldHeight = h;
      this.updateBackPlate();
    }

    if (fieldChanged || previewChanged) {
      this.lastPreviewHeight = previewH;
      this.onHeightChanged.invoke(this.getTotalHeight());
    }

    const editing = this.textInputField.isEditing;
    if (editing !== this.lastEditMode) {
      this.lastEditMode = editing;
      this.onEditModeChanged.invoke(editing);
    }

    if (!this.listeningAnimActive && !fieldChanged && !previewChanged) {
      this.tickEvent.enabled = false;
    }
  }
}
