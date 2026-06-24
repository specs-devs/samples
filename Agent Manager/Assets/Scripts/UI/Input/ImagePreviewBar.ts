import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { createImage } from "../Shared/ImageFactory";
import { ICON_Z_OFFSET } from "../Shared/UIConstants";
import { DirtyComponent } from "../Shared/DirtyComponent";

const MAX_IMAGES = 5;
const THUMB_SIZE = 3;
const THUMB_SPACING = 0.5;
const PADDING = new vec2(1, 0.5);
const Z_CONTENT = 0.15;
const THUMB_DEPTH = 0.5;
const THUMB_IMAGE_INSET = 0.9;
const ATTACH_ANIM_DURATION = 0.4;

interface AnimationSource {
  worldPosition: vec3;
  worldScale: vec3;
  worldRotation: quat;
  texture: Texture;
}

interface TrackedThumbnail {
  sceneObject: SceneObject;
  button: RectangleButton;
  image: Image;
}

@component
export class ImagePreviewBar extends DirtyComponent {
  private content: SceneObject;
  private backPlate: BackPlate;
  private thumbContainer: SceneObject;
  private trackedThumbnails: TrackedThumbnail[] = [];
  private pendingImages: Texture[] = [];
  private maxWidth = 0;
  private pendingAnimationSource: AnimationSource | null = null;
  private attachAnimCancelSet = new CancelSet();
  private activeFloater: SceneObject | null = null;

  public readonly onImageTapped = new Event<number>();
  public readonly onImageRemoved = new Event<number>();

  onAwake(): void {
    super.onAwake();
    const root = this.getSceneObject();

    this.content = global.scene.createSceneObject("Content");
    this.content.setParent(root);
    this.content.getTransform().setLocalPosition(vec3.zero());
    this.content.enabled = false;

    const plateObj = global.scene.createSceneObject("PreviewBackPlate");
    plateObj.setParent(this.content);
    plateObj.getTransform().setLocalPosition(vec3.zero());
    this.backPlate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    this.backPlate.style = "dark";

    this.thumbContainer = global.scene.createSceneObject("PreviewThumbContainer");
    this.thumbContainer.setParent(this.content);
    this.thumbContainer.getTransform().setLocalPosition(vec3.zero());
  }

  addImage(texture: Texture): void {
    if (this.pendingImages.length >= MAX_IMAGES) return;
    this.pendingImages.push(texture);
    this.scheduleLayout();
  }

  addImageAnimated(
    texture: Texture,
    sourceWorldPos: vec3,
    sourceWorldScale: vec3,
    sourceWorldRotation: quat,
  ): void {
    if (this.pendingImages.length >= MAX_IMAGES) return;
    this.attachAnimCancelSet.cancel();
    if (this.activeFloater && !isNull(this.activeFloater)) {
      this.activeFloater.destroy();
    }

    const floater = global.scene.createSceneObject("AttachAnim");
    this.activeFloater = floater;

    createImage(texture, {
      parent: floater,
      name: "FloaterImage",
      scale: vec3.one(),
    });

    const floaterTrans = floater.getTransform();
    floaterTrans.setWorldPosition(sourceWorldPos);
    floaterTrans.setWorldRotation(sourceWorldRotation);
    floaterTrans.setWorldScale(sourceWorldScale);

    this.pendingAnimationSource = {
      worldPosition: sourceWorldPos,
      worldScale: sourceWorldScale,
      worldRotation: sourceWorldRotation,
      texture,
    };
    this.addImage(texture);
  }

  removeImage(index: number): void {
    if (index < 0 || index >= this.pendingImages.length) return;
    this.pendingImages.splice(index, 1);
    this.scheduleLayout();
    this.onImageRemoved.invoke(index);
  }

  getImages(): Texture[] {
    return [...this.pendingImages];
  }

  getImageCount(): number {
    return this.pendingImages.length;
  }

  clear(): void {
    this.pendingImages = [];
    this.scheduleLayout();
  }

  setMaxWidth(width: number): void {
    if (width === this.maxWidth) return;
    this.maxWidth = width;
    this.scheduleLayout();
  }

  getVisualHeight(): number {
    if (this.pendingImages.length === 0) return 0;
    return THUMB_SIZE + PADDING.y * 2;
  }

  getThumbnailWorldTransform(
    index: number,
  ): { position: vec3; rotation: quat } | null {
    if (index < 0 || index >= this.trackedThumbnails.length) return null;
    const thumbTrans = this.trackedThumbnails[index].sceneObject.getTransform();
    return {
      position: thumbTrans.getWorldPosition(),
      rotation: thumbTrans.getWorldRotation(),
    };
  }

  private scheduleLayout(): void {
    this.markDirty();
  }

  protected onFlush(_flags: number): void {
    this.rebuildThumbnails();
  }

  private rebuildThumbnails(): void {
    for (const tracked of this.trackedThumbnails) {
      tracked.sceneObject.destroy();
    }
    this.trackedThumbnails = [];

    const hasImages = this.pendingImages.length > 0;
    this.content.enabled = hasImages;
    if (!hasImages) return;

    const count = this.pendingImages.length;
    const totalContentWidth = count * THUMB_SIZE + (count - 1) * THUMB_SPACING;

    for (let i = 0; i < count; i++) {
      const texture = this.pendingImages[i];

      const btnObj = global.scene.createSceneObject(`PreviewThumb_${i}`);
      btnObj.setParent(this.thumbContainer);

      const btn = btnObj.createComponent(
        RectangleButton.getTypeName(),
      ) as RectangleButton;
      btn.size = new vec3(THUMB_SIZE, THUMB_SIZE, THUMB_DEPTH);
      btn.initialize();

      const image = createImage(texture, {
        parent: btnObj,
        name: "ThumbImage",
        position: new vec3(0, 0, ICON_Z_OFFSET),
        size: THUMB_SIZE * THUMB_IMAGE_INSET,
      });

      const startX = -(totalContentWidth / 2) + THUMB_SIZE / 2;
      const x = startX + i * (THUMB_SIZE + THUMB_SPACING);
      btnObj.getTransform().setLocalPosition(new vec3(x, 0, 0));

      const capturedIndex = i;
      btn.onTriggerUp.add(() => {
        this.onImageTapped.invoke(capturedIndex);
      });

      this.trackedThumbnails.push({
        sceneObject: btnObj,
        button: btn,
        image,
      });
    }

    const plateWidth = Math.min(
      totalContentWidth + PADDING.x * 2,
      this.maxWidth,
    );
    const plateHeight = THUMB_SIZE + PADDING.y * 2;

    this.backPlate.size = new vec2(plateWidth, plateHeight);

    const centerY = -plateHeight / 2;

    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, centerY, 0));

    this.thumbContainer
      .getTransform()
      .setLocalPosition(new vec3(0, centerY, Z_CONTENT));

    if (this.pendingAnimationSource && this.trackedThumbnails.length > 0) {
      const lastThumb =
        this.trackedThumbnails[this.trackedThumbnails.length - 1];
      this.animateAttachment(lastThumb, this.pendingAnimationSource);
      this.pendingAnimationSource = null;
    }
  }

  private animateAttachment(
    thumb: TrackedThumbnail,
    source: AnimationSource,
  ): void {
    if (!this.activeFloater || isNull(this.activeFloater)) return;

    const floater = this.activeFloater;
    const floaterTrans = floater.getTransform();

    const startPos = floaterTrans.getWorldPosition();
    const startScale = floaterTrans.getWorldScale();
    const startRot = floaterTrans.getWorldRotation();

    const targetPos = thumb.sceneObject.getTransform().getWorldPosition();
    const targetScale = thumb.image
      .getSceneObject()
      .getTransform()
      .getWorldScale();
    const targetRot = thumb.sceneObject.getTransform().getWorldRotation();

    thumb.sceneObject.enabled = false;

    animate({
      duration: ATTACH_ANIM_DURATION,
      easing: "ease-in-out-cubic",
      update: (t: number) => {
        if (isNull(floater)) return;
        floaterTrans.setWorldPosition(vec3.lerp(startPos, targetPos, t));
        floaterTrans.setWorldScale(vec3.lerp(startScale, targetScale, t));
        floaterTrans.setWorldRotation(quat.slerp(startRot, targetRot, t));
      },
      ended: () => {
        if (!isNull(floater)) floater.destroy();
        if (!isNull(thumb.sceneObject)) thumb.sceneObject.enabled = true;
        this.activeFloater = null;
      },
      cancelSet: this.attachAnimCancelSet,
    });
  }
}
