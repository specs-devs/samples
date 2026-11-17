import { Button } from "UIKit.lspkg/Scripts/Components/Button/Button";
import { createSystemButton, ButtonStyle } from "./SystemButton";
import { ScrollWindow } from "UIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { ScrollBar } from "UIKit.lspkg/Scripts/ScrollBar";
import { Tooltip } from "UIKit.lspkg/Scripts/Tooltip";
import { styleText } from "./TextSizes";
import { TextRole, TextStyle, TextColor, buttonTextStyle } from "./UIStyle";
import { createImage } from "./ImageFactory";
import { ICON_Z_OFFSET, TOOLTIP_OFFSET, DEBUG_DISABLE_SCROLL_WINDOWS } from "./UIConstants";

export interface TooltipOptions {
  offset?: vec3;
  /**
   * "below" (default), "above", "left" or "right" of the target. Pick the side that
   * has free space so the tip never covers neighbouring UI. With targetSize
   * the tip clears the target's edge exactly; without it a fixed offset is used.
   */
  placement?: "below" | "above" | "left" | "right";
  /** Width/height of the target, used to clear its edge for "left". */
  targetSize?: vec2;
  scale?: number;
  hoverSource?: {
    onHoverEnter: { add: (fn: () => void) => void };
    onHoverExit: { add: (fn: () => void) => void };
  };
}

const TOOLTIP_LEFT_GAP = 1;
const TOOLTIP_CHAR_WIDTH = 0.5;
const TOOLTIP_PADDING_WIDTH = 2;
const TOOLTIP_VERTICAL_GAP = 0.8;
const TOOLTIP_HALF_HEIGHT = 1;

// Tooltips are centered on their offset, so for "left" shift by half the
// target, a gap, and half the (estimated) tooltip width.
function getTooltipOffset(tip: string, opts?: TooltipOptions): vec3 {
  const placement = opts?.placement ?? "below";
  if (placement === "left" || placement === "right") {
    if (!opts?.targetSize) return TOOLTIP_OFFSET;
    const tipWidth = tip.length * TOOLTIP_CHAR_WIDTH + TOOLTIP_PADDING_WIDTH;
    const scale = opts.scale ?? 1;
    const side = placement === "left" ? -1 : 1;
    const x =
      side * (opts.targetSize.x / 2 + TOOLTIP_LEFT_GAP + (tipWidth * scale) / 2);
    return new vec3(x, 0, TOOLTIP_OFFSET.z);
  }
  const sign = placement === "above" ? 1 : -1;
  if (!opts?.targetSize) {
    return new vec3(0, sign * Math.abs(TOOLTIP_OFFSET.y), TOOLTIP_OFFSET.z);
  }
  const scale = opts.scale ?? 1;
  const y =
    sign *
    (opts.targetSize.y / 2 + TOOLTIP_VERTICAL_GAP + TOOLTIP_HALF_HEIGHT * scale);
  return new vec3(0, y, TOOLTIP_OFFSET.z);
}

export function createTooltip(
  parent: SceneObject,
  tip: string,
  opts?: TooltipOptions,
): Tooltip {
  const safeName = tip.replace(/\s+/g, "");
  const tooltipObj = global.scene.createSceneObject(`${safeName}Tooltip`);
  tooltipObj.setParent(parent);
  tooltipObj
    .getTransform()
    .setLocalPosition(opts?.offset ?? getTooltipOffset(tip, opts));
  if (opts?.scale !== undefined) {
    tooltipObj
      .getTransform()
      .setLocalScale(vec3.one().uniformScale(opts.scale));
  }
  const tooltip = tooltipObj.createComponent(Tooltip.getTypeName()) as Tooltip;
  tooltip.tip = tip;
  if (opts?.hoverSource) {
    opts.hoverSource.onHoverEnter.add(() => tooltip.setOn(true));
    opts.hoverSource.onHoverExit.add(() => tooltip.setOn(false));
  }
  return tooltip;
}

export function createAudioComponent(
  parent: SceneObject,
  volume = 0.5,
): AudioComponent {
  const audio = parent.createComponent(
    "Component.AudioComponent",
  ) as AudioComponent;
  audio.volume = volume;
  audio.playbackMode = Audio.PlaybackMode.LowLatency;
  return audio;
}

export interface IconButtonOptions {
  parent: SceneObject;
  name: string;
  width: number;
  height: number;
  label: string;
  position?: vec3;
  icon?: Texture;
  iconSize?: number;
  toggleable?: boolean;
  toggled?: boolean;
  /** Overrides the label role derived from `height` (see buttonTextStyle). */
  textStyle?: TextRole;
  /** System 3.0 emphasis; defaults to Secondary. */
  style?: ButtonStyle;
}

export interface IconButtonResult {
  sceneObject: SceneObject;
  button: Button;
  labelText: Text;
  iconImage: Image | null;
}

/**
 * Creates a Button with an optional left-aligned icon and a centered text label.
 * The button is initialized and ready for event binding.
 */
export function createIconButton(opts: IconButtonOptions): IconButtonResult {
  const btnObj = global.scene.createSceneObject(opts.name);
  btnObj.setParent(opts.parent);

  if (opts.position) {
    btnObj.getTransform().setLocalPosition(opts.position);
  }

  const btn = createSystemButton(btnObj, opts.style ?? "Secondary");
  btn.size = new vec3(opts.width, opts.height, 0.5);

  if (opts.toggleable) {
    btn.setIsToggleable(true);
  }
  btn.initialize();

  if (opts.toggleable && opts.toggled) {
    btn.toggle(true);
  }

  let iconImage: Image | null = null;
  let textInset = 0;

  if (opts.icon) {
    const iconSz = opts.iconSize ?? opts.height * 0.4;
    iconImage = createImage(opts.icon, {
      parent: btnObj,
      name: `${opts.name}Icon`,
      position: new vec3(-opts.width / 2 + iconSz / 2 + 0.5, 0, ICON_Z_OFFSET),
      size: iconSz,
    });
    textInset = iconSz + 0.3;
  }

  const text = createText({
    parent: btnObj,
    name: `${opts.name}Label`,
    text: opts.label,
    style: opts.textStyle ?? buttonTextStyle(opts.height),
    position: new vec3(0, 0, ICON_Z_OFFSET),
    horizontalOverflow: HorizontalOverflow.Truncate,
    horizontalAlignment: HorizontalAlignment.Center,
    layoutRect: Rect.create(
      -opts.width / 2 + 0.3 + textInset,
      opts.width / 2 - 0.3,
      -opts.height / 2,
      opts.height / 2,
    ),
  });

  return { sceneObject: btnObj, button: btn, labelText: text, iconImage };
}

export interface SettingsTileOptions {
  parent: SceneObject;
  name: string;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  icon: Texture;
  iconSize?: number;
  position?: vec3;
}

export interface SettingsTileResult {
  sceneObject: SceneObject;
  button: Button;
  titleText: Text;
  subtitleText: Text;
  iconImage: Image;
}

export interface CreateTextOptions {
  parent: SceneObject;
  name: string;
  text?: string;
  /** Typography role from UIStyle — the only way to set size/font. */
  style: TextRole;
  color?: vec4;
  position?: vec3;
  horizontalOverflow?: HorizontalOverflow;
  horizontalAlignment?: HorizontalAlignment;
  verticalAlignment?: VerticalAlignment;
  layoutRect?: Rect;
}

export function createText(opts: CreateTextOptions): Text {
  const obj = global.scene.createSceneObject(opts.name);
  obj.setParent(opts.parent);
  if (opts.position) {
    obj.getTransform().setLocalPosition(opts.position);
  }
  const textComp = obj.createComponent("Text") as Text;
  if (opts.text !== undefined) {
    textComp.text = opts.text;
  }
  styleText(textComp, opts.style.size, opts.style.font);
  if (opts.color) {
    textComp.textFill.color = opts.color;
  }
  if (opts.horizontalOverflow !== undefined) {
    textComp.horizontalOverflow = opts.horizontalOverflow;
  }
  if (opts.horizontalAlignment !== undefined) {
    textComp.horizontalAlignment = opts.horizontalAlignment;
  }
  if (opts.verticalAlignment !== undefined) {
    textComp.verticalAlignment = opts.verticalAlignment;
  }
  if (opts.layoutRect) {
    textComp.layoutRect = opts.layoutRect;
  }
  return textComp;
}

export function createSettingsTile(
  opts: SettingsTileOptions,
): SettingsTileResult {
  const btnObj = global.scene.createSceneObject(opts.name);
  btnObj.setParent(opts.parent);

  if (opts.position) {
    btnObj.getTransform().setLocalPosition(opts.position);
  }

  const btn = createSystemButton(btnObj, "Primary");
  btn.size = new vec3(opts.width, opts.height, 0.5);
  btn.initialize();

  const iconSz = opts.iconSize ?? opts.height * 0.55;
  const iconPad = 1.5;
  const iconCenterX = -opts.width / 2 + iconPad + iconSz / 2;

  const iconImage = createImage(opts.icon, {
    parent: btnObj,
    name: `${opts.name}Icon`,
    position: new vec3(iconCenterX, 0, ICON_Z_OFFSET),
    size: iconSz,
    shared: false,
  });

  const textLeft = iconCenterX + iconSz / 2 + 0.6;
  const textRight = opts.width / 2 - 0.6;
  const titleY = 0.55;
  const subtitleY = -0.55;

  const titleText = createText({
    parent: btnObj,
    name: `${opts.name}Title`,
    text: opts.title,
    style: TextStyle.ItemTitle,
    color: new vec4(1, 1, 1, 1),
    position: new vec3(0, titleY, ICON_Z_OFFSET),
    horizontalOverflow: HorizontalOverflow.Truncate,
    horizontalAlignment: HorizontalAlignment.Left,
    layoutRect: Rect.create(textLeft, textRight, -1, 1),
  });

  const subtitleText = createText({
    parent: btnObj,
    name: `${opts.name}Subtitle`,
    text: opts.subtitle,
    style: TextStyle.Body,
    color: TextColor.Muted,
    position: new vec3(0, subtitleY, ICON_Z_OFFSET),
    horizontalOverflow: HorizontalOverflow.Truncate,
    horizontalAlignment: HorizontalAlignment.Left,
    layoutRect: Rect.create(textLeft, textRight, -1, 1),
  });

  return { sceneObject: btnObj, button: btn, titleText, subtitleText, iconImage };
}

const SCROLLBAR_THICKNESS = 1.2;

/**
 * Adds a UIKit ScrollBar to a vertical ScrollWindow. The bar draws along its
 * object's X axis, so the root is rotated 90deg about Z (as in UIKit's prefab).
 */
export function createVerticalScrollBar(
  parent: SceneObject,
  scrollWindow: ScrollWindow,
  position: vec3,
  thickness: number = SCROLLBAR_THICKNESS,
): SceneObject {
  scrollWindow.edgeMode = "elastic";

  const root = global.scene.createSceneObject("VerticalScrollBar");
  root.setParent(parent);
  const transform = root.getTransform();
  transform.setLocalPosition(position);
  transform.setLocalRotation(quat.angleAxis(Math.PI / 2, vec3.forward()));

  const bar = root.createComponent(ScrollBar.getTypeName()) as ScrollBar;
  bar.setOrientation("Vertical");
  bar.size = new vec2(scrollWindow.windowSize.y, thickness);
  bar.setScrollWindow(scrollWindow);

  // Windows can resize with their content (e.g. the chat list), so keep the
  // track length matched to the visible height.
  scrollWindow.onScrollDimensionsUpdated.add(() => {
    const length = scrollWindow.windowSize.y;
    if (Math.abs(bar.size.x - length) > 0.001) {
      bar.size = new vec2(length, thickness);
    }
  });

  return root;
}

export function initializeScrollWindow(scrollWindow: ScrollWindow): void {
  if (DEBUG_DISABLE_SCROLL_WINDOWS) {
    scrollWindow.enabled = false;
  } else {
    scrollWindow.initialize();
  }
}
