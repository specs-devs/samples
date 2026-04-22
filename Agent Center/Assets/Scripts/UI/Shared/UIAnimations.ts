import animate, {
  CancelSet,
  easingFunctions,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { MIN_SCALE } from "./UIConstants";

type EasingName = keyof typeof easingFunctions;

const TINY_SCALE = new vec3(MIN_SCALE, MIN_SCALE, MIN_SCALE);

export interface ScaleAnimOptions {
  cancelSet: CancelSet;
  duration: number;
  easing?: EasingName;
  ended?: () => void;
}

export interface SlideOutOptions extends ScaleAnimOptions {
  sceneObject: SceneObject;
  slideOffset: vec3;
}

export interface SlideInOptions extends ScaleAnimOptions {
  sceneObject: SceneObject;
  slideFrom: vec3;
}

/**
 * Slides a SceneObject out from its rest position to `slideOffset` while
 * scaling to zero, then disables it and resets transform.
 */
export function slideOut(opts: SlideOutOptions): void {
  const transform = opts.sceneObject.getTransform();
  const restPos = vec3.zero();
  const fullScale = vec3.one();

  animate({
    duration: opts.duration,
    easing: opts.easing ?? "ease-in-cubic",
    cancelSet: opts.cancelSet,
    update: (t: number) => {
      if (isNull(opts.sceneObject)) return;
      transform.setLocalPosition(vec3.lerp(restPos, opts.slideOffset, t));
      transform.setLocalScale(vec3.lerp(fullScale, TINY_SCALE, t));
    },
    ended: () => {
      if (isNull(opts.sceneObject)) return;
      opts.sceneObject.enabled = false;
      transform.setLocalPosition(restPos);
      transform.setLocalScale(fullScale);
      opts.ended?.();
    },
  });
}

/**
 * Enables a SceneObject, positions it at `slideFrom` with zero scale,
 * and animates it to rest position with full scale.
 */
export function slideIn(opts: SlideInOptions): void {
  opts.sceneObject.enabled = true;
  const transform = opts.sceneObject.getTransform();
  const restPos = vec3.zero();
  const fullScale = vec3.one();

  transform.setLocalPosition(opts.slideFrom);
  transform.setLocalScale(TINY_SCALE);

  animate({
    duration: opts.duration,
    easing: opts.easing ?? "ease-out-cubic",
    cancelSet: opts.cancelSet,
    update: (t: number) => {
      if (isNull(opts.sceneObject)) return;
      transform.setLocalPosition(vec3.lerp(opts.slideFrom, restPos, t));
      transform.setLocalScale(vec3.lerp(TINY_SCALE, fullScale, t));
    },
    ended: () => {
      if (isNull(opts.sceneObject)) return;
      transform.setLocalPosition(restPos);
      transform.setLocalScale(fullScale);
      opts.ended?.();
    },
  });
}

/**
 * Scales a SceneObject from its current scale to TINY_SCALE, then
 * optionally disables it.
 */
export function scaleOut(
  sceneObject: SceneObject,
  opts: ScaleAnimOptions & { disable?: boolean },
): void {
  const transform = sceneObject.getTransform();
  const startScale = transform.getLocalScale();

  animate({
    duration: opts.duration,
    easing: opts.easing ?? "ease-in-cubic",
    cancelSet: opts.cancelSet,
    update: (t: number) => {
      if (isNull(sceneObject)) return;
      transform.setLocalScale(vec3.lerp(startScale, TINY_SCALE, t));
    },
    ended: () => {
      if (isNull(sceneObject)) return;
      transform.setLocalScale(TINY_SCALE);
      if (opts.disable !== false) {
        sceneObject.enabled = false;
      }
      opts.ended?.();
    },
  });
}

/**
 * Scales a SceneObject from TINY_SCALE to `targetScale`, optionally
 * enabling it first.
 */
export function scaleIn(
  sceneObject: SceneObject,
  targetScale: vec3,
  opts: ScaleAnimOptions & { enable?: boolean },
): void {
  const transform = sceneObject.getTransform();

  if (opts.enable !== false) {
    transform.setLocalScale(TINY_SCALE);
    sceneObject.enabled = true;
  }

  animate({
    duration: opts.duration,
    easing: opts.easing ?? "ease-out-cubic",
    cancelSet: opts.cancelSet,
    update: (t: number) => {
      if (isNull(sceneObject)) return;
      transform.setLocalScale(vec3.lerp(TINY_SCALE, targetScale, t));
    },
    ended: () => {
      if (isNull(sceneObject)) return;
      transform.setLocalScale(targetScale);
      opts.ended?.();
    },
  });
}

export interface SlideTransitionOptions {
  cancelSet: CancelSet;
  slideOffset: number;
  duration: number;
  staggerMs: number;
  beforeSlideIn?: () => void;
}

/**
 * Slides one SceneObject out while sliding another one in, with a
 * configurable stagger delay between the two halves.
 */
export function slideTransition(
  outObj: SceneObject,
  inObj: SceneObject,
  opts: SlideTransitionOptions,
): void {
  slideOut({
    sceneObject: outObj,
    slideOffset: new vec3(-opts.slideOffset, 0, 0),
    duration: opts.duration * 0.6,
    cancelSet: opts.cancelSet,
  });

  setTimeout(() => {
    opts.beforeSlideIn?.();
    slideIn({
      sceneObject: inObj,
      slideFrom: new vec3(opts.slideOffset, 0, 0),
      duration: opts.duration,
      cancelSet: opts.cancelSet,
    });
  }, opts.staggerMs);
}

export interface WipeOutOptions extends ScaleAnimOptions {
  sceneObject: SceneObject;
  slideOffset: number;
}

export interface WipeInOptions extends ScaleAnimOptions {
  sceneObject: SceneObject;
  slideFrom: number;
}

export interface WipeTransitionOptions {
  cancelSet: CancelSet;
  slideOffset: number;
  duration: number;
  staggerMs: number;
  direction: "forward" | "back";
  beforeWipeIn?: () => void;
  ended?: () => void;
}

/**
 * Recursively sets opacity on all RenderMeshVisual and Text components in
 * the subtree. Skips Image components (shared-material concern — fading one
 * would affect every icon using the same texture).
 *
 * NOTE: This directly overwrites alpha values. For transitions, prefer the
 * wipeOut/wipeIn functions which snapshot base alphas so hidden elements
 * (e.g. tooltips with opacityFactor=0) are not accidentally revealed.
 */
export function setSubtreeOpacity(obj: SceneObject, alpha: number): void {
  const rmv = obj.getComponent("RenderMeshVisual") as RenderMeshVisual | null;
  if (rmv) rmv.mainPass.opacityFactor = alpha;

  const text = obj.getComponent("Text") as Text | null;
  if (text) {
    const c = text.textFill.color;
    text.textFill.color = new vec4(c.r, c.g, c.b, alpha);
  }

  const count = obj.getChildrenCount();
  for (let i = 0; i < count; i++) {
    setSubtreeOpacity(obj.getChild(i), alpha);
  }
}

export interface OpacitySurface {
  rmv: RenderMeshVisual | null;
  text: Text | null;
  baseAlpha: number;
}

export function collectOpacitySurfaces(
  obj: SceneObject,
  out: OpacitySurface[],
): void {
  const rmv = obj.getComponent("RenderMeshVisual") as RenderMeshVisual | null;
  if (rmv && rmv.mainPass) out.push({ rmv, text: null, baseAlpha: rmv.mainPass.opacityFactor });

  const text = obj.getComponent("Text") as Text | null;
  if (text) out.push({ rmv: null, text, baseAlpha: text.textFill.color.w });

  for (let i = 0; i < obj.getChildrenCount(); i++) {
    collectOpacitySurfaces(obj.getChild(i), out);
  }
}

export function applyOpacityMultiplier(
  surfaces: OpacitySurface[],
  multiplier: number,
): void {
  for (const s of surfaces) {
    if (s.rmv && s.rmv.mainPass) {
      s.rmv.mainPass.opacityFactor = s.baseAlpha * multiplier;
    } else if (s.text) {
      const c = s.text.textFill.color;
      s.text.textFill.color = new vec4(c.r, c.g, c.b, s.baseAlpha * multiplier);
    }
  }
}

/**
 * Slides a SceneObject out in X while fading it out, then disables it
 * and restores all opacities to their pre-transition values.
 * Snapshots base alphas upfront so hidden elements (e.g. tooltips) stay
 * at zero throughout.
 */
export function wipeOut(opts: WipeOutOptions): void {
  const transform = opts.sceneObject.getTransform();
  const startPos = vec3.zero();
  const endPos = new vec3(opts.slideOffset, 0, 0);

  const surfaces: OpacitySurface[] = [];
  collectOpacitySurfaces(opts.sceneObject, surfaces);

  animate({
    duration: opts.duration,
    easing: opts.easing ?? "ease-in-cubic",
    cancelSet: opts.cancelSet,
    update: (t: number) => {
      if (isNull(opts.sceneObject)) return;
      transform.setLocalPosition(vec3.lerp(startPos, endPos, t));
      applyOpacityMultiplier(surfaces, 1 - t);
    },
    ended: () => {
      if (isNull(opts.sceneObject)) return;
      opts.sceneObject.enabled = false;
      transform.setLocalPosition(startPos);
      applyOpacityMultiplier(surfaces, 1); // restore base alphas
      opts.ended?.();
    },
  });
}

/**
 * Enables a SceneObject at an X offset, fades it in, and slides it to
 * its rest position. Snapshots base alphas upfront so hidden elements
 * (e.g. tooltips) are not accidentally revealed by the transition.
 */
export function wipeIn(opts: WipeInOptions): void {
  const transform = opts.sceneObject.getTransform();
  const startPos = new vec3(opts.slideFrom, 0, 0);
  const endPos = vec3.zero();

  const surfaces: OpacitySurface[] = [];
  collectOpacitySurfaces(opts.sceneObject, surfaces);
  applyOpacityMultiplier(surfaces, 0); // hide before enabling

  opts.sceneObject.enabled = true;
  transform.setLocalPosition(startPos);

  animate({
    duration: opts.duration,
    easing: opts.easing ?? "ease-out-cubic",
    cancelSet: opts.cancelSet,
    update: (t: number) => {
      if (isNull(opts.sceneObject)) return;
      transform.setLocalPosition(vec3.lerp(startPos, endPos, t));
      applyOpacityMultiplier(surfaces, t);
    },
    ended: () => {
      if (isNull(opts.sceneObject)) return;
      transform.setLocalPosition(endPos);
      applyOpacityMultiplier(surfaces, 1); // restore base alphas
      opts.ended?.();
    },
  });
}

/**
 * Horizontal page wipe: outgoing panel slides left/right while incoming
 * panel slides in from the opposite side. No scale change on either panel.
 * direction "forward" = out-left / in-from-right (drilling in)
 * direction "back"    = out-right / in-from-left (going back)
 */
export function wipeTransition(
  outObj: SceneObject,
  inObj: SceneObject,
  opts: WipeTransitionOptions,
): void {
  const outDir = opts.direction === "forward" ? -1 : 1;
  const inDir = opts.direction === "forward" ? 1 : -1;

  wipeOut({
    sceneObject: outObj,
    slideOffset: outDir * opts.slideOffset,
    duration: opts.duration * 0.6,
    cancelSet: opts.cancelSet,
    ended: () => {
      setTimeout(() => {
        opts.beforeWipeIn?.();
        wipeIn({
          sceneObject: inObj,
          slideFrom: inDir * opts.slideOffset,
          duration: opts.duration,
          cancelSet: opts.cancelSet,
          ended: () => opts.ended?.(),
        });
      }, opts.staggerMs);
    },
  });
}
