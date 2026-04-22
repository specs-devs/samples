import {
  ShaderRobotState,
  ShaderRobotTheme,
  RobotStateParams,
  BASE_THEME_VALUES,
  LERP_SPEED_MULTIPLIER,
  LerpedShaderValues,
  createDefaultLerpedValues,
  lerpShaderValues,
  shaderValuesSettled,
  applyCommonPassValues,
  initMaterial,
} from "./RobotShaderCommon";

interface PixelStateParams extends RobotStateParams {
  faceColor: vec3;
}

const PIXEL_STATES: Record<ShaderRobotState, PixelStateParams> = {
  idle: {
    eyeSize: new vec2(0.04, 0.035),
    eyeCurve: 1.5,
    eyeBrightness: 1.0,
    antennaColor: new vec3(0.05, 0.05, 0.05),
    faceColor: new vec3(1.0, 0.6, 0.1),
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
    eyeCurve: 0.5,
    eyeBrightness: 1.3,
    antennaColor: new vec3(0.0, 1.0, 0.5),
    faceColor: new vec3(0.0, 1.0, 0.5),
    tilt: 0.2,
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
    eyeSize: new vec2(0.04, 0.015),
    eyeCurve: -2.0,
    eyeBrightness: 1.0,
    antennaColor: new vec3(0.7, 0.2, 1.0),
    faceColor: new vec3(0.7, 0.2, 1.0),
    tilt: -0.15,
    lookOverride: new vec2(0.4, -0.4),
    pulseSpeed: 8.0,
    bobIntensity: 1.0,
    listeningIntensity: 0.0,
    thinkingIntensity: 1.0,
    toolCallIntensity: 0.0,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  tool_call: {
    eyeSize: new vec2(0.12, 0.01),
    eyeCurve: 0.0,
    eyeBrightness: 1.5,
    antennaColor: new vec3(0.0, 0.3, 0.9),
    faceColor: new vec3(0.0, 0.3, 0.9),
    tilt: 0.0,
    lookOverride: new vec2(0.0, 0.0),
    pulseSpeed: 20.0,
    bobIntensity: 1.5,
    listeningIntensity: 0.0,
    thinkingIntensity: 0.0,
    toolCallIntensity: 1.0,
    sleepIntensity: 0.0,
    errorIntensity: 0.0,
    connectingIntensity: 0.0,
    awaitingActionIntensity: 0.0,
  },
  ignoring: {
    eyeSize: new vec2(0.04, 0.01),
    eyeCurve: -1.5,
    eyeBrightness: 1.0,
    antennaColor: new vec3(0.8, 0.1, 0.1),
    faceColor: new vec3(0.8, 0.1, 0.1),
    tilt: -0.4,
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
    antennaColor: new vec3(0.08, 0.12, 0.4),
    faceColor: new vec3(0.08, 0.12, 0.4),
    tilt: 0.1,
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
    faceColor: new vec3(1.0, 0.0, 0.0),
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
    faceColor: new vec3(0.05, 0.05, 0.05),
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
    faceColor: new vec3(0.0, 1.0, 0.8),
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
    faceColor: new vec3(1.0, 0.7, 0.1),
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

@component
export class RobotShaderController2DPixel extends BaseScriptComponent {
  private rmv: RenderMeshVisual;
  private targetMaterial: Material;

  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("IDLE", "idle"),
      new ComboBoxItem("LISTENING", "listening"),
      new ComboBoxItem("THINKING", "thinking"),
      new ComboBoxItem("TOOL_CALL", "tool_call"),
      new ComboBoxItem("IGNORING", "ignoring"),
      new ComboBoxItem("SLEEPING", "sleeping"),
      new ComboBoxItem("ERROR", "error"),
      new ComboBoxItem("DEACTIVATED", "deactivated"),
      new ComboBoxItem("CONNECTING", "connecting"),
      new ComboBoxItem("AWAITING_ACTION", "awaiting_action"),
    ]),
  )
  private currentState: string = "idle";

  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Cat", "cat"),
      new ComboBoxItem("Owl", "owl"),
      new ComboBoxItem("Ghost", "ghost"),
      new ComboBoxItem("Axolotl", "axolotl"),
      new ComboBoxItem("CRT TV", "crt"),
      new ComboBoxItem("Robot", "robot"),
    ]),
  )
  private currentTheme: string = "robot";

  private pixelSize: number = 128;
  private lineThickness: number = 1.0;

  private values: LerpedShaderValues = createDefaultLerpedValues();
  private curFaceColor: vec3 = PIXEL_STATES.idle.faceColor;
  private pressing: boolean = false;
  private hovered: boolean = false;
  private settled: boolean = false;
  private scratchLookVec4 = new vec4(0, 0, 0, 0);

  onAwake() {
    this.rmv = this.getSceneObject().getComponent(
      "RenderMeshVisual",
    ) as RenderMeshVisual;
    const mat = initMaterial(this.rmv);
    if (!mat) {
      print(
        "Error: RobotShaderController2DPixel needs a RenderMeshVisual with a Material.",
      );
      return;
    }
    this.targetMaterial = mat;
    this.applyImmediate();
    this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
  }

  private applyImmediate(): void {
    const pass = this.targetMaterial.mainPass;
    const target = PIXEL_STATES[this.currentState as ShaderRobotState];
    pass["u_eye_size[0]"] = target.eyeSize;
    pass["u_look_dir[0]"] = new vec4(0, 0, 0, 0);
    pass.u_face_color = target.faceColor;
    pass.u_pixel_size = this.pixelSize;
    pass.u_line_thickness = this.lineThickness;
    pass.u_eye_curve = target.eyeCurve;
    pass.u_antenna_color = target.antennaColor;
    pass.u_head_tilt = target.tilt;
    pass.u_pulse_speed = target.pulseSpeed;
    pass.u_listening_intensity = target.listeningIntensity;
    pass.u_thinking_intensity = target.thinkingIntensity;
    pass.u_tool_call_intensity = target.toolCallIntensity;
    pass.u_eye_brightness = target.eyeBrightness;
    pass.u_bob_intensity = target.bobIntensity;
    pass.u_sleep_intensity = target.sleepIntensity;
    pass.u_error_intensity = target.errorIntensity;
    pass.u_connecting_intensity = target.connectingIntensity;
    pass.u_awaiting_action_intensity = target.awaitingActionIntensity;
    pass.u_hover_intensity = 0.0;
    pass.u_click_intensity = 0.0;
    pass.u_audio_level = 0.0;
    pass.u_theme = BASE_THEME_VALUES[this.currentTheme];
    pass.iTime = getTime();
  }

  public setHovered(hovered: boolean): void {
    if (this.hovered !== hovered) {
      this.hovered = hovered;
      this.settled = false;
    }
  }

  public setSelected(_selected: boolean): void {
    // reserved for future use
  }

  public setPressing(pressing: boolean): void {
    if (this.pressing !== pressing) {
      this.pressing = pressing;
      this.settled = false;
    }
  }

  public setRobotState(state: ShaderRobotState) {
    if (PIXEL_STATES[state] && this.currentState !== state) {
      this.currentState = state;
      this.settled = false;
    }
  }

  public setTheme(theme: ShaderRobotTheme) {
    if (this.currentTheme !== theme) {
      this.currentTheme = theme;
      this.settled = false;
    }
  }

  public setPixelSize(size: number) {
    if (this.pixelSize !== size) {
      this.pixelSize = size;
      this.settled = false;
    }
  }

  public setLineThickness(thickness: number) {
    if (this.lineThickness !== thickness) {
      this.lineThickness = thickness;
      this.settled = false;
    }
  }

  private onUpdate() {
    if (!this.targetMaterial || isNull(this.targetMaterial)) return;
    const pass = this.targetMaterial.mainPass;
    if (!pass || isNull(pass)) return;

    pass.iTime = getTime();
    if (this.settled) return;

    const dt = getDeltaTime();
    const target = PIXEL_STATES[this.currentState as ShaderRobotState];
    const lerpSpeed = Math.min(LERP_SPEED_MULTIPLIER * dt, 1.0);

    lerpShaderValues(
      this.values,
      target,
      lerpSpeed,
      this.hovered,
      this.pressing,
      this.currentState,
    );

    this.curFaceColor = vec3.lerp(
      this.curFaceColor,
      target.faceColor,
      lerpSpeed,
    );

    pass["u_eye_size[0]"] = this.values.eyeSize;
    this.scratchLookVec4.x = this.values.look.x;
    this.scratchLookVec4.y = this.values.look.y;
    pass["u_look_dir[0]"] = this.scratchLookVec4;
    pass.u_face_color = this.curFaceColor;
    pass.u_pixel_size = this.pixelSize;
    pass.u_line_thickness = this.lineThickness;
    applyCommonPassValues(
      pass,
      this.values,
      BASE_THEME_VALUES[this.currentTheme],
    );

    const targetLook = target.lookOverride ?? vec2.zero();
    const faceSettled =
      Math.abs(this.curFaceColor.x - target.faceColor.x) < 0.001 &&
      Math.abs(this.curFaceColor.y - target.faceColor.y) < 0.001 &&
      Math.abs(this.curFaceColor.z - target.faceColor.z) < 0.001;
    if (
      faceSettled &&
      shaderValuesSettled(
        this.values,
        target,
        targetLook,
        this.hovered,
        this.pressing,
        this.currentState,
      )
    ) {
      this.settled = true;
    }
  }
}
