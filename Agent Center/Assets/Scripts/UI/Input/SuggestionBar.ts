import { CapsuleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/CapsuleButton";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { createText } from "../Shared/UIBuilders";
import { ICON_Z_OFFSET } from "../Shared/UIConstants";
import { DirtyComponent } from "../Shared/DirtyComponent";
import animate, { CancelSet } from "SpectaclesInteractionKit.lspkg/Utils/animate";

const CAPSULE_HEIGHT = 2.5;
const CAPSULE_DEPTH = 0.5;
const H_SPACING = 0.6;
const TEXT_H_PADDING = 1.6;
const MIN_CAPSULE_WIDTH = 4;
const MAX_CAPSULES = 3;
const Z_CONTENT = 0.15;

const APPEAR_DURATION = 0.22;
const DISAPPEAR_DURATION = 0.15;
const SLIDE_OFFSET_Y = -1.5;
const ANIM_START_SCALE = 0.82;

interface TrackedCapsule {
  sceneObject: SceneObject;
  button: CapsuleButton;
  textComponent: Text;
}

@component
export class SuggestionBar extends DirtyComponent {
  private content: SceneObject;
  private trackedCapsules: TrackedCapsule[] = [];
  private currentSuggestions: string[] = [];
  private windowWidth = 20;
  private _animCancels = new CancelSet();
  private _visible = false;

  public readonly onSuggestionTapped = new Event<string>();

  onAwake(): void {
    super.onAwake();
    const root = this.getSceneObject();

    this.content = global.scene.createSceneObject("SuggestionContent");
    this.content.setParent(root);
    this.content.getTransform().setLocalPosition(vec3.zero());
    this.content.enabled = false;

    for (let i = 0; i < MAX_CAPSULES; i++) {
      const capsule = this._createCapsule(i);
      capsule.sceneObject.enabled = false;
      this.trackedCapsules.push(capsule);
    }
  }

  private _createCapsule(index: number): TrackedCapsule {
    const btnObj = global.scene.createSceneObject(`Suggestion_${index}`);
    btnObj.setParent(this.content);

    const btn = btnObj.createComponent(
      CapsuleButton.getTypeName(),
    ) as CapsuleButton;
    btn.size = new vec3(MIN_CAPSULE_WIDTH, CAPSULE_HEIGHT, CAPSULE_DEPTH);
    btn.initialize();

    const textComp = createText({
      parent: btnObj,
      name: `SuggestionText_${index}`,
      text: "",
      size: TextSize.XS,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 0.9),
      position: new vec3(0, 0, ICON_Z_OFFSET),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(-50, 50, -CAPSULE_HEIGHT / 2, CAPSULE_HEIGHT / 2),
    });

    btn.onTriggerUp.add(() => {
      this.onSuggestionTapped.invoke(textComp.text);
    });

    return { sceneObject: btnObj, button: btn, textComponent: textComp };
  }

  setSuggestions(suggestions: string[]): void {
    this.currentSuggestions = suggestions.slice(0, MAX_CAPSULES);
    this.scheduleLayout();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this._animCancels.cancel();
    const hasContent = this.currentSuggestions.length > 0;

    if (visible && hasContent) {
      const t = this.content.getTransform();
      if (!this.content.enabled) {
        t.setLocalPosition(new vec3(0, SLIDE_OFFSET_Y, 0));
        t.setLocalScale(new vec3(ANIM_START_SCALE, ANIM_START_SCALE, ANIM_START_SCALE));
      }
      this.content.enabled = true;
      const startY = t.getLocalPosition().y;
      const startScale = t.getLocalScale().x;
      animate({
        duration: APPEAR_DURATION,
        easing: "ease-out-cubic",
        cancelSet: this._animCancels,
        update: (u) => {
          t.setLocalPosition(new vec3(0, startY + (0 - startY) * u, 0));
          const s = startScale + (1 - startScale) * u;
          t.setLocalScale(new vec3(s, s, s));
        },
        ended: () => {
          t.setLocalPosition(vec3.zero());
          t.setLocalScale(vec3.one());
        },
      });
    } else {
      if (!this.content.enabled) return;
      const t = this.content.getTransform();
      const startY = t.getLocalPosition().y;
      const startScale = t.getLocalScale().x;
      animate({
        duration: DISAPPEAR_DURATION,
        easing: "ease-in-cubic",
        cancelSet: this._animCancels,
        update: (u) => {
          t.setLocalPosition(new vec3(0, startY + (SLIDE_OFFSET_Y - startY) * u, 0));
          const s = startScale + (ANIM_START_SCALE - startScale) * u;
          t.setLocalScale(new vec3(s, s, s));
        },
        ended: () => {
          this.content.enabled = false;
          t.setLocalPosition(vec3.zero());
          t.setLocalScale(vec3.one());
        },
      });
    }
  }

  clear(): void {
    this.currentSuggestions = [];
    this.scheduleLayout();
  }

  setWidth(width: number): void {
    if (width === this.windowWidth) return;
    this.windowWidth = width;
    this.scheduleLayout();
  }

  getVisualHeight(): number {
    if (this.currentSuggestions.length === 0) return 0;
    return CAPSULE_HEIGHT;
  }

  hasSuggestions(): boolean {
    return this.currentSuggestions.length > 0;
  }

  private scheduleLayout(): void {
    this.markDirty();
  }

  protected onFlush(_flags: number): void {
    this.rebuildCapsules();
  }

  private rebuildCapsules(): void {
    const count = this.currentSuggestions.length;
    const hasSuggestions = count > 0;
    this.content.enabled = hasSuggestions && this._visible;

    for (let i = 0; i < this.trackedCapsules.length; i++) {
      const tracked = this.trackedCapsules[i];
      if (i < count) {
        tracked.textComponent.text = this.currentSuggestions[i];
        tracked.sceneObject.enabled = true;
      } else {
        tracked.sceneObject.enabled = false;
      }
    }

    for (let i = this.trackedCapsules.length; i < count; i++) {
      const tracked = this._createCapsule(i);
      tracked.textComponent.text = this.currentSuggestions[i];
      this.trackedCapsules.push(tracked);
    }

    if (hasSuggestions) {
      this.layoutCapsules(count);
    }
  }

  private layoutCapsules(count: number): void {
    const capsuleWidths = this.trackedCapsules.slice(0, count).map((tracked) => {
      const textWidth = tracked.textComponent.getBoundingBox().getSize().x;
      return Math.max(MIN_CAPSULE_WIDTH, textWidth + TEXT_H_PADDING);
    });

    const totalContentWidth =
      capsuleWidths.reduce((sum, w) => sum + w, 0) + (count - 1) * H_SPACING;

    for (let i = 0; i < count; i++) {
      const tracked = this.trackedCapsules[i];
      const capsuleWidth = capsuleWidths[i];

      tracked.button.size = new vec3(
        capsuleWidth,
        CAPSULE_HEIGHT,
        CAPSULE_DEPTH,
      );

      const halfW = capsuleWidth / 2 - 0.4;
      tracked.textComponent.worldSpaceRect = Rect.create(
        -halfW,
        halfW,
        -CAPSULE_HEIGHT / 2,
        CAPSULE_HEIGHT / 2,
      );

      const x =
        -(totalContentWidth / 2) +
        capsuleWidths.slice(0, i).reduce((s, w) => s + w + H_SPACING, 0) +
        capsuleWidth / 2;
      tracked.sceneObject
        .getTransform()
        .setLocalPosition(new vec3(x, 0, Z_CONTENT));
    }
  }
}
