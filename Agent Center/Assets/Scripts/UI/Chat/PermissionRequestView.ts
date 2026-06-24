import { CancelSet } from "SpectaclesInteractionKit.lspkg/Utils/animate";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { Switch } from "SpectaclesUIKit.lspkg/Scripts/Components/Switch/Switch";
import { PermissionPayload } from "../../Api/Supabase/Bridge/BridgeTypes";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { createIconButton, createText } from "../Shared/UIBuilders";
import { scaleIn } from "../Shared/UIAnimations";
import { CLOSE_TEXTURE, SPARKLES_TEXTURE } from "../Shared/UIConstants";
import { PermissionExplainerService } from "../../Services/PermissionExplainerService";
import { ChatMessage } from "../../Types";
import { LoadingSpinner } from "../../../Visuals/LoadingSpinner/LoadingSpinner";

const CHECKMARK_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Checkmark.png",
) as Texture;

const PERMISSION_REQUEST_SFX: AudioTrackAsset = requireAsset(
  "../../../Audio/permission_request.wav",
) as AudioTrackAsset;

const BTN_WIDTH = 10;
const BTN_HEIGHT = 4;
const BTN_GAP = 2.5;
const PADDING = 2;
const Z = 1.5;
const ELEMENT_GAP = 1.5;
const TOGGLE_ROW_HEIGHT = 3;
const SWITCH_WIDTH = 5;
const TOGGLE_GAP = 1.5;
const EXPLAIN_BTN_HEIGHT = 2.5;
const EXPLAIN_BTN_WIDTH = 10;
const EXPLAIN_GAP = 1;
const FOOTER_GAP = 0.3;
const MAX_DESC_HEIGHT = 12;
const AGENT_NAME_COLOR = new vec4(0.6, 1, 0.7, 1);
const TINY_SCALE = 0.001;

export type PermissionDecision = "allow" | "allow_session" | "deny";

export class PermissionRequestView {
  private container: SceneObject | null = null;
  private height = 0;
  private innerHeight = 0;
  private audioComponent: AudioComponent;
  private animCancels: CancelSet;
  private lastPanelHalfHeight = 0;
  private lastContentZOffset = 0;

  // UpdateEvent for deferred layout (one frame after text creation so
  // getBoundingBox() returns real measurements instead of zero).
  private updateEvent: SceneEvent | null = null;

  // Pending state set in show(), consumed in onUpdate() / completeLayout().
  private pendingToolText: Text | null = null;
  private pendingDescText: Text | null = null;
  private pendingPayload: PermissionPayload | null = null;
  private pendingPanelWidth = 0;
  private pendingContentZOffset = 0;
  private pendingExplainerEnabled = false;
  private pendingAgentName = "Agent";
  private pendingRecentMessages: ChatMessage[] = [];

  public readonly onDecision = new Event<PermissionDecision>();
  public readonly onLayoutReady = new Event<void>();

  constructor(
    audioComponent: AudioComponent,
    animCancels: CancelSet,
    owner?: BaseScriptComponent,
  ) {
    this.audioComponent = audioComponent;
    this.animCancels = animCancels;
    if (owner) {
      this.updateEvent = owner.createEvent("UpdateEvent");
      this.updateEvent.bind(() => this.onUpdate());
      this.updateEvent.enabled = false;
    }
  }

  getHeight(): number {
    return this.height;
  }

  isShowing(): boolean {
    return this.container !== null;
  }

  show(
    parent: SceneObject,
    payload: PermissionPayload,
    panelWidth: number,
    contentZOffset: number,
    explainerEnabled = false,
    agentName = "Agent",
    recentMessages: ChatMessage[] = [],
  ): void {
    this.hide();

    this.audioComponent.audioTrack = PERMISSION_REQUEST_SFX;
    this.audioComponent.play(1);

    const container = global.scene.createSceneObject("PermissionRequest");
    container.setParent(parent);
    // Position far off-screen at normal scale so the renderer computes text
    // layout this frame and getBoundingBox() returns real values next frame.
    // (TINY_SCALE would make the renderer skip layout, returning 0 bounds.)
    container
      .getTransform()
      .setLocalPosition(new vec3(0, -100000, contentZOffset + Z));

    const width = panelWidth - 4;
    const textInset = 1;
    const textWidth = width - textInset * 2;

    // Create text objects now so they render this frame and can be measured
    // in onUpdate() on the following frame.
    const toolText = createText({
      parent: container,
      name: "PermTool",
      text: `Permission: ${payload.tool}`,
      size: TextSize.XL,
      font: TextFont.SemiBold,
      color: new vec4(1, 1, 1, 1),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(-textWidth / 2, textWidth / 2, -50, 50),
    });

    const descText = createText({
      parent: container,
      name: "PermDesc",
      text: payload.description,
      size: TextSize.L,
      color: new vec4(1, 1, 1, 0.8),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(-textWidth / 2, textWidth / 2, -50, 50),
    });

    this.container = container;
    this.lastContentZOffset = contentZOffset;
    this.pendingToolText = toolText;
    this.pendingDescText = descText;
    this.pendingPayload = payload;
    this.pendingPanelWidth = panelWidth;
    this.pendingContentZOffset = contentZOffset;
    this.pendingExplainerEnabled = explainerEnabled;
    this.pendingAgentName = agentName;
    this.pendingRecentMessages = recentMessages;

    if (this.updateEvent) {
      this.updateEvent.enabled = true;
    } else {
      // No owner provided — layout with whatever bounds are available.
      this.completeLayout();
    }
  }

  private onUpdate(): void {
    if (!this.pendingToolText || !this.pendingDescText || !this.container)
      return;

    const toolHeight = this.pendingToolText.getBoundingBox().getSize().y;
    const descHeight = this.pendingDescText.getBoundingBox().getSize().y;

    // Text hasn't rendered yet — retry next frame.
    if (toolHeight === 0 || descHeight === 0) return;

    this.updateEvent!.enabled = false;
    this.completeLayout();
  }

  private completeLayout(): void {
    const container = this.container;
    if (!container) return;

    const toolText = this.pendingToolText!;
    const descText = this.pendingDescText!;
    const payload = this.pendingPayload!;
    const panelWidth = this.pendingPanelWidth;
    const contentZOffset = this.pendingContentZOffset;
    const explainerEnabled = this.pendingExplainerEnabled;
    const agentName = this.pendingAgentName;
    const recentMessages = this.pendingRecentMessages;

    this.pendingToolText = null;
    this.pendingDescText = null;
    this.pendingPayload = null;
    this.pendingRecentMessages = [];

    const width = panelWidth - 4;
    const textInset = 1;
    const textWidth = width - textInset * 2;
    const innerWidth = width - PADDING * 2;

    const toolBounds = toolText.getBoundingBox();
    const toolHeight = toolBounds.getSize().y;
    const toolCenter = toolBounds.getCenter();

    const descBounds = descText.getBoundingBox();
    const descHeight = descBounds.getSize().y;
    const descCenter = descBounds.getCenter();

    const visibleDescHeight = Math.min(descHeight, MAX_DESC_HEIGHT);

    const btnRowHeight = BTN_HEIGHT;
    const innerHeight =
      toolHeight +
      ELEMENT_GAP +
      visibleDescHeight +
      ELEMENT_GAP +
      btnRowHeight +
      (explainerEnabled ? EXPLAIN_GAP + EXPLAIN_BTN_HEIGHT : 0) +
      TOGGLE_GAP +
      TOGGLE_ROW_HEIGHT +
      PADDING * 2;

    const scrollWindowY =
      innerHeight / 2 -
      PADDING -
      toolHeight -
      ELEMENT_GAP -
      visibleDescHeight / 2;

    // Position desc text directly in the container — avoids worldSpaceRect
    // coordinate-space confusion that occurs after ScrollWindow re-parenting.
    descText.getSceneObject().getTransform().setLocalPosition(
      new vec3(0, scrollWindowY - descCenter.y, Z),
    );
    descText.worldSpaceRect = Rect.create(
      -textWidth / 2,
      textWidth / 2,
      -visibleDescHeight / 2,
      visibleDescHeight / 2,
    );

    const bgObj = global.scene.createSceneObject("PermBg");
    bgObj.setParent(container);
    const bg = bgObj.createComponent(BackPlate.getTypeName()) as BackPlate;
    bg.style = "dark";
    bg.size = new vec2(width, innerHeight);

    let cursorY = innerHeight / 2 - PADDING;

    cursorY -= toolHeight / 2;
    toolText
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, cursorY - toolCenter.y, Z));
    cursorY -= toolHeight / 2;

    cursorY -= ELEMENT_GAP;
    cursorY -= visibleDescHeight;
    cursorY -= ELEMENT_GAP;

    cursorY -= btnRowHeight / 2;
    const totalBtnWidth = BTN_WIDTH * 2 + BTN_GAP;

    const denyBtn = createIconButton({
      parent: container,
      name: "PermDenyBtn",
      width: BTN_WIDTH,
      height: BTN_HEIGHT,
      label: "Deny",
      position: new vec3(-totalBtnWidth / 2 + BTN_WIDTH / 2, cursorY, Z),
      fontSize: TextSize.M,
      icon: CLOSE_TEXTURE,
    });
    denyBtn.button.onTriggerUp.add(() => {
      this.onDecision.invoke("deny");
      this.hide();
    });

    const allowBtn = createIconButton({
      parent: container,
      name: "PermAllowBtn",
      width: BTN_WIDTH,
      height: BTN_HEIGHT,
      label: "Allow",
      position: new vec3(totalBtnWidth / 2 - BTN_WIDTH / 2, cursorY, Z),
      fontSize: TextSize.M,
      icon: CHECKMARK_TEXTURE,
    });
    allowBtn.button.onTriggerUp.add(() => {
      const decision = allowAll ? "allow_session" : "allow";
      this.onDecision.invoke(decision);
      this.hide();
    });

    cursorY -= btnRowHeight / 2;

    if (explainerEnabled) {
      // Spinner overlays the description area while waiting for the explanation.
      const spinnerObj = global.scene.createSceneObject("ExplainSpinner");
      spinnerObj.setParent(container);
      spinnerObj
        .getTransform()
        .setLocalPosition(new vec3(0, scrollWindowY, Z));
      spinnerObj.getTransform().setLocalScale(new vec3(2, 2, 1));
      const spinner = spinnerObj.createComponent(
        LoadingSpinner.getTypeName(),
      ) as LoadingSpinner;
      spinner.renderOrder = 1;
      spinnerObj.enabled = false;

      cursorY -= EXPLAIN_GAP;
      cursorY -= EXPLAIN_BTN_HEIGHT / 2;
      const explainBtn = createIconButton({
        parent: container,
        name: "PermExplainBtn",
        width: EXPLAIN_BTN_WIDTH,
        height: EXPLAIN_BTN_HEIGHT,
        label: "Explain",
        position: new vec3(0, cursorY, Z),
        fontSize: TextSize.S,
        icon: SPARKLES_TEXTURE,
      });

      const relayout = (newDescH: number, newDescCY: number) => {
        const newVisibleH = Math.min(newDescH, MAX_DESC_HEIGHT);

        const newInner =
          toolHeight +
          ELEMENT_GAP +
          newVisibleH +
          ELEMENT_GAP +
          BTN_HEIGHT +
          TOGGLE_GAP +
          TOGGLE_ROW_HEIGHT +
          PADDING * 2;

        const newScrollY =
          newInner / 2 - PADDING - toolHeight - ELEMENT_GAP - newVisibleH / 2;

        descText
          .getSceneObject()
          .getTransform()
          .setLocalPosition(new vec3(0, newScrollY - newDescCY, Z));
        descText.worldSpaceRect = Rect.create(
          -textWidth / 2,
          textWidth / 2,
          -newVisibleH / 2,
          newVisibleH / 2,
        );
        spinnerObj.getTransform().setLocalPosition(new vec3(0, newScrollY, Z));

        bg.size = new vec2(width, newInner);

        let rY = newInner / 2 - PADDING;

        rY -= toolHeight / 2;
        toolText
          .getSceneObject()
          .getTransform()
          .setLocalPosition(new vec3(0, rY - toolCenter.y, Z));
        rY -= toolHeight / 2;
        rY -= ELEMENT_GAP;
        rY -= newVisibleH;
        rY -= ELEMENT_GAP;

        rY -= BTN_HEIGHT / 2;
        const totalBW = BTN_WIDTH * 2 + BTN_GAP;
        denyBtn.sceneObject
          .getTransform()
          .setLocalPosition(new vec3(-totalBW / 2 + BTN_WIDTH / 2, rY, Z));
        allowBtn.sceneObject
          .getTransform()
          .setLocalPosition(new vec3(totalBW / 2 - BTN_WIDTH / 2, rY, Z));
        rY -= BTN_HEIGHT / 2;
        rY -= TOGGLE_GAP;
        rY -= TOGGLE_ROW_HEIGHT / 2;
        toggleRowObj.getTransform().setLocalPosition(new vec3(0, rY, Z));

        footerText
          .getSceneObject()
          .getTransform()
          .setLocalPosition(
            new vec3(
              0,
              -newInner / 2 - FOOTER_GAP - footerSize.y / 2 - footerCenter.y,
              Z,
            ),
          );

        this.innerHeight = newInner;
        this.height = newInner + FOOTER_GAP + footerSize.y;
        this.reposition(this.lastPanelHalfHeight, this.lastContentZOffset);
      };

      explainBtn.button.onTriggerUp.add(() => {
        descText.getSceneObject().enabled = false;
        spinnerObj.enabled = true;
        explainBtn.sceneObject.enabled = false;
        relayout(descHeight, descCenter.y);
        PermissionExplainerService.explain(
          payload.tool,
          payload.description,
          recentMessages,
        ).then((result) => {
          spinnerObj.enabled = false;
          descText.getSceneObject().enabled = true;
          descText.text = result;
          const newBounds = descText.getBoundingBox();
          relayout(newBounds.getSize().y, newBounds.getCenter().y);
        });
      });
      cursorY -= EXPLAIN_BTN_HEIGHT / 2;
    }

    cursorY -= TOGGLE_GAP;
    cursorY -= TOGGLE_ROW_HEIGHT / 2;

    const toggleRowObj = global.scene.createSceneObject("PermToggleRow");
    toggleRowObj.setParent(container);
    toggleRowObj.getTransform().setLocalPosition(new vec3(0, cursorY, Z));

    const switchLabelWidth = innerWidth - SWITCH_WIDTH - 1;
    const labelX = -innerWidth / 2 + switchLabelWidth / 2;

    createText({
      parent: toggleRowObj,
      name: "PermToggleLabel",
      text: "Auto-allow for session",
      size: TextSize.M,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(labelX, 0, 0),
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(
        -switchLabelWidth / 2,
        switchLabelWidth / 2,
        -TOGGLE_ROW_HEIGHT / 2,
        TOGGLE_ROW_HEIGHT / 2,
      ),
    });

    const switchObj = global.scene.createSceneObject("PermSwitch");
    switchObj.setParent(toggleRowObj);
    const switchX = innerWidth / 2 - SWITCH_WIDTH / 2;
    switchObj.getTransform().setLocalPosition(new vec3(switchX, 0, 0));
    const permSwitch = switchObj.createComponent(
      Switch.getTypeName(),
    ) as Switch;
    permSwitch.size = new vec3(SWITCH_WIDTH, TOGGLE_ROW_HEIGHT - 0.5, 0.5);
    permSwitch.initialize();
    permSwitch.toggle(false);
    let allowAll = false;
    permSwitch.onValueChange.add((v: number) => {
      allowAll = v > 0;
    });

    const footerText = createText({
      parent: container,
      name: "PermFooter",
      text: agentName,
      size: TextSize.XS,
      font: TextFont.Light,
      color: AGENT_NAME_COLOR,
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(-width / 2, width / 2, -50, 50),
    });
    const footerBounds = footerText.getBoundingBox();
    const footerSize = footerBounds.getSize();
    const footerCenter = footerBounds.getCenter();
    footerText
      .getSceneObject()
      .getTransform()
      .setLocalPosition(
        new vec3(
          0,
          -innerHeight / 2 - FOOTER_GAP - footerSize.y / 2 - footerCenter.y,
          Z,
        ),
      );

    this.innerHeight = innerHeight;
    this.height = innerHeight + FOOTER_GAP + footerSize.y;

    // Move from the off-screen measurement position to the correct position,
    // then shrink to TINY_SCALE so scaleIn can animate it in.
    this.reposition(this.lastPanelHalfHeight, this.lastContentZOffset);
    container
      .getTransform()
      .setLocalScale(new vec3(TINY_SCALE, TINY_SCALE, TINY_SCALE));
    scaleIn(container, vec3.one(), {
      duration: 0.3,
      easing: "ease-out-back",
      cancelSet: this.animCancels,
      enable: false,
    });
    this.onLayoutReady.invoke();
  }

  hide(): void {
    if (this.updateEvent) this.updateEvent.enabled = false;
    this.pendingToolText = null;
    this.pendingDescText = null;
    this.pendingPayload = null;
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
    this.height = 0;
  }

  reposition(panelHalfHeight: number, contentZOffset: number): void {
    this.lastPanelHalfHeight = panelHalfHeight;
    this.lastContentZOffset = contentZOffset;
    if (!this.container) return;
    const y = -panelHalfHeight + this.innerHeight / 2;
    this.container
      .getTransform()
      .setLocalPosition(new vec3(0, y, contentZOffset + Z));
  }
}
