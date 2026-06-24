import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { createText, createTooltip } from "../Shared/UIBuilders";
import { createImage } from "../Shared/ImageFactory";
import { ICON_Z_OFFSET } from "../Shared/UIConstants";

const VERTICAL_PADDING = 1;
const HORIZONTAL_PADDING = 2;
const FOOTER_GAP = 0.3;
const Z_STEP = 0.3;
const IMAGE_GAP = 0.5;
const IMAGE_SPACING = 0.4;
const IMAGE_MAX_HEIGHT = 14;

const USER_NAME_COLOR = new vec4(0.5, 0.8, 1, 1);
const AGENT_NAME_COLOR = new vec4(0.6, 1, 0.7, 1);
const SYSTEM_NAME_COLOR = new vec4(0.9, 0.8, 0.45, 0.75);
const USER_BG_COLOR = new vec4(0.2, 0.25, 0.35, 0.9);
const AGENT_BG_COLOR = new vec4(0.15, 0.2, 0.15, 0.9);
const SYSTEM_BG_COLOR = new vec4(0.22, 0.18, 0.08, 0.8);
const TEXT_COLOR = new vec4(1, 1, 1, 1);
const SYSTEM_TEXT_COLOR = new vec4(0.95, 0.9, 0.75, 1);
const FOOTER_TEXT_COLOR = new vec4(0.6, 0.6, 0.6, 1);

@component
export class ChatMessageBubble extends BaseScriptComponent {
  public readonly onImageTapped = new Event<{
    texture: Texture;
    sourceObj: SceneObject;
    srcWidth: number;
    srcHeight: number;
  }>();

  private backPlate: RoundedRectangle;
  private messageText: Text;
  private footerText: Text;
  private imageContainer: SceneObject;
  private imageObjects: SceneObject[] = [];
  private imageTextures: Texture[] = [];
  private bubbleWidth = 20;
  private totalHeight = 4;
  private imageRowHeight = 0;
  private sender: "user" | "agent" | "system" = "user";
  private baseBgAlpha = 0.9;
  private baseTextAlpha = 1;
  private baseFooterAlpha = 1;

  // Scratch vec4s reused in setOpacity() to avoid per-frame heap allocations.
  private readonly _scratchBgColor     = new vec4(0, 0, 0, 0);
  private readonly _scratchTextColor   = new vec4(0, 0, 0, 0);
  private readonly _scratchFooterColor = new vec4(0, 0, 0, 0);

  // Cache for setMessage() — skip updateLayout() when content is unchanged (pool round-trips).
  private _cachedContent    = "";
  private _cachedSenderName = "";
  private _cachedSender: "user" | "agent" | "system" | null = null;
  private _cachedImages: Texture[] | undefined = undefined;

  onAwake(): void {
    const root = this.getSceneObject();

    const plateObj = global.scene.createSceneObject("BubblePlate");
    plateObj.setParent(root);
    plateObj.getTransform().setLocalPosition(vec3.zero());
    this.backPlate = plateObj.createComponent(
      RoundedRectangle.getTypeName(),
    ) as RoundedRectangle;
    this.backPlate.size = new vec2(this.bubbleWidth, 4);
    this.backPlate.cornerRadius = 1;
    this.backPlate.backgroundColor = USER_BG_COLOR;
    this.backPlate.initialize();
    this.backPlate.renderMeshVisual.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto;
    this.backPlate.renderMeshVisual.mainPass.colorMask = new vec4b(true, true, true, true);

    this.imageContainer = global.scene.createSceneObject("BubbleImages");
    this.imageContainer.setParent(root);
    this.imageContainer.getTransform().setLocalPosition(vec3.zero());

    const textWidth = this.bubbleWidth - HORIZONTAL_PADDING * 2;

    this.messageText = createText({
      parent: root,
      name: "BubbleMessage",
      size: TextSize.M,
      color: TEXT_COLOR,
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(-textWidth / 2, textWidth / 2, -50, 50),
    });

    this.footerText = createText({
      parent: root,
      name: "BubbleFooter",
      size: TextSize.XS,
      font: TextFont.Light,
      color: FOOTER_TEXT_COLOR,
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(
        -this.bubbleWidth / 2,
        this.bubbleWidth / 2,
        -50,
        50,
      ),
    });
  }

  configure(width: number): void {
    this.bubbleWidth = width;
    const textWidth = width - HORIZONTAL_PADDING * 2;
    this.messageText.worldSpaceRect = Rect.create(
      -textWidth / 2,
      textWidth / 2,
      -50,
      50,
    );
    this.footerText.worldSpaceRect = Rect.create(
      -width / 2,
      width / 2,
      -50,
      50,
    );
  }

  setMessage(
    content: string,
    senderName: string,
    sender: "user" | "agent" | "system",
    images?: Texture[],
  ): void {
    this.sender = sender;
    const isAgent = sender === "agent";
    const isSystem = sender === "system";

    this.messageText.getSceneObject().enabled = true;
    this.footerText.getSceneObject().enabled = true;
    this.imageContainer.enabled = true;

    this.messageText.text = content;
    this.messageText.textFill.color = isSystem ? SYSTEM_TEXT_COLOR : TEXT_COLOR;
    this.backPlate.backgroundColor = isAgent
      ? AGENT_BG_COLOR
      : isSystem
        ? SYSTEM_BG_COLOR
        : USER_BG_COLOR;

    this.footerText.text = senderName;
    this.footerText.textFill.color = isAgent
      ? AGENT_NAME_COLOR
      : isSystem
        ? SYSTEM_NAME_COLOR
        : USER_NAME_COLOR;
    this.footerText.horizontalAlignment = isSystem
      ? HorizontalAlignment.Center
      : isAgent
        ? HorizontalAlignment.Left
        : HorizontalAlignment.Right;

    this.baseBgAlpha = this.backPlate.backgroundColor.w;
    this.baseTextAlpha = this.messageText.textFill.color.w;
    this.baseFooterAlpha = this.footerText.textFill.color.w;

    const imagesMatch =
      images === this._cachedImages ||
      (images !== undefined &&
        this._cachedImages !== undefined &&
        images.length === this._cachedImages.length &&
        images.every((t, i) => t === this._cachedImages![i]));

    const layoutChanged =
      content    !== this._cachedContent    ||
      senderName !== this._cachedSenderName ||
      sender     !== this._cachedSender     ||
      !imagesMatch;

    if (layoutChanged) {
      this._cachedContent    = content;
      this._cachedSenderName = senderName;
      this._cachedSender     = sender;
      this._cachedImages     = images;
      this.buildImages(images);
      this.updateLayout();
    }
  }

  getHeight(): number {
    return this.totalHeight;
  }

  getIsAgent(): boolean {
    return this.sender === "agent";
  }

  getIsSystem(): boolean {
    return this.sender === "system";
  }

  setOpacity(alpha: number): void {
    const bg = this.backPlate.backgroundColor;
    this._scratchBgColor.x = bg.x;
    this._scratchBgColor.y = bg.y;
    this._scratchBgColor.z = bg.z;
    this._scratchBgColor.w = this.baseBgAlpha * alpha;
    this.backPlate.backgroundColor = this._scratchBgColor;

    const msgColor = this.sender === "system" ? SYSTEM_TEXT_COLOR : TEXT_COLOR;
    this._scratchTextColor.x = msgColor.x;
    this._scratchTextColor.y = msgColor.y;
    this._scratchTextColor.z = msgColor.z;
    this._scratchTextColor.w = this.baseTextAlpha * alpha;
    this.messageText.textFill.color = this._scratchTextColor;
    this.messageText.getSceneObject().enabled = alpha > 0;

    const footerColor = this.sender === "agent"
      ? AGENT_NAME_COLOR
      : this.sender === "system"
        ? SYSTEM_NAME_COLOR
        : USER_NAME_COLOR;
    this._scratchFooterColor.x = footerColor.x;
    this._scratchFooterColor.y = footerColor.y;
    this._scratchFooterColor.z = footerColor.z;
    this._scratchFooterColor.w = this.baseFooterAlpha * alpha;
    this.footerText.textFill.color = this._scratchFooterColor;
    this.footerText.getSceneObject().enabled = alpha > 0;

    this.imageContainer.enabled = alpha > 0;
  }

  private buildImages(images?: Texture[]): void {
    const needed = images?.length ?? 0;

    for (let i = needed; i < this.imageObjects.length; i++) {
      this.imageObjects[i].enabled = false;
    }

    this.imageRowHeight = 0;
    this.imageTextures = images ? [...images] : [];
    if (needed === 0) return;

    const contentWidth = needed === 1
      ? this.bubbleWidth
      : this.bubbleWidth - HORIZONTAL_PADDING * 2;
    const totalSpacing = (needed - 1) * IMAGE_SPACING;
    const cellWidth = (contentWidth - totalSpacing) / needed;

    let rowHeight = 0;
    for (let i = 0; i < needed; i++) {
      const tw = images![i].getWidth();
      const th = images![i].getHeight();
      const aspect = th / Math.max(tw, 1);
      rowHeight = Math.max(
        rowHeight,
        Math.min(cellWidth * aspect, IMAGE_MAX_HEIGHT),
      );
    }
    this.imageRowHeight = rowHeight;

    const startX = needed === 1
      ? 0
      : -(contentWidth / 2) + cellWidth / 2;

    for (let i = 0; i < needed; i++) {
      const tw = images![i].getWidth();
      const th = images![i].getHeight();
      const aspect = th / Math.max(tw, 1);
      const imgHeight = Math.min(cellWidth * aspect, IMAGE_MAX_HEIGHT);

      let btnObj: SceneObject;
      if (i < this.imageObjects.length) {
        btnObj = this.imageObjects[i];
        btnObj.enabled = true;

        const btn = btnObj.getComponent(
          RectangleButton.getTypeName(),
        ) as RectangleButton;
        btn.size = new vec3(cellWidth, imgHeight, 0.5);

        for (let c = 0; c < btnObj.getChildrenCount(); c++) {
          const child = btnObj.getChild(c);
          const img = child.getComponent("Image") as Image;
          if (img) {
            img.mainPass.baseTex = images![i];
            child.getTransform().setLocalScale(
              new vec3(cellWidth, imgHeight, 1),
            );
            break;
          }
        }
      } else {
        btnObj = this.createImageButton(images![i], cellWidth, imgHeight, i);
        this.imageObjects.push(btnObj);
      }

      const x = startX + i * (cellWidth + IMAGE_SPACING);
      btnObj.getTransform().setLocalPosition(new vec3(x, 0, Z_STEP));
    }
  }

  private createImageButton(
    texture: Texture,
    width: number,
    height: number,
    index: number,
  ): SceneObject {
    const btnObj = global.scene.createSceneObject(`ImgBtn_${index}`);
    btnObj.setParent(this.imageContainer);

    const btn = btnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    btn.size = new vec3(width, height, 0.5);
    btn.initialize();

    createImage(texture, {
      parent: btnObj,
      name: `BubbleImg_${index}`,
      scale: new vec3(width, height, 1),
      position: new vec3(0, 0, ICON_Z_OFFSET),
      shared: false,
    });

    createTooltip(btnObj, "Open Media", { hoverSource: btn });

    btn.onTriggerUp.add(() => {
      const tex = this.imageTextures[index];
      if (tex) {
        this.onImageTapped.invoke({ texture: tex, sourceObj: btnObj, srcWidth: width, srcHeight: height });
      }
    });

    return btnObj;
  }

  private updateLayout(): void {
    const msgBounds = this.messageText.getBoundingBox();
    const msgSize = msgBounds.getSize();
    const msgCenter = msgBounds.getCenter();

    const footerBounds = this.footerText.getBoundingBox();
    const footerSize = footerBounds.getSize();
    const footerCenter = footerBounds.getCenter();

    const hasImages = this.imageRowHeight > 0;
    const imageSection = hasImages ? this.imageRowHeight + IMAGE_GAP : 0;

    const bubbleHeight = msgSize.y + imageSection + VERTICAL_PADDING * 2;
    this.backPlate.size = new vec2(this.bubbleWidth, bubbleHeight);

    this.totalHeight = bubbleHeight + FOOTER_GAP + footerSize.y;

    let currentY = this.totalHeight / 2;

    currentY -= bubbleHeight / 2;
    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, currentY, 0));

    const bubbleTopInner = currentY + bubbleHeight / 2 - VERTICAL_PADDING;

    if (hasImages) {
      const imageCenterY = bubbleTopInner - this.imageRowHeight / 2;
      this.imageContainer
        .getTransform()
        .setLocalPosition(new vec3(0, imageCenterY, Z_STEP));
    }

    const textAnchorY = hasImages
      ? bubbleTopInner - this.imageRowHeight - IMAGE_GAP
      : bubbleTopInner;
    this.messageText
      .getTransform()
      .setLocalPosition(
        new vec3(0, textAnchorY - msgCenter.y - msgSize.y / 2, Z_STEP),
      );

    currentY -= bubbleHeight / 2;
    currentY -= FOOTER_GAP;
    currentY -= footerSize.y / 2;
    this.footerText
      .getTransform()
      .setLocalPosition(new vec3(0, currentY - footerCenter.y, Z_STEP * 2));
  }
}
