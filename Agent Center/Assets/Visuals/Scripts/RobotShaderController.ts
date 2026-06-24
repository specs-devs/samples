import {
  ShaderRobotState,
  BASE_STATES,
  BASE_THEME_VALUES,
  LERP_SPEED_MULTIPLIER,
  LerpedShaderValues,
  createDefaultLerpedValues,
  lerpShaderValues,
  shaderValuesSettled,
  initMaterial,
} from "./RobotShaderCommon";

const HOVER_Y_OFFSET = 3.0;
const HOVER_SCALE = 1.25;
const EYE_PASS_COUNT = 8;

const EYE_SIZE_KEYS: string[] = [];
const LOOK_DIR_KEYS: string[] = [];
for (let i = 0; i < EYE_PASS_COUNT; i++) {
  EYE_SIZE_KEYS.push("u_eye_size[" + i + "]");
  LOOK_DIR_KEYS.push("u_look_dir[" + i + "]");
}

@component
export class RobotShaderController extends BaseScriptComponent {
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

  private values: LerpedShaderValues = createDefaultLerpedValues();
  private pressing: boolean = false;
  private _lookTarget: vec2 = new vec2(0, 0);
  private settled: boolean = false;

  private hovered: boolean = false;
  private manipulating: boolean = false;
  private curHoverY: number = 0;
  private curHoverScale: number = 1.0;
  private baseLocalPos: vec3 | null = null;
  private baseLocalScale: vec3 | null = null;
  private scratchLookVec4 = new vec4(0, 0, 0, 0);
  private scratchHoverLook = new vec2(0, 0);
  private readonly _scratchPos = new vec3(0, 0, 0);

  public get lookTarget(): vec2 {
    return this._lookTarget;
  }

  public set lookTarget(value: vec2) {
    this._lookTarget = value;
    this.settled = false;
  }

  onAwake() {
    this.rmv = this.getSceneObject().getComponent(
      "RenderMeshVisual",
    ) as RenderMeshVisual;
    const mat = initMaterial(this.rmv);
    if (!mat) {
      print(
        "Error: RobotShaderController needs a RenderMeshVisual with a Material.",
      );
      return;
    }
    this.targetMaterial = mat;
    const xform = this.getSceneObject().getTransform();
    this.baseLocalPos = xform.getLocalPosition();
    this.baseLocalScale = xform.getLocalScale();
    this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
  }

  getVisualTopWorldY(): number {
    const transform = this.getSceneObject().getTransform();
    return (
      transform.getWorldPosition().y +
      this.rmv.mesh.aabbMax.y * transform.getWorldScale().y
    );
  }

  getVisualBottomWorldY(): number {
    const transform = this.getSceneObject().getTransform();
    return (
      transform.getWorldPosition().y +
      this.rmv.mesh.aabbMin.y * transform.getWorldScale().y
    );
  }

  getVisualTopLocalY(): number {
    const transform = this.getSceneObject().getTransform();
    return (
      transform.getLocalPosition().y +
      this.rmv.mesh.aabbMax.y * transform.getLocalScale().y
    );
  }

  getVisualBottomLocalY(): number {
    const transform = this.getSceneObject().getTransform();
    return (
      transform.getLocalPosition().y +
      this.rmv.mesh.aabbMin.y * transform.getLocalScale().y
    );
  }

  getVisualRightLocalX(): number {
    const transform = this.getSceneObject().getTransform();
    return (
      transform.getLocalPosition().x +
      this.rmv.mesh.aabbMax.x * transform.getLocalScale().x
    );
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

  public setManipulating(manipulating: boolean): void {
    this.manipulating = manipulating;
    this.settled = false;
    if (!manipulating && this.baseLocalPos && this.baseLocalScale) {
      const xform = this.getSceneObject().getTransform();
      xform.setLocalPosition(this.baseLocalPos);
      xform.setLocalScale(this.baseLocalScale);
    }
  }

  public setRobotState(state: ShaderRobotState) {
    if (BASE_STATES[state] && this.currentState !== state) {
      this.currentState = state;
      this.settled = false;
    }
  }

  public setTheme(
    theme: "cat" | "owl" | "ghost" | "axolotl" | "crt" | "robot",
  ) {
    if (this.currentTheme !== theme) {
      this.currentTheme = theme;
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
    const target = BASE_STATES[this.currentState as ShaderRobotState];
    const lerpSpeed = LERP_SPEED_MULTIPLIER * dt;

    lerpShaderValues(
      this.values,
      target,
      lerpSpeed,
      this.hovered,
      this.pressing,
      this.currentState,
    );

    const targetLook = this.hovered
      ? this.scratchHoverLook
      : target.lookOverride
        ? target.lookOverride
        : this._lookTarget;
    this.values.look = vec2.lerp(this.values.look, targetLook, lerpSpeed);

    const raised = this.hovered;
    const targetHoverY = raised ? HOVER_Y_OFFSET : 0;
    const targetScale = raised ? HOVER_SCALE : 1.0;
    this.curHoverY = MathUtils.lerp(this.curHoverY, targetHoverY, lerpSpeed);
    this.curHoverScale = MathUtils.lerp(this.curHoverScale, targetScale, lerpSpeed);
    if (!this.manipulating && this.baseLocalPos && this.baseLocalScale) {
      const transform = this.getSceneObject().getTransform();
      this._scratchPos.x = this.baseLocalPos.x;
      this._scratchPos.y = this.baseLocalPos.y + this.curHoverY;
      this._scratchPos.z = this.baseLocalPos.z;
      transform.setLocalPosition(this._scratchPos);
      transform.setLocalScale(
        this.baseLocalScale.uniformScale(this.curHoverScale),
      );
    }

    this.scratchLookVec4.x = this.values.look.x;
    this.scratchLookVec4.y = this.values.look.y;
    for (let i = 0; i < EYE_PASS_COUNT; i++) {
      pass[EYE_SIZE_KEYS[i]] = this.values.eyeSize;
      pass[LOOK_DIR_KEYS[i]] = this.scratchLookVec4;
    }
    pass.u_eye_curve = this.values.eyeCurve;
    pass.u_antenna_color = this.values.antennaColor;
    pass.u_head_tilt = this.values.tilt;
    pass.u_pulse_speed = this.values.pulse;
    pass.u_listening_intensity = this.values.listening;
    pass.u_thinking_intensity = this.values.thinking;
    pass.u_tool_call_intensity = this.values.toolCall;
    pass.u_eye_brightness = this.values.eyeBright;
    pass.u_bob_intensity = this.values.bob;
    pass.u_sleep_intensity = this.values.sleep;
    pass.u_error_intensity = this.values.errorIntensity;
    pass.u_connecting_intensity = this.values.connecting;
    pass.u_awaiting_action_intensity = this.values.awaitingAction;
    pass.u_hover_intensity = this.values.hoverIntensity;
    pass.u_click_intensity = this.values.clickIntensity;
    pass.u_audio_level = 0.0;
    pass.u_theme = BASE_THEME_VALUES[this.currentTheme];

    if (
      shaderValuesSettled(this.values, target, targetLook, this.hovered, this.pressing, this.currentState) &&
      Math.abs(this.curHoverY - targetHoverY) < 0.001 &&
      Math.abs(this.curHoverScale - targetScale) < 0.001
    ) {
      this.settled = true;
    }
  }
}
