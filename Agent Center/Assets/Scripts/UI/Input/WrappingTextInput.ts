require("LensStudio:TextInputModule"); // eslint-disable-line @typescript-eslint/no-require-imports

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { TargetingMode } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import {
  GradientParameters,
  RoundedRectangle,
} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { TextSize } from "../Shared/TextSizes";
import { createText } from "../Shared/UIBuilders";
import {
  BLEKeyboardManager,
  BLEKeyboardEvent,
} from "../../Bluetooth/BLEKeyboardManager";
import { DirtyComponent } from "../Shared/DirtyComponent";

const PLACEHOLDER_COLOR = new vec4(0.6, 0.6, 0.6, 1);
const TEXT_COLOR = new vec4(1, 1, 1, 1);
const BG_COLOR = new vec4(0.08, 0.08, 0.08, 0.9);
const CORNER_RADIUS = 0.5;
const VERTICAL_PADDING = 1;
const HORIZONTAL_PADDING = 1;
const DEFAULT_MAX_HEIGHT = 12;
const Z_TEXT = 0.3;
const BORDER_SIZE = 0.125;
const ANIMATION_DURATION = 0.333;

const MEDIUM_DARK_GRAY = new vec4(0.25, 0.25, 0.25, 1);
const DARKER_LESS_GRAY = new vec4(0.15, 0.15, 0.15, 1);
const TRIGGERED_BORDER_YELLOW = new vec4(0.94, 0.87, 0.6, 1);
const DARK_YELLOW = new vec4(0.28, 0.26, 0.15, 1);
const BRIGHT_WARM_YELLOW = new vec4(0.4, 0.37, 0.18, 1);
const DARKER_YELLOW = new vec4(0.23, 0.21, 0.13, 1);

const BORDER_GRADIENT_DEFAULT: GradientParameters = {
  enabled: true,
  type: "Linear",
  start: new vec2(-1.125, 0.7),
  end: new vec2(1.35, -0.7),
  stop0: { enabled: true, percent: 0, color: MEDIUM_DARK_GRAY },
  stop1: { enabled: true, percent: 0.5, color: DARKER_LESS_GRAY },
  stop2: { enabled: true, percent: 1, color: MEDIUM_DARK_GRAY },
};

const BORDER_GRADIENT_HOVERED: GradientParameters = {
  enabled: true,
  type: "Linear",
  start: new vec2(-1.125, 0.7),
  end: new vec2(1.35, -0.7),
  stop0: { enabled: true, percent: 0, color: BRIGHT_WARM_YELLOW },
  stop1: { enabled: true, percent: 0.5, color: DARKER_YELLOW },
  stop2: { enabled: true, percent: 1, color: BRIGHT_WARM_YELLOW },
};

const BORDER_GRADIENT_TOGGLED: GradientParameters = {
  enabled: true,
  type: "Linear",
  start: new vec2(-1.125, 0.7),
  end: new vec2(1.35, -0.7),
  stop0: { enabled: true, percent: 0, color: TRIGGERED_BORDER_YELLOW },
  stop1: { enabled: true, percent: 0.5, color: DARK_YELLOW },
  stop2: { enabled: true, percent: 1, color: TRIGGERED_BORDER_YELLOW },
};

@component
export class WrappingTextInput extends DirtyComponent {
  @input
  @hint("Width of the field in centimeters")
  fieldWidth = 14;

  @input
  @hint("Minimum / starting height in centimeters")
  fieldHeight = 3;

  @input
  @hint("Maximum height before text shrinks to fit (cm)")
  maxHeight = DEFAULT_MAX_HEIGHT;

  @input
  placeholderText = "";

  public textComponent: Text;

  private textCache = "";
  private isPlaceholder = true;
  private _isEditing = false;

  private background: RoundedRectangle;
  private collider: ColliderComponent;
  private colliderShape: BoxShape;
  private interactable: Interactable;

  private currentSize: vec3;
  private isHovered = false;
  private borderCancelSet = new CancelSet();
  private currentBorderGradient: GradientParameters = BORDER_GRADIENT_DEFAULT;

  @input
  @allowUndefined
  @hint("Optional BLE keyboard manager for Bluetooth keyboard input")
  bleKeyboardManager: BLEKeyboardManager;

  private keyboardOptions: TextInputSystem.KeyboardOptions;
  private _bleCallback: ((event: BLEKeyboardEvent) => void) | null = null;

  public onTextChanged: Event<string>;
  public onEditMode: Event<boolean>;
  public onSizeChanged: Event<vec3>;
  public onSubmitRequested: Event<void>;

  private _textOffset: vec2 = new vec2(0, 0);

  private _bleFocused = false;

  public setBleFocus(focused: boolean): void {
    this._bleFocused = focused;
  }

  public connectBLEKeyboard(manager: BLEKeyboardManager): void {
    if (this._bleCallback) return; // already registered
    this.bleKeyboardManager = manager;
    this.setupBLEKeyboard();
  }

  onAwake(): void {
    super.onAwake();
    this.onTextChanged = new Event<string>();
    this.onEditMode = new Event<boolean>();
    this.onSizeChanged = new Event<vec3>();
    this.onSubmitRequested = new Event<void>();
    this.keyboardOptions = new TextInputSystem.KeyboardOptions();
    this.currentSize = new vec3(this.fieldWidth, this.fieldHeight, 1);
    const root = this.getSceneObject();

    this.createBackground(root);
    this.createTextComponent(root);
    this.createCollider(root);
    this.setupKeyboard();
    this.setupBLEKeyboard();
  }

  initialize(): void {
    // Provided for API compatibility with InputBarController.
    // All setup is done in onAwake; this is a no-op.
  }

  private createBackground(parent: SceneObject): void {
    const bgObj = global.scene.createSceneObject("WTI_Background");
    bgObj.setParent(parent);
    bgObj.getTransform().setLocalPosition(vec3.zero());
    this.background = bgObj.createComponent(
      RoundedRectangle.getTypeName(),
    ) as RoundedRectangle;
    this.background.size = new vec2(this.fieldWidth, this.fieldHeight);
    this.background.cornerRadius = CORNER_RADIUS;
    this.background.backgroundColor = BG_COLOR;
    this.background.border = true;
    this.background.borderSize = BORDER_SIZE;
    this.background.initialize();
    this.background.renderMeshVisual.mainPass.blendMode =
      BlendMode.PremultipliedAlphaAuto;
    this.background.renderMeshVisual.mainPass.colorMask = new vec4b(
      true,
      true,
      true,
      true,
    );
    this.background.setBorderGradient(BORDER_GRADIENT_DEFAULT);
  }

  private createTextComponent(parent: SceneObject): void {
    this.textComponent = createText({
      parent,
      name: "WTI_Text",
      text: this.placeholderText,
      size: TextSize.M,
      color: PLACEHOLDER_COLOR,
      position: new vec3(0, 0, Z_TEXT),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Center,
    });
    this.textComponent.verticalOverflow = VerticalOverflow.Overflow;
    this.updateWorldSpaceRect();
  }

  private _interactionEnabled = true;

  setInteractionEnabled(enabled: boolean): void {
    this._interactionEnabled = enabled;
    if (this.interactable) {
      this.interactable.enabled = enabled;
    }
  }

  private createCollider(parent: SceneObject): void {
    const colObj = global.scene.createSceneObject("WTI_Collider");
    colObj.setParent(parent);
    this.collider = colObj.createComponent(
      "ColliderComponent",
    ) as ColliderComponent;
    this.collider.fitVisual = false;
    this.colliderShape = Shape.createBoxShape();
    this.colliderShape.size = new vec3(this.fieldWidth, this.fieldHeight, 1);
    this.collider.shape = this.colliderShape;

    this.interactable = colObj.createComponent(
      Interactable.getTypeName(),
    ) as Interactable;
    this.interactable.targetingMode = TargetingMode.All;
    this.interactable.onTriggerEnd.add(() => {
      if (!this._isEditing) {
        this.editMode(true);
      }
    });
    this.interactable.onHoverEnter.add(() => {
      this.isHovered = true;
      this.updateVisualState();
    });
    this.interactable.onHoverExit.add(() => {
      this.isHovered = false;
      this.updateVisualState();
    });
  }

  private setupKeyboard(): void {
    this.keyboardOptions.enablePreview = true;
    this.keyboardOptions.keyboardType = TextInputSystem.KeyboardType.Text;
    this.keyboardOptions.returnKeyType = TextInputSystem.ReturnKeyType.Done;

    this.keyboardOptions.onTextChanged = (text: string) => {
      this._isEditing = true;
      this.text = text;
    };

    this.keyboardOptions.onKeyboardStateChanged = (isOpen: boolean) => {
      if (!isOpen) {
        this.editMode(false);
      }
    };

    this.keyboardOptions.onReturnKeyPressed = () => {
      // dismiss handled by keyboard state change
    };
  }

  private setupBLEKeyboard(): void {
    if (!this.bleKeyboardManager) return;
    this._bleCallback = (event: BLEKeyboardEvent) => {
      if (!this._isEditing && !this._bleFocused) return;
      if (
        event.modifiers?.ctrl ||
        event.modifiers?.alt ||
        event.modifiers?.meta
      )
        return;

      if (event.isSpecialKey) {
        switch (event.key) {
          case "Backspace":
          case "Delete":
            this.text = this.textCache.slice(0, -1);
            break;
          case "Enter":
            if (this._bleFocused && !this._isEditing) {
              this.onSubmitRequested.invoke();
            } else {
              this.editMode(false);
            }
            break;
          case "Escape":
            this.editMode(false);
            break;
          default:
            break;
        }
      } else {
        if (this.isPlaceholder) {
          this.isPlaceholder = false;
          this.textCache = "";
          this.textComponent.text = "";
          this.textComponent.textFill.color = TEXT_COLOR;
        }
        this.text = this.textCache + event.key;
      }
    };
    this.bleKeyboardManager.onKeyboardInput.add(this._bleCallback);
  }

  public editMode(editing: boolean): void {
    this.onEditMode.invoke(editing);
    if (editing && !this._isEditing) {
      if (this.isPlaceholder) {
        this.isPlaceholder = false;
        this.keyboardOptions.initialText = "";
        this.textCache = "";
        this.textComponent.text = "";
        this.onTextChanged.invoke("");
      } else {
        this.keyboardOptions.initialText = this.textCache;
      }
      this.textComponent.textFill.color = TEXT_COLOR;
      global.textInputSystem.requestKeyboard(this.keyboardOptions);
      this._isEditing = true;
    } else if (!editing && this._isEditing) {
      this._isEditing = false;
      global.textInputSystem.dismissKeyboard();
      this.checkForEmptyText();
    }
    this.updateVisualState();
  }

  public showPlaceholderText(text: string): void {
    this.isPlaceholder = true;
    this.textCache = "";
    this.textComponent.text = text;
    this.textComponent.textFill.color = PLACEHOLDER_COLOR;
    this.markDirty();
  }

  public get text(): string {
    return this.textCache;
  }

  public set text(value: string) {
    if (value === undefined) return;
    this.textCache = value;
    if (value === "") {
      this.isPlaceholder = true;
      this.textComponent.text = this.placeholderText;
      this.textComponent.textFill.color = PLACEHOLDER_COLOR;
    } else {
      this.isPlaceholder = false;
      this.textComponent.text = value;
      this.textComponent.textFill.color = TEXT_COLOR;
    }
    if (!this._isEditing) this.checkForEmptyText();
    this.markDirty();
    this.onTextChanged.invoke(value);
  }

  public get textOffset(): vec2 {
    return this._textOffset;
  }

  public set textOffset(offset: vec2) {
    if (offset === undefined) return;
    this._textOffset = offset;
    this.updateWorldSpaceRect();
  }

  public get isEditing(): boolean {
    return this._isEditing;
  }

  public get isActive(): boolean {
    return this._isEditing || this._bleFocused;
  }

  public getSize(): vec3 {
    return this.currentSize;
  }

  private checkForEmptyText(): void {
    if (this.textCache === "") {
      this.isPlaceholder = true;
      this.textComponent.text = this.placeholderText;
      this.textComponent.textFill.color = PLACEHOLDER_COLOR;
    }
  }

  private updateWorldSpaceRect(
    halfHeight: number = this.fieldHeight * 5,
  ): void {
    const halfWidth = this.fieldWidth / 2 - HORIZONTAL_PADDING;
    this.textComponent.worldSpaceRect = Rect.create(
      -halfWidth + this._textOffset.x,
      halfWidth - this._textOffset.y,
      -halfHeight,
      halfHeight,
    );
  }

  protected onFlush(_flags: number): void {
    this.textComponent.verticalOverflow = VerticalOverflow.Overflow;
    this.updateWorldSpaceRect();
    const bbox = this.textComponent.getBoundingBox();
    const textHeight = bbox.getSize().y;
    const paddedHeight = textHeight + VERTICAL_PADDING;
    const clampedHeight = Math.min(paddedHeight, this.maxHeight);
    const newHeight = Math.max(this.fieldHeight, clampedHeight);

    this.updateWorldSpaceRect(newHeight / 2 - VERTICAL_PADDING / 2);
    if (paddedHeight > this.maxHeight) {
      this.textComponent.verticalOverflow = VerticalOverflow.Truncate;
    }

    if (Math.abs(newHeight - this.currentSize.y) > 0.01) {
      this.currentSize = new vec3(this.fieldWidth, newHeight, 1);
      this.background.size = new vec2(this.fieldWidth, newHeight);
      this.colliderShape.size = new vec3(this.fieldWidth, newHeight, 1);
      this.collider.shape = this.colliderShape;

      const yOffset = (newHeight - this.fieldHeight) / 2;
      this.background
        .getSceneObject()
        .getTransform()
        .setLocalPosition(new vec3(0, yOffset, 0));
      this.collider
        .getSceneObject()
        .getTransform()
        .setLocalPosition(new vec3(0, yOffset, 0));
      this.textComponent
        .getSceneObject()
        .getTransform()
        .setLocalPosition(new vec3(0, yOffset, Z_TEXT));

      this.onSizeChanged.invoke(this.currentSize);
    }
  }

  private updateVisualState(): void {
    let target: GradientParameters;
    if (this._isEditing) {
      target = this.isHovered
        ? BORDER_GRADIENT_TOGGLED
        : BORDER_GRADIENT_HOVERED;
    } else {
      target = this.isHovered
        ? BORDER_GRADIENT_HOVERED
        : BORDER_GRADIENT_DEFAULT;
    }
    this.transitionBorder(target);
  }

  private transitionBorder(target: GradientParameters): void {
    this.borderCancelSet.cancel();
    const from = this.currentBorderGradient;
    animate({
      cancelSet: this.borderCancelSet,
      duration: ANIMATION_DURATION,
      easing: "ease-in-quart",
      update: (t: number) => {
        this.currentBorderGradient = GradientParameters.lerp(from, target, t);
        this.background.setBorderGradient(this.currentBorderGradient);
      },
    });
  }
}
