import {
  ShaderRobotState,
  ShaderRobotTheme,
  BASE_STATES,
  BASE_THEME_VALUES,
  LERP_SPEED_MULTIPLIER,
  LerpedShaderValues,
  createDefaultLerpedValues,
  lerpShaderValues,
  shaderValuesSettled,
  applyCommonPassValues,
  initMaterial,
} from "./RobotShaderCommon";

@component
export class RobotShaderController2D extends BaseScriptComponent {
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
  private hovered: boolean = false;
  private settled: boolean = false;
  private readonly _scratchLookVec4 = new vec4(0, 0, 0, 0);
  private readonly _defaultLook = new vec2(0, 0);

  onAwake() {
    this.rmv = this.getSceneObject().getComponent(
      "RenderMeshVisual",
    ) as RenderMeshVisual;
    const mat = initMaterial(this.rmv);
    if (!mat) {
      print(
        "Error: RobotShaderController2D needs a RenderMeshVisual with a Material.",
      );
      return;
    }
    this.targetMaterial = mat;
    this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
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
    const lerpSpeed = Math.min(LERP_SPEED_MULTIPLIER * dt, 1.0);

    lerpShaderValues(
      this.values,
      target,
      lerpSpeed,
      this.hovered,
      this.pressing,
      this.currentState,
    );

    pass["u_eye_size[0]"] = this.values.eyeSize;
    this._scratchLookVec4.x = this.values.look.x;
    this._scratchLookVec4.y = this.values.look.y;
    pass["u_look_dir[0]"] = this._scratchLookVec4;
    applyCommonPassValues(pass, this.values, BASE_THEME_VALUES[this.currentTheme]);

    const targetLook = target.lookOverride ?? this._defaultLook;
    if (shaderValuesSettled(this.values, target, targetLook, this.hovered, this.pressing, this.currentState)) {
      this.settled = true;
    }
  }
}
