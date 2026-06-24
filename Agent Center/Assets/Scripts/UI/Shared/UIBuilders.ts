import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { ScrollWindow } from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import {
  setTimeout,
  clearTimeout,
} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import {
  TextSize,
  TextFont,
  TextSizeValue,
  TextFontValue,
  styleText,
} from "./TextSizes";
import { createImage } from "./ImageFactory";
import { ICON_Z_OFFSET, TOOLTIP_OFFSET, DEBUG_DISABLE_SCROLL_WINDOWS } from "./UIConstants";

export interface TooltipOptions {
  offset?: vec3;
  scale?: number;
  hoverSource?: {
    onHoverEnter: { add: (fn: () => void) => void };
    onHoverExit: { add: (fn: () => void) => void };
  };
}

export function createTooltip(
  parent: SceneObject,
  tip: string,
  opts?: TooltipOptions,
): Tooltip {
  const safeName = tip.replace(/\s+/g, "");
  const tooltipObj = global.scene.createSceneObject(`${safeName}Tooltip`);
  tooltipObj.setParent(parent);
  tooltipObj.getTransform().setLocalPosition(opts?.offset ?? TOOLTIP_OFFSET);
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
  fontSize?: TextSizeValue;
  fontWeight?: TextFontValue;
}

export interface IconButtonResult {
  sceneObject: SceneObject;
  button: RectangleButton;
  labelText: Text;
  iconImage: Image | null;
}

/**
 * Creates a RectangleButton with an optional left-aligned icon and a centered text label.
 * The button is initialized and ready for event binding.
 */
export function createIconButton(opts: IconButtonOptions): IconButtonResult {
  const btnObj = global.scene.createSceneObject(opts.name);
  btnObj.setParent(opts.parent);

  if (opts.position) {
    btnObj.getTransform().setLocalPosition(opts.position);
  }

  const btn = btnObj.createComponent(
    RectangleButton.getTypeName(),
  ) as RectangleButton;
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
    size: opts.fontSize ?? TextSize.S,
    font: opts.fontWeight ?? TextFont.Medium,
    position: new vec3(0, 0, ICON_Z_OFFSET),
    horizontalOverflow: HorizontalOverflow.Truncate,
    horizontalAlignment: HorizontalAlignment.Center,
    worldSpaceRect: Rect.create(
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
  button: RectangleButton;
  titleText: Text;
  subtitleText: Text;
  iconImage: Image;
}

export interface CreateTextOptions {
  parent: SceneObject;
  name: string;
  text?: string;
  size: TextSizeValue;
  font?: TextFontValue;
  color?: vec4;
  position?: vec3;
  horizontalOverflow?: HorizontalOverflow;
  horizontalAlignment?: HorizontalAlignment;
  verticalAlignment?: VerticalAlignment;
  worldSpaceRect?: Rect;
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
  styleText(textComp, opts.size, opts.font);
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
  if (opts.worldSpaceRect) {
    textComp.worldSpaceRect = opts.worldSpaceRect;
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

  const btn = btnObj.createComponent(
    RectangleButton.getTypeName(),
  ) as RectangleButton;
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
    size: TextSize.L,
    font: TextFont.SemiBold,
    color: new vec4(1, 1, 1, 1),
    position: new vec3(0, titleY, ICON_Z_OFFSET),
    horizontalOverflow: HorizontalOverflow.Truncate,
    horizontalAlignment: HorizontalAlignment.Left,
    worldSpaceRect: Rect.create(textLeft, textRight, -1, 1),
  });

  const subtitleText = createText({
    parent: btnObj,
    name: `${opts.name}Subtitle`,
    text: opts.subtitle,
    size: TextSize.M,
    color: new vec4(1, 1, 1, 0.45),
    position: new vec3(0, subtitleY, ICON_Z_OFFSET),
    horizontalOverflow: HorizontalOverflow.Truncate,
    horizontalAlignment: HorizontalAlignment.Left,
    worldSpaceRect: Rect.create(textLeft, textRight, -1, 1),
  });

  return { sceneObject: btnObj, button: btn, titleText, subtitleText, iconImage };
}

const SCROLLBAR_THICKNESS = 1.2;
const SCROLLBAR_HIT_WIDTH_MULTIPLIER = 3;
const SCROLLBAR_TRACK_COLOR = new vec4(0, 0, 0, 1);
const SCROLLBAR_KNOB_COLOR = new vec4(0.45, 0.45, 0.45, 1);
const SCROLLBAR_KNOB_ACTIVE_COLOR = new vec4(0.6, 0.6, 0.6, 1);
const SCROLLBAR_KNOB_Z = 0.1;
const SCROLL_LINGER_MS = 800;
const SCROLLBAR_FADE_DURATION = 0.18;

export function createVerticalScrollBar(
  parent: SceneObject,
  scrollWindow: ScrollWindow,
  position: vec3,
  thickness: number = SCROLLBAR_THICKNESS,
  registerHoverControl?: (setHovered: (hovered: boolean) => void) => void,
): SceneObject {
  scrollWindow.hardStopAtEnds = false;

  const root = global.scene.createSceneObject("VerticalScrollBar");
  root.setParent(parent);
  root.getTransform().setLocalPosition(position);

  const trackObj = global.scene.createSceneObject("ScrollBarTrack");
  trackObj.setParent(root);
  const track = trackObj.createComponent(
    RoundedRectangle.getTypeName(),
  ) as RoundedRectangle;
  track.size = new vec2(thickness, 1);
  track.cornerRadius = thickness / 2;
  track.backgroundColor = new vec4(SCROLLBAR_TRACK_COLOR.r, SCROLLBAR_TRACK_COLOR.g, SCROLLBAR_TRACK_COLOR.b, 0);
  track.initialize();
  track.renderMeshVisual.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto;
  track.renderMeshVisual.mainPass.colorMask = new vec4b(true, true, true, true);

  const knobObj = global.scene.createSceneObject("ScrollBarKnob");
  knobObj.setParent(root);
  const knob = knobObj.createComponent(
    RoundedRectangle.getTypeName(),
  ) as RoundedRectangle;
  knob.size = new vec2(thickness, 1);
  knob.cornerRadius = thickness / 2;
  knob.backgroundColor = new vec4(SCROLLBAR_KNOB_COLOR.r, SCROLLBAR_KNOB_COLOR.g, SCROLLBAR_KNOB_COLOR.b, 0);
  knob.initialize();
  knob.renderMeshVisual.mainPass.blendMode = BlendMode.PremultipliedAlphaAuto;
  knob.renderMeshVisual.mainPass.colorMask = new vec4b(true, true, true, true);

  const hitWidth = thickness * SCROLLBAR_HIT_WIDTH_MULTIPLIER;
  const colliderShape = Shape.createBoxShape();
  const collider = root.createComponent(
    "ColliderComponent",
  ) as ColliderComponent;
  collider.shape = colliderShape;
  collider.fitVisual = false;
  const interactable = root.createComponent(
    Interactable.getTypeName(),
  ) as Interactable;
  interactable.enableInstantDrag = true;

  trackObj.enabled = false;
  knobObj.enabled = false;
  collider.enabled = false;

  let isDragging = false;
  let isHovering = false;
  let currentTrackHeight = 1;
  let currentAlpha = 0;
  const fadeCancel = new CancelSet();
  let scrollLingerTimeout: ReturnType<typeof setTimeout> | null = null;

  const cancelScrollLinger = () => {
    if (scrollLingerTimeout !== null) {
      clearTimeout(scrollLingerTimeout);
      scrollLingerTimeout = null;
    }
  };

  const applyAlpha = (alpha: number) => {
    currentAlpha = alpha;
    track.backgroundColor = new vec4(SCROLLBAR_TRACK_COLOR.r, SCROLLBAR_TRACK_COLOR.g, SCROLLBAR_TRACK_COLOR.b, alpha);
    const base = isDragging ? SCROLLBAR_KNOB_ACTIVE_COLOR : SCROLLBAR_KNOB_COLOR;
    knob.backgroundColor = new vec4(base.r, base.g, base.b, alpha);
  };

  const animateTo = (target: number) => {
    fadeCancel.cancel();
    const start = currentAlpha;
    if (target > 0) {
      root.enabled = true;
    }
    animate({
      duration: SCROLLBAR_FADE_DURATION,
      easing: target > 0 ? "ease-out-cubic" : "ease-in-cubic",
      cancelSet: fadeCancel,
      update: (t: number) => applyAlpha(start + (target - start) * t),
      ended: () => {
        applyAlpha(target);
        if (target === 0) root.enabled = false;
      },
    });
  };

  const show = () => {
    update();
    if (currentAlpha < 1) animateTo(1);
  };

  const hide = () => {
    if (currentAlpha > 0) animateTo(0);
  };

  const update = () => {
    const windowH = scrollWindow.windowSize.y;
    const contentH = scrollWindow.scrollDimensions.y;

    if (contentH <= windowH) {
      trackObj.enabled = false;
      knobObj.enabled = false;
      collider.enabled = false;
      return;
    }

    trackObj.enabled = true;
    knobObj.enabled = true;
    collider.enabled = true;

    currentTrackHeight = windowH;
    track.size = new vec2(thickness, windowH);

    const ratio = windowH / contentH;
    const knobHeight = Math.max(windowH * ratio, thickness);
    knob.size = new vec2(thickness, knobHeight);

    colliderShape.size = new vec3(hitWidth, windowH, 1);
    collider.shape = colliderShape;

    const normalizedY = scrollWindow.scrollPositionNormalized.y;
    const travel = windowH - knobHeight;
    knobObj
      .getTransform()
      .setLocalPosition(
        new vec3(0, (normalizedY * travel) / 2, SCROLLBAR_KNOB_Z),
      );
  };

  interactable.onInteractorTriggerStart.add(() => {
    isDragging = true;
    scrollWindow.isControlledExternally = true;
    knob.backgroundColor = new vec4(SCROLLBAR_KNOB_ACTIVE_COLOR.r, SCROLLBAR_KNOB_ACTIVE_COLOR.g, SCROLLBAR_KNOB_ACTIVE_COLOR.b, currentAlpha);
    cancelScrollLinger();
  });

  interactable.onDragUpdate.add((event) => {
    if (!isDragging) return;
    const intersection = event.interactor.planecastPoint;
    if (!intersection) return;

    const localPos = root
      .getTransform()
      .getInvertedWorldTransform()
      .multiplyPoint(intersection);
    const halfTrack = currentTrackHeight / 2;
    const normalizedY = MathUtils.clamp(localPos.y / halfTrack, -1, 1);
    scrollWindow.scrollPositionNormalized = new vec2(
      scrollWindow.scrollPositionNormalized.x,
      normalizedY,
    );
  });

  const endDrag = () => {
    isDragging = false;
    scrollWindow.isControlledExternally = false;
    knob.backgroundColor = new vec4(SCROLLBAR_KNOB_COLOR.r, SCROLLBAR_KNOB_COLOR.g, SCROLLBAR_KNOB_COLOR.b, currentAlpha);
    if (!isHovering) {
      scrollLingerTimeout = setTimeout(() => {
        scrollLingerTimeout = null;
        if (!isHovering) hide();
      }, SCROLL_LINGER_MS);
    }
  };
  interactable.onDragEnd.add(endDrag);
  interactable.onTriggerCanceled.add(endDrag);

  scrollWindow.onScrollPositionUpdated.add(() => {
    show();
    cancelScrollLinger();
    scrollLingerTimeout = setTimeout(() => {
      scrollLingerTimeout = null;
      if (!isHovering && !isDragging) hide();
    }, SCROLL_LINGER_MS);
  });
  scrollWindow.onScrollDimensionsUpdated.add(update);
  scrollWindow.onInitialized.add(update);

  const setHovered = (hovered: boolean) => {
    isHovering = hovered;
    if (hovered) {
      cancelScrollLinger();
      show();
    } else {
      if (!isDragging && scrollLingerTimeout === null) hide();
    }
  };

  if (registerHoverControl) {
    registerHoverControl(setHovered);
  } else {
    const contentInteractable = scrollWindow
      .getSceneObject()
      .getComponent(Interactable.getTypeName()) as Interactable | null;
    if (contentInteractable) {
      contentInteractable.onHoverEnter.add(() => setHovered(true));
      contentInteractable.onHoverExit.add(() => setHovered(false));
    }
  }

  return root;
}

export function initializeScrollWindow(scrollWindow: ScrollWindow): void {
  if (DEBUG_DISABLE_SCROLL_WINDOWS) {
    scrollWindow.enabled = false;
  } else {
    scrollWindow.initialize();
  }
}
