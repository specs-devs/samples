export type ShaderRobotState =
  | "idle"
  | "listening"
  | "thinking"
  | "tool_call"
  | "ignoring"
  | "sleeping"
  | "error"
  | "deactivated"
  | "connecting"
  | "awaiting_action";

export type ShaderRobotTheme =
  | "cat"
  | "owl"
  | "ghost"
  | "axolotl"
  | "crt"
  | "robot";

export interface RobotStateParams {
  eyeSize: vec2;
  eyeCurve: number;
  eyeBrightness: number;
  antennaColor: vec3;
  tilt: number;
  lookOverride: vec2 | null;
  pulseSpeed: number;
  bobIntensity: number;
  listeningIntensity: number;
  thinkingIntensity: number;
  toolCallIntensity: number;
  sleepIntensity: number;
  errorIntensity: number;
  connectingIntensity: number;
  awaitingActionIntensity: number;
}

export const LERP_SPEED_MULTIPLIER = 10.0;
const VEC2_ZERO = new vec2(0, 0);

export const BASE_THEME_VALUES: Record<string, number> = {
  cat: 0,
  owl: 1,
  ghost: 2,
  axolotl: 3,
  crt: 4,
  robot: 5,
};

export const BASE_STATES: Record<ShaderRobotState, RobotStateParams> = {
  idle: {
    eyeSize: new vec2(0.035, 0.035),
    eyeCurve: 1.5,
    eyeBrightness: 1.0,
    antennaColor: new vec3(0.3, 0.5, 0.8),
    tilt: 0.0,
    lookOverride: null,
    pulseSpeed: 0.0,
    bobIntensity: 1.0,
    listeningIntensity: 0.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 0.0,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  listening: {
    eyeSize: new vec2(0.045, 0.045),
    eyeCurve: 2.5,
    eyeBrightness: 1.0,
    antennaColor: new vec3(0.0, 1.0, 0.6),
    tilt: 0.15,
    lookOverride: null,
    pulseSpeed: 5.0,
    bobIntensity: 1.0,
    listeningIntensity: 1.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 0.0,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  thinking: {
    eyeSize: new vec2(0.045, 0.015),
    eyeCurve: -4.0,
    eyeBrightness: 1.0,
    antennaColor: new vec3(1.0, 0.5, 0.1),
    tilt: -0.1,
    lookOverride: new vec2(0.4, -0.4),
    pulseSpeed: 8.0,
    bobIntensity: 1.0,
    listeningIntensity: 0.0,
    thinkingIntensity: 1.0,
    toolCallIntensity: 0.5,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  tool_call: {
    eyeSize: new vec2(0.12, 0.008),
    eyeCurve: 0.0,
    eyeBrightness: 1.0,
    antennaColor: new vec3(0.0, 0.8, 1.0),
    tilt: 0.0,
    lookOverride: new vec2(0.0, 0.0),
    pulseSpeed: 20.0,
    bobIntensity: 1.0,
    listeningIntensity: 0.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 1.0,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  ignoring: {
    eyeSize: new vec2(0.03, 0.012),
    eyeCurve: -1.5,
    eyeBrightness: 1.0,
    antennaColor: new vec3(0.8, 0.1, 0.1),
    tilt: -0.3,
    lookOverride: new vec2(-0.7, 0.3),
    pulseSpeed: 0.0,
    bobIntensity: 1.0,
    listeningIntensity: 0.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 0.0,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  sleeping: {
    eyeSize: new vec2(0.035, 0.002),
    eyeCurve: -1.5,
    eyeBrightness: 0.2,
    antennaColor: new vec3(0.1, 0.2, 0.6),
    tilt: 0.05,
    lookOverride: new vec2(0.0, 0.3),
    pulseSpeed: 1.5,
    bobIntensity: 0.3,
    listeningIntensity: 0.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 0.0,
    sleepIntensity: 1.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  error: {
    eyeSize: new vec2(0.0, 0.0),
    eyeCurve: 0.0,
    eyeBrightness: 1.0,
    antennaColor: new vec3(1.0, 0.0, 0.0),
    tilt: 0.35,
    lookOverride: new vec2(0.1, -0.6),
    pulseSpeed: 0.0,
    bobIntensity: 0.0,
    listeningIntensity: 0.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 0.0,
    sleepIntensity: 0.0,
    errorIntensity: 1.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  deactivated: {
    eyeSize: new vec2(0.0, 0.0),
    eyeCurve: 0.0,
    eyeBrightness: 0.0,
    antennaColor: new vec3(0.05, 0.05, 0.05),
    tilt: 0.0,
    lookOverride: new vec2(0.0, 0.8),
    pulseSpeed: 0.0,
    bobIntensity: 0.0,
    listeningIntensity: 0.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 0.0,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  connecting: {
    eyeSize: new vec2(0.035, 0.002),
    eyeCurve: -1.5,
    eyeBrightness: 0.2,
    antennaColor: new vec3(0.0, 1.0, 0.8),
    tilt: 0.5,
    lookOverride: new vec2(0.0, 0.0),
    pulseSpeed: 12.0,
    bobIntensity: 0.5,
    listeningIntensity: 0.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 0.0,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 1.0,
    awaitingActionIntensity: 0.0,
  },
  awaiting_action: {
    eyeSize: new vec2(0.045, 0.025),
    eyeCurve: -3.0,
    eyeBrightness: 1.0,
    antennaColor: new vec3(1.0, 0.7, 0.1),
    tilt: 0.2,
    lookOverride: new vec2(0.3, -0.2),
    pulseSpeed: 3.0,
    bobIntensity: 1.0,
    listeningIntensity: 0.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 0.0,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 1.0,
  },
};

export interface LerpedShaderValues {
  eyeSize: vec2;
  eyeCurve: number;
  antennaColor: vec3;
  tilt: number;
  pulse: number;
  look: vec2;
  listening: number;
  thinking: number;
  toolCall: number;
  eyeBright: number;
  bob: number;
  sleep: number;
  errorIntensity: number;
  connecting: number;
  awaitingAction: number;
  hoverIntensity: number;
  clickIntensity: number;
}

export function createDefaultLerpedValues(): LerpedShaderValues {
  return {
    eyeSize: new vec2(0.035, 0.035),
    eyeCurve: 1.5,
    antennaColor: new vec3(0.3, 0.5, 0.8),
    tilt: 0,
    pulse: 0,
    look: new vec2(0, 0),
    listening: 0.0,
    thinking: 0.0,
    toolCall: 0.0,
    eyeBright: 1.0,
    bob: 1.0,
    sleep: 0.0,
    errorIntensity: 0.0,
    connecting: 0.0,
    awaitingAction: 0.0,
    hoverIntensity: 0.0,
    clickIntensity: 0.0,
  };
}

export function lerpShaderValues(
  current: LerpedShaderValues,
  target: RobotStateParams,
  lerpSpeed: number,
  hovered: boolean,
  pressing: boolean,
  currentState: string,
): void {
  current.eyeSize = vec2.lerp(current.eyeSize, target.eyeSize, lerpSpeed);
  current.eyeCurve = MathUtils.lerp(
    current.eyeCurve,
    target.eyeCurve,
    lerpSpeed,
  );
  current.antennaColor = vec3.lerp(
    current.antennaColor,
    target.antennaColor,
    lerpSpeed,
  );
  current.tilt = MathUtils.lerp(current.tilt, target.tilt, lerpSpeed);
  current.pulse = MathUtils.lerp(current.pulse, target.pulseSpeed, lerpSpeed);
  current.listening = MathUtils.lerp(
    current.listening,
    target.listeningIntensity,
    lerpSpeed,
  );
  current.thinking = MathUtils.lerp(
    current.thinking,
    target.thinkingIntensity,
    lerpSpeed,
  );
  current.toolCall = MathUtils.lerp(
    current.toolCall,
    target.toolCallIntensity,
    lerpSpeed,
  );
  current.eyeBright = MathUtils.lerp(
    current.eyeBright,
    target.eyeBrightness,
    lerpSpeed,
  );
  current.bob = MathUtils.lerp(current.bob, target.bobIntensity, lerpSpeed);
  current.sleep = MathUtils.lerp(
    current.sleep,
    target.sleepIntensity,
    lerpSpeed,
  );
  current.errorIntensity = MathUtils.lerp(
    current.errorIntensity,
    target.errorIntensity,
    lerpSpeed,
  );
  current.connecting = MathUtils.lerp(
    current.connecting,
    target.connectingIntensity,
    lerpSpeed,
  );
  current.awaitingAction = MathUtils.lerp(
    current.awaitingAction,
    target.awaitingActionIntensity,
    lerpSpeed,
  );

  const noInteract = currentState === "deactivated" || currentState === "error";
  const targetHover = hovered && !noInteract ? 1.0 : 0.0;
  const targetClick = pressing && !noInteract ? 1.0 : 0.0;
  current.hoverIntensity = MathUtils.lerp(
    current.hoverIntensity,
    targetHover,
    lerpSpeed,
  );
  current.clickIntensity = MathUtils.lerp(
    current.clickIntensity,
    targetClick,
    lerpSpeed,
  );

  const targetLook = target.lookOverride ?? VEC2_ZERO;
  current.look = vec2.lerp(current.look, targetLook, lerpSpeed);
}

const SETTLE_THRESHOLD = 0.001;

export function shaderValuesSettled(
  current: LerpedShaderValues,
  target: RobotStateParams,
  targetLook: vec2,
  hovered: boolean,
  pressing: boolean,
  currentState: string,
): boolean {
  const noInteract = currentState === "deactivated" || currentState === "error";
  const targetHover = hovered && !noInteract ? 1.0 : 0.0;
  const targetClick = pressing && !noInteract ? 1.0 : 0.0;

  return (
    Math.abs(current.eyeSize.x - target.eyeSize.x) < SETTLE_THRESHOLD &&
    Math.abs(current.eyeSize.y - target.eyeSize.y) < SETTLE_THRESHOLD &&
    Math.abs(current.eyeCurve - target.eyeCurve) < SETTLE_THRESHOLD &&
    Math.abs(current.antennaColor.x - target.antennaColor.x) <
      SETTLE_THRESHOLD &&
    Math.abs(current.antennaColor.y - target.antennaColor.y) <
      SETTLE_THRESHOLD &&
    Math.abs(current.antennaColor.z - target.antennaColor.z) <
      SETTLE_THRESHOLD &&
    Math.abs(current.tilt - target.tilt) < SETTLE_THRESHOLD &&
    Math.abs(current.pulse - target.pulseSpeed) < SETTLE_THRESHOLD &&
    Math.abs(current.listening - target.listeningIntensity) <
      SETTLE_THRESHOLD &&
    Math.abs(current.thinking - target.thinkingIntensity) < SETTLE_THRESHOLD &&
    Math.abs(current.toolCall - target.toolCallIntensity) < SETTLE_THRESHOLD &&
    Math.abs(current.eyeBright - target.eyeBrightness) < SETTLE_THRESHOLD &&
    Math.abs(current.bob - target.bobIntensity) < SETTLE_THRESHOLD &&
    Math.abs(current.sleep - target.sleepIntensity) < SETTLE_THRESHOLD &&
    Math.abs(current.errorIntensity - target.errorIntensity) <
      SETTLE_THRESHOLD &&
    Math.abs(current.connecting - target.connectingIntensity) <
      SETTLE_THRESHOLD &&
    Math.abs(current.awaitingAction - target.awaitingActionIntensity) <
      SETTLE_THRESHOLD &&
    Math.abs(current.hoverIntensity - targetHover) < SETTLE_THRESHOLD &&
    Math.abs(current.clickIntensity - targetClick) < SETTLE_THRESHOLD &&
    Math.abs(current.look.x - targetLook.x) < SETTLE_THRESHOLD &&
    Math.abs(current.look.y - targetLook.y) < SETTLE_THRESHOLD
  );
}

export function applyCommonPassValues(
  pass: Pass,
  values: LerpedShaderValues,
  themeValue: number,
): void {
  pass.u_eye_curve = values.eyeCurve;
  pass.u_antenna_color = values.antennaColor;
  pass.u_head_tilt = values.tilt;
  pass.u_pulse_speed = values.pulse;
  pass.u_listening_intensity = values.listening;
  pass.u_thinking_intensity = values.thinking;
  pass.u_tool_call_intensity = values.toolCall;
  pass.u_eye_brightness = values.eyeBright;
  pass.u_bob_intensity = values.bob;
  pass.u_sleep_intensity = values.sleep;
  pass.u_error_intensity = values.errorIntensity;
  pass.u_connecting_intensity = values.connecting;
  pass.u_awaiting_action_intensity = values.awaitingAction;
  pass.u_hover_intensity = values.hoverIntensity;
  pass.u_click_intensity = values.clickIntensity;
  pass.u_audio_level = 0.0;
  pass.u_theme = themeValue;
}

export function initMaterial(rmv: RenderMeshVisual): Material | null {
  if (!rmv || !rmv.mainMaterial) return null;
  const mat = rmv.mainMaterial.clone();
  rmv.clearMaterials();
  rmv.mainMaterial = mat;
  return mat;
}
