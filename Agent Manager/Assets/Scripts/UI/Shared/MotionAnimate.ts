import { CancelSet, easingFunctions } from "InteractionKit.lspkg/Utils/animate";
import { Motion } from "Motion.lspkg/Motion";
import { custom } from "Motion.lspkg/Channels";
import { back, power2, spec } from "Motion.lspkg/Eases";
import { EaseFn } from "Motion.lspkg/MotionTypes";

/**
 * Motion-backed drop-in for InteractionKit's `animate()`.
 *
 * Every animation runs through the Motion package's ticker and System 3.0
 * ease tokens instead of the legacy easing table:
 *   ease-out-*        -> spec.enter   (surfaces arriving)
 *   ease-in-*         -> spec.exit    (surfaces leaving)
 *   ease-in-out-*     -> spec.precise (controlled transitions)
 *   ease-out-back     -> back.out     (the one deliberate overshoot / pop)
 * Micro-interactions (< MICRO_THRESHOLD s: hovers, fades) use power2 so the
 * spec's slow-start bezier doesn't make them feel laggy.
 */

export type EasingName = keyof typeof easingFunctions;

export interface MotionAnimateConfig {
  duration: number;
  update: (t: number) => void;
  easing?: EasingName;
  cancelSet?: CancelSet;
  start?: number;
  end?: number;
  ended?: () => void;
  cancelled?: () => void;
}

const MICRO_THRESHOLD = 0.25;
const BACK_OUT = back().out;
const BACK_IN = back().in;

export function resolveEase(name: EasingName | undefined, duration: number): EaseFn {
  if (!name || name === "linear") return (t: number) => t;
  const micro = duration < MICRO_THRESHOLD;
  if (name.indexOf("back") >= 0) {
    return name.indexOf("ease-in-out") === 0
      ? spec.precise
      : name.indexOf("ease-in") === 0
        ? BACK_IN
        : BACK_OUT;
  }
  if (name.indexOf("ease-in-out") === 0) {
    return micro ? power2.inOut : spec.precise;
  }
  if (name.indexOf("ease-in") === 0) {
    return micro ? power2.in : spec.exit;
  }
  return micro ? power2.out : spec.enter;
}

interface Proxy {
  t: number;
}

export default function animate(config: MotionAnimateConfig): () => void {
  const from = config.start ?? 0;
  const to = config.end ?? 1;

  // Zero-length: jump to the end on the calling frame.
  if (config.duration <= 0) {
    config.update(to);
    config.ended?.();
    return () => {};
  }

  const proxy: Proxy = { t: from };
  const channel = custom<number>("uiAnim", () => ({
    read: () => proxy.t,
    write: (value: number) => {
      proxy.t = value;
      config.update(value);
    },
  }));

  let done = false;
  const tween = Motion.fromTo(proxy, {
    channel,
    from,
    value: to,
    duration: config.duration,
    ease: resolveEase(config.easing, config.duration),
    onFinish: () => {
      if (done) return;
      done = true;
      config.ended?.();
    },
  });

  const cancel = () => {
    if (done) return;
    done = true;
    tween.kill();
    config.cancelled?.();
  };
  config.cancelSet?.add(cancel);
  return cancel;
}

export { CancelSet, easingFunctions };
