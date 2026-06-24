import {
  ShaderRobotState,
  BASE_STATES,
  BASE_THEME_VALUES,
  LERP_SPEED_MULTIPLIER,
  LerpedShaderValues,
  createDefaultLerpedValues,
  lerpShaderValues,
  shaderValuesSettled,
} from "./RobotShaderCommon";
const HOVER_Y_OFFSET = 1.0;
const HOVER_SCALE = 1.25;
const ZOOM_OUT_SCALE = 0.7;

const STATE_INDICES: Record<string, number> = {
  idle: 0, listening: 1, thinking: 2, tool_call: 3, ignoring: 4,
  sleeping: 5, error: 6, deactivated: 7, connecting: 8, awaiting_action: 9,
};

const THEME_SCENE_NAMES: Record<string, string> = {
  cat: "Cat",
  owl: "Owl",
  ghost: "Ghost",
  axolotl: "Axolotl",
  crt: "CRT",
  robot: "Robot",
};

const FACE_OBJECT_NAMES: Record<string, string> = {
  CRT: "Screen_CRT",
};

const OVERLAY_GAP = 0.25;
const WIFI_BASE_Y = 0.95;
const OVERLAY_DEPTH_CENTER = -0.25;
const QM_VERTICAL_DOWN = 0.15;

const THEME_EXTRA_GAP: Record<string, number> = {
  robot: 0.3,
};

const ANTENNA_BALL_NAMES: Record<string, string[]> = {
  Cat: ["Bell_Cat"],
  Owl: ["Beak_Owl"],
  Ghost: ["Mouth_Ghost"],
  Axolotl: ["Belly_Axolotl"],
  CRT: ["AntennaTip_R_CRT", "AntennaTip_L_CRT"],
  Robot: ["AntennaBall_Robot"],
};

const faceMat = requireAsset("../Materials/Face.mat") as Material;
const antennaBallMat = requireAsset("../Materials/AntennaTop.mat") as Material;
const overlayMat = requireAsset("../Materials/StateOverlay.mat") as Material;

interface ThemeData {
  root: SceneObject;
  bodyObject: SceneObject;
  bodyRmv: RenderMeshVisual;
  bodyPass: Pass | null;
  facePass: Pass | null;
  antennaBallPasses: Pass[];
  childPasses: Pass[];
  gillsRoot: SceneObject | null;
}

function glslSmoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

@component
export class RobotMeshController extends BaseScriptComponent {
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

  @input
  private pinched: boolean = false;

  private themes: Record<string, ThemeData> = {};
  private active: ThemeData | null = null;

  private wifiRoot: SceneObject | null = null;
  private wifiParts: SceneObject[] = [];
  private questionMarkRoot: SceneObject | null = null;
  private questionMarkParts: SceneObject[] = [];
  private waveBarsRoot: SceneObject | null = null;
  private waveBarParts: SceneObject[] = [];
  private clickRingsRoot: SceneObject | null = null;
  private clickRingParts: SceneObject[] = [];
  private sleepZsRoot: SceneObject | null = null;
  private sleepZParts: SceneObject[] = [];
  private wifiPasses: Pass[] = [];
  private qmPasses: Pass[] = [];
  private wavePasses: Pass[] = [];
  private clickRingPasses: Pass[] = [];
  private sleepZPasses: Pass[] = [];

  private values: LerpedShaderValues = createDefaultLerpedValues();
  private pressing: boolean = false;
  private _lookTarget: vec2 = new vec2(0, 0);
  private settled: boolean = false;

  private hovered: boolean = false;
  private manipulating: boolean = false;
  private curHoverY: number = 0;
  private curHoverScale: number = 1.0;
  private curZoomOutScale: number = 1.0;
  private _hoverOffset: number = 0;
  private baseLocalPos: vec3 | null = null;
  private baseLocalScale: vec3 | null = null;
  private scratchLookVec4 = new vec4(0, 0, 0, 0);
  private scratchHoverLook = new vec2(0, 0);
  private scratchPos = new vec3(0, 0, 0);
  private scratchScale = new vec3(0, 0, 0);
  private scratchQuat = quat.fromEulerAngles(0, 0, 0);
  private allOverlayPasses: Pass[] = [];
  private overlayBaseIrid: number[] = [];
  private cachedTargetZoomScale: number = 1.0;

  private themeDirty: boolean = true;
  private curStateIndex: number = 0;
  private prevStateIndex: number = 0;
  private stateChangeTime: number = -1000;
  private blendT: number = 1.0;

  public get lookTarget(): vec2 {
    return this._lookTarget;
  }

  public set lookTarget(value: vec2) {
    this._lookTarget = value;
    this.settled = false;
  }

  onAwake() {
    const root = this.getSceneObject();

    const rotCorrector = global.scene.createSceneObject("rotCorrector");
    rotCorrector.setParent(root);
    rotCorrector
      .getTransform()
      .setLocalRotation(quat.fromEulerAngles(Math.PI / 2, 0, 0));

    const children: SceneObject[] = [];
    const childCount = root.getChildrenCount();
    for (let i = 0; i < childCount; i++) {
      const child = root.getChild(i);
      if (child !== rotCorrector) children.push(child);
    }
    for (let i = 0; i < children.length; i++) {
      children[i].setParent(rotCorrector);
    }

    this.discoverThemes(rotCorrector);
    this.discoverOverlays(rotCorrector);
    this.activateTheme(this.currentTheme);

    this.baseLocalPos = root.getTransform().getLocalPosition();
    this.baseLocalScale = root.getTransform().getLocalScale();

    this.createEvent("UpdateEvent").bind(this.onUpdate.bind(this));
  }

  private findChildByName(
    parent: SceneObject,
    name: string,
  ): SceneObject | null {
    const count = parent.getChildrenCount();
    for (let i = 0; i < count; i++) {
      const child = parent.getChild(i);
      if (child.name === name) return child;
    }
    return null;
  }

  private findDescendantByName(
    parent: SceneObject,
    name: string,
  ): SceneObject | null {
    const count = parent.getChildrenCount();
    for (let i = 0; i < count; i++) {
      const child = parent.getChild(i);
      if (child.name === name) return child;
      const found = this.findDescendantByName(child, name);
      if (found) return found;
    }
    return null;
  }

  private findChildrenByNames(
    parent: SceneObject,
    names: string[],
  ): SceneObject[] {
    const result: SceneObject[] = [];
    for (let ni = 0; ni < names.length; ni++) {
      const found = this.findDescendantByName(parent, names[ni]);
      if (found) result.push(found);
    }
    return result;
  }

  private discoverThemes(root: SceneObject): void {
    const themeKeys = Object.keys(THEME_SCENE_NAMES);
    for (let ti = 0; ti < themeKeys.length; ti++) {
      const themeKey = themeKeys[ti];
      const sceneName = THEME_SCENE_NAMES[themeKey];

      const themeRoot = this.findChildByName(root, "Theme_" + sceneName);
      if (!themeRoot) continue;

      themeRoot.getTransform().setLocalPosition(new vec3(0, 0, 0));

      const bodyObject = this.findChildByName(themeRoot, "Body_" + sceneName);
      if (!bodyObject) continue;

      const bodyRmv = bodyObject.getComponent(
        "RenderMeshVisual",
      ) as RenderMeshVisual;
      if (!bodyRmv) continue;

      const bodyPass = this.assignMaterial(bodyRmv, faceMat);
      this.initSurfacePassDefaults(bodyPass);

      let facePass: Pass | null = null;
      const faceObjName = FACE_OBJECT_NAMES[sceneName];
      const faceObject = faceObjName
        ? this.findDescendantByName(themeRoot, faceObjName)
        : null;
      if (faceObject) {
        const faceRmv = faceObject.getComponent(
          "RenderMeshVisual",
        ) as RenderMeshVisual;
        if (faceRmv) {
          facePass = this.assignMaterial(faceRmv, faceMat);
          this.initSurfacePassDefaults(facePass);
        }
      }

      const antennaBallPasses: Pass[] = [];
      const skipIds = new Set<string>();
      if (faceObject) skipIds.add(faceObject.uniqueIdentifier);

      const abNames = ANTENNA_BALL_NAMES[sceneName];
      if (abNames) {
        for (let ai = 0; ai < abNames.length; ai++) {
          const abObj = this.findDescendantByName(themeRoot, abNames[ai]);
          if (abObj) {
            skipIds.add(abObj.uniqueIdentifier);
            const abRmv = abObj.getComponent(
              "RenderMeshVisual",
            ) as RenderMeshVisual;
            if (abRmv) {
              antennaBallPasses.push(
                this.assignMaterial(abRmv, antennaBallMat),
              );
            }
          }
        }
      }

      let gillsRoot: SceneObject | null = null;
      if (themeKey === "axolotl") {
        gillsRoot = this.findDescendantByName(themeRoot, "Gills_Axolotl");
      }

      const childPasses: Pass[] = [];
      this.collectChildPasses(bodyObject, skipIds, childPasses, faceMat);

      this.themes[themeKey] = {
        root: themeRoot,
        bodyObject,
        bodyRmv,
        bodyPass,
        facePass,
        antennaBallPasses,
        childPasses,
        gillsRoot,
      };
    }
  }

  private discoverOverlays(root: SceneObject): void {
    const overlaysRoot = this.findChildByName(root, "State_Overlays");
    if (!overlaysRoot) return;

    overlaysRoot.getTransform().setLocalPosition(new vec3(0, 0, 0));

    this.wifiRoot = this.findChildByName(overlaysRoot, "WiFi");
    if (this.wifiRoot) {
      const wifiNames = ["WiFi_Dot", "WiFi_Arc_Inner", "WiFi_Arc_Outer"];
      this.wifiParts = this.findChildrenByNames(this.wifiRoot, wifiNames);
      this.wifiPasses = this.collectNamedPasses(this.wifiRoot, wifiNames);
      this.initOverlayPassDefaultsBatch(this.wifiPasses, 0.3, 4.0, 1.4, 2.0);
    }

    this.questionMarkRoot = this.findChildByName(overlaysRoot, "QuestionMark");
    if (this.questionMarkRoot) {
      const qmNames = ["QM_Dot", "QM_Stem", "QM_Hook"];
      this.questionMarkParts = this.findChildrenByNames(
        this.questionMarkRoot,
        qmNames,
      );
      this.qmPasses = this.collectNamedPasses(this.questionMarkRoot, qmNames);
      this.initOverlayPassDefaultsBatch(this.qmPasses, 0.3, 4.0, 1.4, 2.0);
    }

    this.waveBarsRoot = this.findChildByName(overlaysRoot, "WaveBars");
    if (this.waveBarsRoot) {
      const waveBarNames = ["WaveBar_0", "WaveBar_1", "WaveBar_2", "WaveBar_3"];
      this.waveBarParts = this.findChildrenByNames(
        this.waveBarsRoot,
        waveBarNames,
      );
      this.wavePasses = this.collectNamedPasses(
        this.waveBarsRoot,
        waveBarNames,
      );
      this.initOverlayPassDefaultsBatch(this.wavePasses, 0.2, 2.5, 1.2, 1.5);
    }

    this.clickRingsRoot = this.findChildByName(overlaysRoot, "ClickRings");
    if (this.clickRingsRoot) {
      const clickRingNames = ["ClickRing_1", "ClickRing_2", "ClickRing_3"];
      this.clickRingParts = this.findChildrenByNames(
        this.clickRingsRoot,
        clickRingNames,
      );
      this.clickRingPasses = this.collectNamedPasses(
        this.clickRingsRoot,
        clickRingNames,
      );
      this.initOverlayPassDefaultsBatch(
        this.clickRingPasses,
        0.25,
        3.5,
        1.6,
        1.8,
      );
    }

    this.sleepZsRoot = this.findChildByName(overlaysRoot, "SleepZs");
    if (this.sleepZsRoot) {
      const sleepZNames = ["SleepZ_0", "SleepZ_1", "SleepZ_2"];
      this.sleepZParts = this.findChildrenByNames(
        this.sleepZsRoot,
        sleepZNames,
      );
      this.sleepZPasses = this.collectNamedPasses(
        this.sleepZsRoot,
        sleepZNames,
      );
      this.initOverlayPassDefaultsBatch(this.sleepZPasses, 0.1, 2.0, 1.0, 1.0);
    }

    this.allOverlayPasses = ([] as Pass[]).concat(
      this.wifiPasses,
      this.qmPasses,
      this.wavePasses,
      this.clickRingPasses,
      this.sleepZPasses,
    );

    this.overlayBaseIrid = [];
    const iridMap: [Pass[], number][] = [
      [this.wifiPasses, 3.0],
      [this.qmPasses, 3.0],
      [this.wavePasses, 2.0],
      [this.clickRingPasses, 2.5],
      [this.sleepZPasses, 1.5],
    ];
    for (let g = 0; g < iridMap.length; g++) {
      const [passes, baseIrid] = iridMap[g];
      for (let i = 0; i < passes.length; i++) {
        this.overlayBaseIrid.push(baseIrid);
      }
    }
  }

  private collectNamedPasses(parent: SceneObject, names: string[]): Pass[] {
    const result: Pass[] = [];
    for (let i = 0; i < names.length; i++) {
      const obj = this.findDescendantByName(parent, names[i]);
      if (!obj) continue;
      const rmv = obj.getComponent("RenderMeshVisual") as RenderMeshVisual;
      if (rmv) {
        result.push(this.assignMaterial(rmv, overlayMat));
      }
    }
    return result;
  }

  private activateTheme(theme: string): void {
    const keys = Object.keys(this.themes);
    for (let i = 0; i < keys.length; i++) {
      this.themes[keys[i]].root.enabled = keys[i] === theme;
    }
    this.active = this.themes[theme] || null;
    this.settled = false;
    this.positionOverlaysForTheme();
  }

  private positionOverlaysForTheme(): void {
    if (!this.active) return;
    const themeTop = this.findMaxMeshTopY(this.active.bodyObject, 0);
    const extraGap = THEME_EXTRA_GAP[this.currentTheme] ?? 0;
    const offset = themeTop + OVERLAY_GAP + extraGap - WIFI_BASE_Y;
    if (this.wifiRoot) {
      this.wifiRoot
        .getTransform()
        .setLocalPosition(new vec3(0, OVERLAY_DEPTH_CENTER, -offset));
    }
    if (this.questionMarkRoot) {
      this.questionMarkRoot
        .getTransform()
        .setLocalPosition(new vec3(0, OVERLAY_DEPTH_CENTER, -offset - QM_VERTICAL_DOWN));
    }
  }

  private findMaxMeshTopY(obj: SceneObject, accumulatedY: number): number {
    const localY = accumulatedY + obj.getTransform().getLocalPosition().y;
    let maxY = -Infinity;
    const rmv = obj.getComponent("RenderMeshVisual") as RenderMeshVisual;
    if (rmv) {
      maxY = localY + rmv.mesh.aabbMax.y;
    }
    const count = obj.getChildrenCount();
    for (let i = 0; i < count; i++) {
      maxY = Math.max(maxY, this.findMaxMeshTopY(obj.getChild(i), localY));
    }
    return maxY;
  }

  private assignMaterial(rmv: RenderMeshVisual, source: Material): Pass {
    const cloned = source.clone();
    rmv.clearMaterials();
    rmv.addMaterial(cloned);
    return cloned.mainPass;
  }

  private initSurfacePassDefaults(pass: Pass): void {
    pass.u_outline_width = 1;
    pass.u_outline_brightness = 1.0;
    pass.u_core_glow_strength = 0.15;
    pass.u_edge_white = 3.0;
    pass.u_irid_brightness = 2.0;
    pass.u_irid_speed = 0.05;
    pass.u_state = 0;
    pass.u_prev_state = 0;
    pass.u_blend_t = 1.0;
    pass.u_hover_intensity = 0.0;
    pass.u_click_intensity = 0.0;
  }

  private initOverlayPassDefaults(
    pass: Pass,
    coreGlow: number,
    edgeWhite: number,
    outlineWidth: number,
    outlineBrightness: number,
  ): void {
    pass.u_core_glow_strength = coreGlow;
    pass.u_edge_white = edgeWhite;
    pass.u_outline_width = outlineWidth;
    pass.u_outline_brightness = outlineBrightness;
    pass.u_fill = 1.0;
  }

  private initOverlayPassDefaultsBatch(
    passes: Pass[],
    coreGlow: number,
    edgeWhite: number,
    outlineWidth: number,
    outlineBrightness: number,
  ): void {
    for (let i = 0; i < passes.length; i++) {
      this.initOverlayPassDefaults(
        passes[i],
        coreGlow,
        edgeWhite,
        outlineWidth,
        outlineBrightness,
      );
    }
  }

  private collectChildPasses(
    obj: SceneObject,
    skip: Set<string>,
    out: Pass[],
    material: Material,
  ): void {
    const count = obj.getChildrenCount();
    for (let i = 0; i < count; i++) {
      const child = obj.getChild(i);
      if (skip.has(child.uniqueIdentifier)) continue;

      const rmv = child.getComponent("RenderMeshVisual") as RenderMeshVisual;
      if (rmv) {
        const pass = this.assignMaterial(rmv, material);
        this.initSurfacePassDefaults(pass);
        out.push(pass);
      }
      this.collectChildPasses(child, skip, out, material);
    }
  }

  getVisualTopWorldY(): number {
    if (!this.active) return 0;
    const transform = this.active.bodyObject.getTransform();
    return (
      transform.getWorldPosition().y +
      this.active.bodyRmv.mesh.aabbMax.y * transform.getWorldScale().y
    );
  }

  getVisualBottomWorldY(): number {
    if (!this.active) return 0;
    const transform = this.active.bodyObject.getTransform();
    return (
      transform.getWorldPosition().y +
      this.active.bodyRmv.mesh.aabbMin.y * transform.getWorldScale().y
    );
  }

  getVisualTopLocalY(): number {
    if (!this.active) return 0;
    const transform = this.active.bodyObject.getTransform();
    return (
      transform.getLocalPosition().y +
      this.active.bodyRmv.mesh.aabbMax.y * transform.getLocalScale().y
    );
  }

  getVisualBottomLocalY(): number {
    if (!this.active) return 0;
    const transform = this.active.bodyObject.getTransform();
    return (
      transform.getLocalPosition().y +
      this.active.bodyRmv.mesh.aabbMin.y * transform.getLocalScale().y
    );
  }

  getVisualRightLocalX(): number {
    if (!this.active) return 0;
    const transform = this.active.bodyObject.getTransform();
    return (
      transform.getLocalPosition().x +
      this.active.bodyRmv.mesh.aabbMax.x * transform.getLocalScale().x
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
      this.prevStateIndex = this.curStateIndex;
      this.curStateIndex = STATE_INDICES[state] ?? 0;
      this.stateChangeTime = getTime();
      this.currentState = state;
      this.settled = false;
    }
  }

  public setBaseScale(scale: vec3): void {
    this.baseLocalScale = scale;
    this.settled = false;
  }

  public getHoverOffset(): number {
    return this._hoverOffset;
  }

  public getCurHoverY(): number {
    return this.curHoverY;
  }

  public setTheme(
    theme: "cat" | "owl" | "ghost" | "axolotl" | "crt" | "robot",
  ) {
    if (this.currentTheme !== theme) {
      this.currentTheme = theme;
      this.themeDirty = true;
      this.activateTheme(theme);
    }
  }

  private onUpdate() {
    if (!this.active) return;

    if (this.pressing !== this.pinched) {
      this.pressing = this.pinched;
      this.settled = false;
    }

    const time = getTime();
    const dt = getDeltaTime();
    const lerpSpeed = LERP_SPEED_MULTIPLIER * dt;
    const rawBlend = 1.0 - Math.exp(-LERP_SPEED_MULTIPLIER * (time - this.stateChangeTime));
    this.blendT = rawBlend >= 0.999 ? 1.0 : rawBlend;

    this.updateBodyTransform(time, lerpSpeed);
    this.updateOverlays(time);
    this.updateGills(time);
    this.updateGhostSkirt(time);

    this.setPassTime(this.active.bodyPass, time);
    this.setPassTime(this.active.facePass, time);
    for (let i = 0; i < this.active.antennaBallPasses.length; i++) {
      this.setPassTime(this.active.antennaBallPasses[i], time);
    }
    for (let i = 0; i < this.active.childPasses.length; i++) {
      this.setPassTime(this.active.childPasses[i], time);
    }
    this.setOverlayPassTimes(time);

    if (this.settled) return;

    const target = BASE_STATES[this.currentState as ShaderRobotState];

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
    this.curHoverScale = MathUtils.lerp(
      this.curHoverScale,
      targetScale,
      lerpSpeed,
    );

    this.scratchLookVec4.x = this.values.look.x;
    this.scratchLookVec4.y = this.values.look.y;
    const themeVal = BASE_THEME_VALUES[this.currentTheme];

    this.pushSurfaceUniforms(this.active.bodyPass, themeVal);
    this.pushSurfaceUniforms(this.active.facePass, themeVal);
    this.pushAntennaBallUniforms(themeVal);
    this.pushAllOverlayUniforms(themeVal);
    for (let i = 0; i < this.active.childPasses.length; i++) {
      this.pushSurfaceUniforms(this.active.childPasses[i], themeVal);
    }
    this.themeDirty = false;

    if (
      shaderValuesSettled(
        this.values,
        target,
        targetLook,
        this.hovered,
        this.pressing,
        this.currentState,
      ) &&
      Math.abs(this.curHoverY - targetHoverY) < 0.001 &&
      Math.abs(this.curHoverScale - targetScale) < 0.001 &&
      Math.abs(this.curZoomOutScale - this.cachedTargetZoomScale) < 0.001
    ) {
      this.settled = true;
    }
  }

  private setPassTime(pass: Pass | null, time: number): void {
    if (!pass) return;
    pass.iTime = time;
  }

  private pushSurfaceUniforms(pass: Pass | null, themeVal: number): void {
    if (!pass) return;

    pass["u_look_dir[0]"] = this.scratchLookVec4;
    pass.u_hover_intensity = this.values.hoverIntensity;
    pass.u_click_intensity = this.values.clickIntensity;
    pass.u_state = this.curStateIndex;
    pass.u_prev_state = this.prevStateIndex;
    pass.u_blend_t = this.blendT;
    if (this.themeDirty) pass.u_theme = themeVal;
  }

  private pushAntennaBallUniforms(themeVal: number): void {
    if (!this.active) return;
    for (let i = 0; i < this.active.antennaBallPasses.length; i++) {
      const pass = this.active.antennaBallPasses[i];
      pass.u_antenna_color = this.values.antennaColor;
      pass.u_pulse_speed = this.values.pulse;
      if (this.themeDirty) pass.u_theme = themeVal;
    }
  }

  private setOverlayPassTimes(time: number): void {
    if (this.wifiRoot?.enabled)
      for (let i = 0; i < this.wifiPasses.length; i++) this.wifiPasses[i].iTime = time;
    if (this.questionMarkRoot?.enabled)
      for (let i = 0; i < this.qmPasses.length; i++) this.qmPasses[i].iTime = time;
    if (this.waveBarsRoot?.enabled)
      for (let i = 0; i < this.wavePasses.length; i++) this.wavePasses[i].iTime = time;
    if (this.clickRingsRoot?.enabled)
      for (let i = 0; i < this.clickRingPasses.length; i++) this.clickRingPasses[i].iTime = time;
    if (this.sleepZsRoot?.enabled)
      for (let i = 0; i < this.sleepZPasses.length; i++) this.sleepZPasses[i].iTime = time;
  }

  private pushAllOverlayUniforms(themeVal: number): void {
    const iridSpeed = 0.05 + this.values.hoverIntensity * 0.1;
    const hoverBrightBoost = this.values.hoverIntensity * 1.5;
    for (let i = 0; i < this.allOverlayPasses.length; i++) {
      const pass = this.allOverlayPasses[i];
      pass.u_antenna_color = this.values.antennaColor;
      pass.u_pulse_speed = this.values.pulse;
      if (this.themeDirty) pass.u_theme = themeVal;
      pass.u_irid_speed = iridSpeed;
      pass.u_irid_brightness = this.overlayBaseIrid[i] + hoverBrightBoost;
    }
  }

  private updateBodyTransform(time: number, lerpSpeed: number): void {
    if (this.manipulating || !this.baseLocalPos || !this.baseLocalScale) return;
    const transform = this.getSceneObject().getTransform();

    const zoomOut = Math.max(
      this.values.connecting,
      this.values.awaitingAction,
    );
    this.cachedTargetZoomScale = MathUtils.lerp(1.0, ZOOM_OUT_SCALE, zoomOut);
    this.curZoomOutScale = MathUtils.lerp(
      this.curZoomOutScale,
      this.cachedTargetZoomScale,
      lerpSpeed,
    );

    let bob = Math.sin(time * 2.0) * 0.03 * this.values.bob;
    if (this.currentTheme === "ghost") {
      bob += Math.sin(time * 2.0) * 0.05 * this.values.bob;
    }

    this._hoverOffset = this.curHoverY + bob;
    this.scratchPos.x = this.baseLocalPos.x;
    this.scratchPos.y = this.baseLocalPos.y + this._hoverOffset;
    this.scratchPos.z = this.baseLocalPos.z;
    transform.setLocalPosition(this.scratchPos);

    const combinedScale = this.curHoverScale * this.curZoomOutScale;
    transform.setLocalScale(this.baseLocalScale.uniformScale(combinedScale));

    const lookX = this.values.look.x * 0.4;
    let lookY = this.values.look.y * 0.3;
    if (this.values.thinking > 0.01) {
      lookY += Math.sin(time * 5.0) * 0.08 * this.values.thinking;
    }
    this.eulerToQuat(lookY, -lookX, this.values.tilt);
    transform.setLocalRotation(this.scratchQuat);
  }

  private updateOverlays(time: number): void {
    this.updateWifi(time);
    this.updateQuestionMark(time);
    this.updateWaveBars(time);
    this.updateClickRings(time);
    this.updateSleepZs(time);
  }

  private updateWifi(time: number): void {
    if (!this.wifiRoot) return;
    const intensity = this.values.connecting;
    this.wifiRoot.enabled = intensity > 0.01;
    if (intensity <= 0.01) return;

    const cycle = (time * 2.5) % 4.0;
    const fadeOut = 1.0 - glslSmoothstep(3.4, 3.8, cycle);
    this.scratchScale.x = intensity;
    this.scratchScale.y = intensity;
    this.scratchScale.z = intensity;
    for (let i = 0; i < this.wifiParts.length; i++) {
      this.wifiParts[i].getTransform().setLocalScale(this.scratchScale);
      if (i < this.wifiPasses.length) {
        const fillUp = glslSmoothstep(0.8 + i, 1.0 + i, cycle);
        this.wifiPasses[i].u_fill = fillUp * fadeOut;
      }
    }
  }

  private updateQuestionMark(time: number): void {
    if (!this.questionMarkRoot) return;
    const intensity = this.values.awaitingAction;
    this.questionMarkRoot.enabled = intensity > 0.01;
    if (intensity <= 0.01) return;

    const cycle = (time * 2.0) % 4.0;
    this.scratchScale.x = intensity;
    this.scratchScale.y = intensity;
    this.scratchScale.z = intensity;
    for (let i = 0; i < this.questionMarkParts.length; i++) {
      this.questionMarkParts[i]
        .getTransform()
        .setLocalScale(this.scratchScale);
      if (i < this.qmPasses.length) {
        this.qmPasses[i].u_fill = glslSmoothstep(0.8 + i, 1.0 + i, cycle);
      }
    }
  }

  private updateWaveBars(time: number): void {
    if (!this.waveBarsRoot) return;
    const intensity = this.values.listening;
    this.waveBarsRoot.enabled = intensity > 0.01;
    if (intensity <= 0.01) return;

    const t10 = time * 10.0;
    const audBump = 1.0;
    for (let i = 0; i < this.waveBarParts.length; i++) {
      const progress = i / 3.0;
      const wave1 = Math.sin(t10 - progress * 12.0);
      const wave2 = Math.sin(t10 * 1.7 + progress * 5.0);
      const wave = 0.5 + 0.3 * wave1 + 0.2 * wave2;
      const barScale = 1.0 - progress * 0.6;
      const scaleY = (audBump * barScale + 6.0 * wave) * intensity;
      this.scratchScale.x = intensity;
      this.scratchScale.y = scaleY;
      this.scratchScale.z = intensity;
      this.waveBarParts[i].getTransform().setLocalScale(this.scratchScale);
    }
  }

  private updateClickRings(time: number): void {
    if (!this.clickRingsRoot) return;
    const intensity = this.values.clickIntensity;
    this.clickRingsRoot.enabled = intensity > 0.01;
    if (intensity <= 0.01) return;

    this.scratchScale.x = intensity;
    this.scratchScale.y = intensity;
    this.scratchScale.z = intensity;

    if (this.clickRingParts.length >= 1) {
      this.eulerToQuat(
        0.15 * Math.sin(time * 0.2),
        0.25 * Math.sin(time * 0.3),
        0,
      );
      this.clickRingParts[0].getTransform().setLocalRotation(this.scratchQuat);
      this.clickRingParts[0].getTransform().setLocalScale(this.scratchScale);
    }
    if (this.clickRingParts.length >= 2) {
      this.eulerToQuat(
        0.2 * Math.sin(time * 0.35),
        -0.3 * Math.cos(time * 0.5),
        0.2 * Math.cos(time * 0.4),
      );
      this.clickRingParts[1].getTransform().setLocalRotation(this.scratchQuat);
      this.clickRingParts[1].getTransform().setLocalScale(this.scratchScale);
    }
    if (this.clickRingParts.length >= 3) {
      this.eulerToQuat(
        -0.15 * Math.sin(time * 0.3),
        0.2 * Math.cos(time * 0.45),
        0,
      );
      this.clickRingParts[2].getTransform().setLocalRotation(this.scratchQuat);
      this.clickRingParts[2].getTransform().setLocalScale(this.scratchScale);
    }
  }

  private updateSleepZs(time: number): void {
    if (!this.sleepZsRoot) return;
    const intensity = this.values.sleep;
    this.sleepZsRoot.enabled = intensity > 0.01;
    if (intensity <= 0.01) return;

    for (let i = 0; i < this.sleepZParts.length; i++) {
      const life = (time * 0.3 + i * 0.33) % 1.0;
      const fade = (1.0 - life) * intensity;
      const scale = fade * 1.8;
      this.scratchPos.x =
        -0.25 + Math.sin(time * 0.8 + i * 1.5) * 0.08 - life * 0.1;
      this.scratchPos.y = 0.4 + life * 0.45;
      this.scratchPos.z = -0.15 - life * 0.6;
      this.scratchScale.x = scale;
      this.scratchScale.y = scale;
      this.scratchScale.z = scale;
      const xform = this.sleepZParts[i].getTransform();
      xform.setLocalPosition(this.scratchPos);
      xform.setLocalScale(this.scratchScale);
    }
  }

  private updateGills(time: number): void {
    if (!this.active || !this.active.gillsRoot) return;
    if (this.currentTheme !== "axolotl") return;

    const sinW = Math.cos(time * 5.0);
    const cosW = -Math.sin(time * 5.0);

    const count = this.active.gillsRoot.getChildrenCount();
    for (let i = 0; i < count; i++) {
      const child = this.active.gillsRoot.getChild(i);
      const rmv = child.getComponent("RenderMeshVisual") as RenderMeshVisual;
      rmv.setBlendShapeWeight("GillWaveSin", sinW);
      rmv.setBlendShapeWeight("GillWaveCos", cosW);
    }
  }

  private updateGhostSkirt(time: number): void {
    if (!this.active || this.currentTheme !== "ghost") return;
    const sinW = Math.cos(time * 3.0);
    const cosW = Math.sin(time * 3.0);
    this.active.bodyRmv.setBlendShapeWeight("GhostWaveSin", sinW);
    this.active.bodyRmv.setBlendShapeWeight("GhostWaveCos", cosW);
  }

  private eulerToQuat(x: number, y: number, z: number): void {
    const cx = Math.cos(x * 0.5);
    const sx = Math.sin(x * 0.5);
    const cy = Math.cos(y * 0.5);
    const sy = Math.sin(y * 0.5);
    const cz = Math.cos(z * 0.5);
    const sz = Math.sin(z * 0.5);
    this.scratchQuat.w = cx * cy * cz + sx * sy * sz;
    this.scratchQuat.x = sx * cy * cz - cx * sy * sz;
    this.scratchQuat.y = cx * sy * cz + sx * cy * sz;
    this.scratchQuat.z = cx * cy * sz - sx * sy * cz;
  }
}
