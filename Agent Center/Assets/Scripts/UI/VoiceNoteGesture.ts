import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData";
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { VoiceInputController } from "../Input/VoiceInputController";
import { AgentButtonBar } from "./Agent/AgentButtonBar";
import {
  setTimeout,
  clearTimeout,
} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { ActivityIndicatorController } from "../../Visuals/Scripts/ActivityIndicatorController";
import { createImage } from "./Shared/ImageFactory";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { DropShadow } from "SpectaclesUIKit.lspkg/Scripts/DropShadow";
import {
  ICON_Z_OFFSET,
  TOOLTIP_OFFSET,
  TRASH_TEXTURE,
  MICROPHONE_TEXTURE,
  SEND_TEXTURE,
} from "./Shared/UIConstants";
import {
  createTooltip,
  createAudioComponent,
  createText,
} from "./Shared/UIBuilders";
import { TextSize, TextFont } from "./Shared/TextSizes";
import { VoiceNoteStateMachine } from "./VoiceNoteStateMachine";

const MIC_ACTIVITY_INDICATOR_PREFAB: ObjectPrefab = requireAsset(
  "../../Prefabs/MicActivityIndicator.prefab",
) as ObjectPrefab;

const MIC_ON_SFX: AudioTrackAsset = requireAsset(
  "../../Audio/audioInputOn.wav",
) as AudioTrackAsset;
const MIC_OFF_SFX: AudioTrackAsset = requireAsset(
  "../../Audio/audioInputOff.wav",
) as AudioTrackAsset;

const POS_LERP = 0.3;
const ROT_LERP = 0.3;
const BTN_SIZE = 2.5;
const ICON_SIZE = BTN_SIZE * 0.5;
const SHOW_ANIM_DURATION = 0.15;
const BAR_OFFSET_Y = 8;
const DISMISS_TIMEOUT_MS = 6000;

const INDICATOR_Z = -0.05;
const INDICATOR_SCALE = 3;
const EDITOR_MENU_RIGHT_GAP = 4;
const TOOLTIP_PROXIMITY_DISTANCE = 3.5;
const PINCH_DOWN_DISTANCE = 2;
const PINCH_UP_DISTANCE = 4.5;
const PINCH_MIN_HOLD_S = 0.15;
const SEND_CURSOR_EDGE_GAP = 1.0;
// Half of (button width + spacing): cursor must be within this X distance of a button to hover it.
// Matches AgentButtonBar's BUTTON_SIZE=4.5 + BUTTON_SPACING=1, so half-pitch = 2.75 cm.
const SEND_HOVER_HALF_PITCH = 2.75;
const ASR_ERROR_COOLDOWN_MS = 1500;
const PALM_SHOW_ANGLE = 65;
const PALM_HIDE_ANGLE = 80;

const TEXT_Y_ABOVE = BTN_SIZE / 2 + 1;
const TEXT_MAX_WIDTH = 15;
const PARTIAL_TEXT_COLOR = new vec4(0.6, 0.6, 0.6, 1);
const FINAL_TEXT_COLOR = new vec4(1, 1, 1, 1);
const LISTENING_PLACEHOLDER = "Listening...";

const TRANSCRIPT_BACKING_COLOR = new vec4(0, 0, 0, 0.35);
const TRANSCRIPT_BACKING_CORNER_RADIUS = 0.8;
const TRANSCRIPT_BACKING_SPREAD = 0.7;

const SENDTO_REVEAL_DURATION = 0.3;
const SEND_SECTION_GAP = 1.5;
const SEND_HEADER_Y = SEND_SECTION_GAP;
const SEND_MESSAGE_Y = 2.5;
const SEND_MESSAGE_COLOR = new vec4(0.8, 0.8, 0.8, 1);
const SEND_MESSAGE_MAX_HEIGHT = 3;
const SEND_CURSOR_SIZE = 2;
const SEND_CURSOR_Z = -0.3;
const TRASH_ICON_SIZE = 2.0;
const TRASH_GAP = 1.5;
const TRASH_SCALE_NORMAL = 1.0;
const TRASH_SCALE_HOVER = 1.3;
const TRASH_ALPHA_NORMAL = 0.5;
const TRASH_ALPHA_HOVER = 1.0;
const TRASH_LERP = 0.15;

export interface VoiceNoteSendPayload {
  agentId: string;
  transcript: string;
}

@component
export class VoiceNoteGesture extends BaseScriptComponent {
  public readonly onVoiceNoteSendTo = new Event<VoiceNoteSendPayload>();

  private handProvider: HandInputData = SIK.HandInputData;
  private leftHand = this.handProvider.getHand("left");
  private rightHand = this.handProvider.getHand("right");
  private hand = this.leftHand;
  private camera = WorldCameraFinderProvider.getInstance();
  private gestureModule: GestureModule = require("LensStudio:GestureModule");

  private stateMachine: VoiceNoteStateMachine;

  private transcript = "";

  private micObj: SceneObject;
  private micButton: RoundButton;
  private micIcon: Image;
  private animCancel = new CancelSet();

  private barContainer: SceneObject;
  private buttonBar: AgentButtonBar;
  private sendToHeaderObj: SceneObject;
  private sendToHeaderText: Text;
  private sendToMessageObj: SceneObject;
  private sendToMessageText: Text;
  private sendCursorObj: SceneObject;
  private hoveredAgentId: string | null = null;
  private cancelIconObj: SceneObject;
  private cancelIconImg: Image;
  private hoveringTrash = false;
  private sendToLockedWorldPos: vec3 = vec3.zero();
  private dismissHandle: ReturnType<typeof setTimeout> | null = null;

  private micActivityIndicator: ActivityIndicatorController;
  private micTooltip: Tooltip;
  private tooltipShown = false;
  private transcriptObj: SceneObject;
  private transcriptText: Text;
  private transcriptBacking: DropShadow;
  private audioComponent: AudioComponent;
  private menuAnchor: SceneObject | null = null;
  private asrCooldownUntil = 0;
  private fingersPinched = false;
  private gestureModulePinchingLeft = false;
  private gestureModulePinchingRight = false;
  private pinchStartTime = 0;
  private phoneInLeftHand = false;
  private phoneInRightHand = false;
  private _enabled = false;
  private updateEvent: SceneEvent;

  private readonly _scratchScale = new vec3(1, 1, 1);
  private readonly _scratchColor = new vec4(1, 1, 1, 1);

  private get gestureModulePinching(): boolean {
    return this.hand === this.leftHand
      ? this.gestureModulePinchingLeft
      : this.gestureModulePinchingRight;
  }

  init(menuAnchor?: SceneObject): void {
    this.menuAnchor = menuAnchor ?? null;
    this.stateMachine = new VoiceNoteStateMachine({
      onEnterIdle: () => this.enterIdle(),
      onEnterReady: () => this.enterReady(),
      onEnterRecording: () => this.enterRecording(),
      onExitRecording: () => this.exitRecording(),
      onEnterSendTo: () => this.enterSendTo(),
      onExitSendTo: () => this.exitSendTo(),
    });

    this.audioComponent = createAudioComponent(this.getSceneObject());

    this.buildMicButton();
    this.buildTranscriptLabel();
    this.buildButtonBar();
    this.buildSendToUI();
    this.buildSendCursor();
    this.bindVoiceEvents();
    this.bindPhoneInHandEvents();
    this.bindPinchGestureEvents();

    this.updateEvent = this.createEvent("UpdateEvent");
    this.updateEvent.bind(() => this.onUpdate());
    this.updateEvent.enabled = global.deviceInfoSystem.isEditor();

    const delay = this.createEvent("DelayedCallbackEvent");
    delay.bind(() => {
      if (global.deviceInfoSystem.isEditor() && this._enabled) {
        this.stateMachine.send("PALM_FACING");
      } else {
        this.micObj.enabled = false;
      }
    });
    delay.reset(0.25);
  }

  private buildMicButton(): void {
    this.micObj = global.scene.createSceneObject("VoiceNoteMic");
    this.micObj.setParent(this.getSceneObject());
    this.micObj.getTransform().setLocalPosition(vec3.zero());
    this.micObj.getTransform().setLocalScale(new vec3(0.01, 0.01, 0.01));

    this.micButton = this.micObj.createComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;

    this.micIcon = createImage(MICROPHONE_TEXTURE, {
      parent: this.micObj,
      name: "MicIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: ICON_SIZE * 1.25,
      shared: false,
    });

    const indicatorObj = MIC_ACTIVITY_INDICATOR_PREFAB.instantiate(this.micObj);
    indicatorObj.getTransform().setLocalPosition(new vec3(0, 0, INDICATOR_Z));
    indicatorObj
      .getTransform()
      .setLocalScale(vec3.one().uniformScale(INDICATOR_SCALE));
    this.micActivityIndicator = indicatorObj.getComponent(
      ActivityIndicatorController.getTypeName(),
    ) as ActivityIndicatorController;

    this.createEvent("OnStartEvent").bind(() => {
      const btnRecord = this.micButton as unknown as Record<string, string>;
      btnRecord["_style"] = "Ghost";
      this.micButton.initialize();
      this.micButton.width = BTN_SIZE;

      this.micTooltip = createTooltip(this.micObj, "Pinch to record", {
        offset: TOOLTIP_OFFSET.uniformScale(0.75),
        scale: 0.5,
      });
      this.micButton.onHoverEnter.add(() => {
        if (this.stateMachine.getCurrentState() === "Ready")
          this.micTooltip.setOn(true);
      });
      this.micButton.onHoverExit.add(() => this.micTooltip.setOn(false));

      this.bindEditorButtonEvents();
    });
  }

  private buildTranscriptLabel(): void {
    this.transcriptText = createText({
      parent: this.getSceneObject(),
      name: "TranscriptLabel",
      text: "",
      size: TextSize.S,
      color: PARTIAL_TEXT_COLOR,
      position: new vec3(0, TEXT_Y_ABOVE, 0),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Bottom,
      worldSpaceRect: Rect.create(
        -TEXT_MAX_WIDTH / 2,
        TEXT_MAX_WIDTH / 2,
        0,
        10,
      ),
    });
    this.transcriptObj = this.transcriptText.getSceneObject();
    this.transcriptObj.enabled = false;

    const backingObj = global.scene.createSceneObject("TranscriptBacking");
    backingObj.setParent(this.transcriptObj);
    backingObj.getTransform().setLocalPosition(new vec3(0, 1, -0.25));
    this.transcriptBacking = backingObj.createComponent(
      DropShadow.getTypeName(),
    ) as DropShadow;
    this.transcriptBacking.size = new vec2(TEXT_MAX_WIDTH, 2.5);
    this.transcriptBacking.cornerRadius = TRANSCRIPT_BACKING_CORNER_RADIUS;
    this.transcriptBacking.color = TRANSCRIPT_BACKING_COLOR;
    this.transcriptBacking.spread = TRANSCRIPT_BACKING_SPREAD;
  }

  private buildButtonBar(): void {
    this.barContainer = global.scene.createSceneObject("VoiceNoteBar");
    this.barContainer.setParent(this.getSceneObject());
    this.barContainer
      .getTransform()
      .setLocalPosition(new vec3(0, BAR_OFFSET_Y, 0));
    this.barContainer.enabled = false;

    this.buttonBar = this.barContainer.createComponent(
      AgentButtonBar.getTypeName(),
    ) as AgentButtonBar;

    this.buttonBar.onAgentSelected.add((agentId: string) => {
      if (this.stateMachine.getCurrentState() !== "SendTo") return;
      const text = this.transcript;
      this.stateMachine.send("SEND_SELECTED");
      this.onVoiceNoteSendTo.invoke({ agentId, transcript: text });
    });
  }

  private buildSendToUI(): void {
    this.sendToMessageText = createText({
      parent: this.barContainer,
      name: "SendToMessage",
      text: "",
      size: TextSize.S,
      color: SEND_MESSAGE_COLOR,
      position: new vec3(0, SEND_MESSAGE_Y, 0),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Bottom,
      worldSpaceRect: Rect.create(
        -TEXT_MAX_WIDTH / 2,
        TEXT_MAX_WIDTH / 2,
        0,
        SEND_MESSAGE_MAX_HEIGHT,
      ),
    });
    this.sendToMessageObj = this.sendToMessageText.getSceneObject();
    this.sendToMessageObj.enabled = false;

    this.sendToHeaderText = createText({
      parent: this.barContainer,
      name: "SendToHeader",
      text: "Send To",
      size: TextSize.M,
      font: TextFont.SemiBold,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(0, SEND_HEADER_Y, 0),
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
    });
    this.sendToHeaderObj = this.sendToHeaderText.getSceneObject();
    this.sendToHeaderObj.enabled = false;

    this.cancelIconObj = global.scene.createSceneObject("CancelIcon");
    this.cancelIconObj.setParent(this.barContainer);
    this.cancelIconObj.enabled = false;

    this.cancelIconImg = createImage(TRASH_TEXTURE, {
      parent: this.cancelIconObj,
      name: "TrashIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: TRASH_ICON_SIZE,
      shared: false,
    });
  }

  private buildSendCursor(): void {
    this.sendCursorObj = global.scene.createSceneObject("SendCursor");
    this.sendCursorObj.setParent(this.getSceneObject());
    this.sendCursorObj.enabled = false;

    createImage(SEND_TEXTURE, {
      parent: this.sendCursorObj,
      name: "SendCursorIcon",
      position: new vec3(0, 0, SEND_CURSOR_Z),
      size: SEND_CURSOR_SIZE,
      shared: false,
    });
  }

  private checkFingertipPinch(): void {
    const indexPos = this.hand.indexTip.position;
    const thumbPos = this.hand.thumbTip.position;
    const distance = indexPos.distance(thumbPos);
    const isSkeletonPinching = distance < PINCH_DOWN_DISTANCE;

    // Require both GestureModule and skeleton to agree — prevents false positives
    if (
      !this.fingersPinched &&
      this.gestureModulePinching &&
      isSkeletonPinching
    ) {
      this.fingersPinched = true;
      this.pinchStartTime = getTime();
      if (getTime() >= this.asrCooldownUntil) {
        this.stateMachine.send("PINCH_DOWN");
      }
    } else if (
      this.fingersPinched &&
      !this.gestureModulePinching &&
      distance > PINCH_UP_DISTANCE &&
      getTime() - this.pinchStartTime >= PINCH_MIN_HOLD_S
    ) {
      this.fingersPinched = false;
      this.playSfx(MIC_OFF_SFX);
      this.stateMachine.send("PINCH_UP", {
        hasTranscript: this.transcript.length > 0,
      });
    }
  }

  private bindEditorButtonEvents(): void {
    if (!global.deviceInfoSystem.isEditor()) return;

    this.micButton.interactable.onTriggerStart.add(() => {
      if (getTime() >= this.asrCooldownUntil) {
        this.stateMachine.send("PINCH_DOWN");
      }
    });

    this.micButton.interactable.onTriggerEnd.add(() => {
      this.playSfx(MIC_OFF_SFX);
      this.stateMachine.send("PINCH_UP", {
        hasTranscript: this.transcript.length > 0,
      });
    });
  }

  private bindVoiceEvents(): void {
    VoiceInputController.getInstance().onTranscript.add((text: string) => {
      if (this.stateMachine.getCurrentState() !== "Recording") return;
      this.transcript = text;
      this.setTranscriptDisplay(text, FINAL_TEXT_COLOR);
      this.stateMachine.send("TRANSCRIPT_FINAL");
    });

    VoiceInputController.getInstance().onPartialTranscript.add((text: string) => {
      if (this.stateMachine.getCurrentState() !== "Recording") return;
      this.transcript = text;
      this.setTranscriptDisplay(text, PARTIAL_TEXT_COLOR);
    });

    VoiceInputController.getInstance().onError.add(() => {
      this.asrCooldownUntil = getTime() + ASR_ERROR_COOLDOWN_MS / 1000;
      this.stateMachine.send("ASR_ERROR");
    });
  }

  private bindPhoneInHandEvents(): void {
    this.gestureModule
      .getIsPhoneInHandBeginEvent(GestureModule.HandType.Left)
      .add(() => {
        this.phoneInLeftHand = true;
      });
    this.gestureModule
      .getIsPhoneInHandEndEvent(GestureModule.HandType.Left)
      .add(() => {
        this.phoneInLeftHand = false;
      });
    this.gestureModule
      .getIsPhoneInHandBeginEvent(GestureModule.HandType.Right)
      .add(() => {
        this.phoneInRightHand = true;
      });
    this.gestureModule
      .getIsPhoneInHandEndEvent(GestureModule.HandType.Right)
      .add(() => {
        this.phoneInRightHand = false;
      });
  }

  private bindPinchGestureEvents(): void {
    this.gestureModule
      .getPinchDownEvent(GestureModule.HandType.Left)
      .add(() => {
        this.gestureModulePinchingLeft = true;
      });
    this.gestureModule.getPinchUpEvent(GestureModule.HandType.Left).add(() => {
      this.gestureModulePinchingLeft = false;
    });
    this.gestureModule
      .getPinchDownEvent(GestureModule.HandType.Right)
      .add(() => {
        this.gestureModulePinchingRight = true;
      });
    this.gestureModule.getPinchUpEvent(GestureModule.HandType.Right).add(() => {
      this.gestureModulePinchingRight = false;
    });
  }

  getButtonBar(): AgentButtonBar {
    return this.buttonBar;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this._enabled) return;
    this._enabled = enabled;
    if (!global.deviceInfoSystem.isEditor()) {
      this.updateEvent.enabled = enabled;
    }
    if (!enabled) {
      const state = this.stateMachine.getCurrentState();
      if (state === "SendTo") {
        this.stateMachine.send("CANCEL_SEND");
      } else if (state === "Recording") {
        this.stateMachine.send("HAND_LOST");
      } else if (state === "Ready") {
        this.stateMachine.send("PALM_AWAY");
      }
    }
  }

  private onUpdate(): void {
    if (global.deviceInfoSystem.isEditor()) {
      this.positionEditor();
      return;
    }

    this.checkActivation();

    const state = this.stateMachine.getCurrentState();

    if (state === "SendTo") {
      this.positionDeviceSendTo();
      this.updateSendToSelection();
    } else if (state !== "Idle") {
      this.positionDevice();
    }

    if (state === "Ready" || state === "Recording") {
      this.checkFingertipPinch();
    }

    if (state === "Ready") {
      this.checkPinchProximity();
    }
  }

  private isMidpointInFOV(): boolean {
    const indexPos = this.hand.indexTip.position;
    const thumbPos = this.hand.thumbTip.position;
    const midpoint = vec3.lerp(indexPos, thumbPos, 0.5);
    return this.camera.inFoV(midpoint);
  }

  private isPalmFacing(): boolean {
    const angle = this.hand.getFacingCameraAngle();
    if (angle === null) return false;
    const threshold =
      this.stateMachine.getCurrentState() === "Idle"
        ? PALM_SHOW_ANGLE
        : PALM_HIDE_ANGLE;
    return angle < threshold;
  }

  private isHandPalmFacing(h: TrackedHand): boolean {
    if (!h.isTracked()) return false;
    const angle = h.getFacingCameraAngle();
    if (angle === null) return false;
    return angle < PALM_SHOW_ANGLE;
  }

  private updateActiveHand(): void {
    const state = this.stateMachine.getCurrentState();
    if (state !== "Idle" && state !== "Ready") return;

    const phoneHeld = this.phoneInLeftHand || this.phoneInRightHand;
    if (phoneHeld) return;

    const leftFacing = this.isHandPalmFacing(this.leftHand);
    const rightFacing = this.isHandPalmFacing(this.rightHand);

    if (leftFacing && !rightFacing) {
      this.hand = this.leftHand;
    } else if (rightFacing && !leftFacing) {
      this.hand = this.rightHand;
    }
  }

  private checkActivation(): void {
    this.updateActiveHand();

    const state = this.stateMachine.getCurrentState();
    const tracked = this.hand.isTracked();
    const phoneHeld = this.phoneInLeftHand || this.phoneInRightHand;
    const facing =
      this._enabled && tracked && !phoneHeld && this.isPalmFacing() && this.isMidpointInFOV();

    if (facing && state === "Idle") {
      this.stateMachine.send("PALM_FACING");
    } else if (!facing && state === "Ready") {
      this.stateMachine.send("PALM_AWAY");
    } else if ((!tracked || phoneHeld) && state === "Recording") {
      this.playSfx(MIC_OFF_SFX);
      this.stateMachine.send("HAND_LOST");
    } else if (!facing && state === "SendTo") {
      this.startDismissTimeout();
    }
  }

  private checkPinchProximity(): void {
    const indexPos = this.hand.indexTip.position;
    const thumbPos = this.hand.thumbTip.position;
    const distance = indexPos.distance(thumbPos);
    const approaching = distance < TOOLTIP_PROXIMITY_DISTANCE;

    if (approaching && !this.tooltipShown) {
      this.tooltipShown = true;
      this.micTooltip.setOn(true);
    } else if (!approaching && this.tooltipShown) {
      this.tooltipShown = false;
      this.micTooltip.setOn(false);
    }
  }

  // Projects the finger's horizontal displacement onto the bar's local X axis and
  // locks Y to just below the bar's bottom edge, giving the "dragging along the
  // rim" feel without the cursor chasing the hand vertically.
  private computeConstrainedCursorWorldPos(fingerPos: vec3): vec3 {
    const barHeight = this.buttonBar.getVisualHeight();
    if (barHeight === 0) return fingerPos;

    const sceneTransform = this.getSceneObject().getTransform();
    const scenePos = sceneTransform.getWorldPosition();
    const sceneRight = sceneTransform.right;
    const sceneUp = sceneTransform.up;

    const localFingerX = fingerPos.sub(scenePos).dot(sceneRight);
    const barHalfWidth = this.buttonBar.getVisualWidth() / 2;
    const trashRightEdge = barHalfWidth + TRASH_GAP + TRASH_ICON_SIZE;
    const clampedX = Math.max(
      -barHalfWidth,
      Math.min(localFingerX, trashRightEdge),
    );
    const cursorLocalY = BAR_OFFSET_Y - barHeight - SEND_CURSOR_EDGE_GAP;

    return scenePos
      .add(sceneRight.uniformScale(clampedX))
      .add(sceneUp.uniformScale(cursorLocalY));
  }

  private updateSendToSelection(): void {
    const fingerPos = this.hand.indexTip.position;

    // Snap cursor to the bottom edge of the bar, following the finger horizontally.
    // This gives the feel of dragging the send icon along the bar's lower rim.
    const cursorWorldPos = this.computeConstrainedCursorWorldPos(fingerPos);
    this.sendCursorObj.getTransform().setWorldPosition(cursorWorldPos);
    const toCamera = this.camera
      .getWorldPosition()
      .sub(cursorWorldPos)
      .normalize();
    this.sendCursorObj
      .getTransform()
      .setWorldRotation(quat.lookAt(toCamera, vec3.up()));

    // Project onto the bar's local X axis so distance is in world-space centimetres.
    const sceneTransform = this.getSceneObject().getTransform();
    const scenePos = sceneTransform.getWorldPosition();
    const sceneRight = sceneTransform.right;
    const cursorLocalX = cursorWorldPos.sub(scenePos).dot(sceneRight);

    let closestId: string | null = null;
    const buttons = this.buttonBar.getButtonWorldPositions();
    let closestDist = Infinity;
    for (const btn of buttons) {
      const btnLocalX = btn.worldPos.sub(scenePos).dot(sceneRight);
      const dist = Math.abs(cursorLocalX - btnLocalX);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = btn.agentId;
      }
    }
    // Only hover if cursor is within half a button-pitch of the nearest button,
    // so moving past the bar edge clears the hover.
    if (closestDist > SEND_HOVER_HALF_PITCH) {
      closestId = null;
    }

    // Check if cursor is over the trash icon (right of the bar)
    const barHalfWidth = this.buttonBar.getVisualWidth() / 2;
    const trashCenterX = barHalfWidth + TRASH_GAP + TRASH_ICON_SIZE / 2;
    const isOverTrash =
      closestId === null &&
      Math.abs(cursorLocalX - trashCenterX) < TRASH_ICON_SIZE;

    this.hoveredAgentId = closestId;
    this.buttonBar.setHoveredAgent(closestId);

    this.hoveringTrash = isOverTrash;

    const targetScale = isOverTrash ? TRASH_SCALE_HOVER : TRASH_SCALE_NORMAL;
    const targetAlpha = isOverTrash ? TRASH_ALPHA_HOVER : TRASH_ALPHA_NORMAL;
    const curScale = this.cancelIconObj.getTransform().getLocalScale().x;
    const curAlpha = this.cancelIconImg.mainPass.baseColor.a;
    const s = MathUtils.lerp(curScale, targetScale, TRASH_LERP);
    const a = MathUtils.lerp(curAlpha, targetAlpha, TRASH_LERP);
    this._scratchScale.x = s;
    this._scratchScale.y = s;
    this._scratchScale.z = s;
    this.cancelIconObj.getTransform().setLocalScale(this._scratchScale);
    this._scratchColor.a = a;
    this.cancelIconImg.mainPass.baseColor = this._scratchColor;

    // Selection fires on PINCH UP, matching the specs-hand-menu PinchMenuController pattern.
    // This covers both entry paths into SendTo:
    //   - via TRANSCRIPT_FINAL (user still holding pinch on entry, releases to confirm)
    //   - via PINCH_UP (user re-pinches then releases to confirm)
    const thumbPos = this.hand.thumbTip.position;
    const pinchDist = fingerPos.distance(thumbPos);
    const isSkeletonPinching = pinchDist < PINCH_DOWN_DISTANCE;
    if (
      !this.fingersPinched &&
      this.gestureModulePinching &&
      isSkeletonPinching
    ) {
      this.fingersPinched = true;
      this.pinchStartTime = getTime();
    } else if (
      this.fingersPinched &&
      !this.gestureModulePinching &&
      pinchDist > PINCH_UP_DISTANCE &&
      getTime() - this.pinchStartTime >= PINCH_MIN_HOLD_S
    ) {
      this.fingersPinched = false;
      if (this.hoveredAgentId !== null) {
        const text = this.transcript;
        const agentId = this.hoveredAgentId;
        this.buttonBar.setActiveAgent(agentId);
        this.stateMachine.send("SEND_SELECTED");
        this.onVoiceNoteSendTo.invoke({ agentId, transcript: text });
      } else {
        this.stateMachine.send("CANCEL_SEND");
      }
    }
  }

  // --- State effects ---

  private enterIdle(): void {
    this.animCancel.cancel();
    this.fingersPinched = false;
    this.micActivityIndicator.setVisible(false);
    this.micTooltip.setOn(false);
    this.tooltipShown = false;
    this.hideTranscriptDisplay();
    this.micObj.enabled = false;
    this.micObj.getTransform().setLocalScale(new vec3(0.01, 0.01, 0.01));
  }

  private enterReady(): void {
    this.micObj.enabled = true;
    this.animCancel.cancel();

    animate({
      cancelSet: this.animCancel,
      duration: SHOW_ANIM_DURATION,
      update: (t: number) => {
        const s = MathUtils.lerp(0.01, 1, t);
        this.micObj.getTransform().setLocalScale(new vec3(s, s, s));
      },
    });
  }

  private enterRecording(): void {
    this.transcript = "";
    this.micTooltip.setOn(false);
    this.tooltipShown = false;
    VoiceInputController.getInstance().startListening();
    this.playSfx(MIC_ON_SFX);
    this.micActivityIndicator.setVisible(true);
    this.setTranscriptDisplay(LISTENING_PLACEHOLDER, PARTIAL_TEXT_COLOR);
  }

  private exitRecording(): void {
    VoiceInputController.getInstance().stopListening();
    this.micActivityIndicator.setVisible(false);
    this.hideTranscriptDisplay();
  }

  private enterSendTo(): void {
    this.animCancel.cancel();

    // Shrink the mic button away
    animate({
      cancelSet: this.animCancel,
      duration: SHOW_ANIM_DURATION,
      update: (t: number) => {
        const s = MathUtils.lerp(1, 0.01, t);
        this.micObj.getTransform().setLocalScale(new vec3(s, s, s));
      },
      ended: () => {
        this.micObj.enabled = false;
      },
    });

    // Lock the UI in place — position and screen-space anchor are captured here
    // and held fixed for the duration of the SendTo state.
    const curPos = this.getSceneObject().getTransform().getWorldPosition();
    this.sendToLockedWorldPos = curPos;

    // Slide the recording transcript upward into the send-to message slot.
    // Both text components share identical styling, so the swap at the end is seamless.
    this.transcriptText.text = `\u201C${this.transcript}\u201D`;
    this.transcriptText.textFill.color = FINAL_TEXT_COLOR;
    const startY = TEXT_Y_ABOVE;
    const endY = BAR_OFFSET_Y + SEND_MESSAGE_Y;

    animate({
      cancelSet: this.animCancel,
      duration: SENDTO_REVEAL_DURATION,
      easing: "ease-out-cubic",
      update: (t: number) => {
        const y = MathUtils.lerp(startY, endY, t);
        this.transcriptObj.getTransform().setLocalPosition(new vec3(0, y, 0));
        const r = MathUtils.lerp(FINAL_TEXT_COLOR.r, SEND_MESSAGE_COLOR.r, t);
        const g = MathUtils.lerp(FINAL_TEXT_COLOR.g, SEND_MESSAGE_COLOR.g, t);
        const b = MathUtils.lerp(FINAL_TEXT_COLOR.b, SEND_MESSAGE_COLOR.b, t);
        this.transcriptText.textFill.color = new vec4(r, g, b, 1);
      },
      ended: () => {
        this.hideTranscriptDisplay();
        this.sendToMessageObj.enabled = true;
        this.sendToMessageText.text = `\u201C${this.transcript}\u201D`;
      },
    });

    // Fade in the header, trash icon, and button bar
    this.buttonBar.setInteractionEnabled(false);
    this.barContainer.enabled = true;
    this.sendToHeaderObj.enabled = true;
    this.sendCursorObj.enabled = !global.deviceInfoSystem.isEditor();
    this.hoveredAgentId = null;
    this.hoveringTrash = false;

    const barWidth = this.buttonBar.getVisualWidth();
    const barHeight = this.buttonBar.getVisualHeight();
    const trashX = barWidth / 2 + TRASH_GAP + TRASH_ICON_SIZE / 2;
    this.cancelIconObj
      .getTransform()
      .setLocalPosition(new vec3(trashX, -barHeight / 2, 0));
    this.cancelIconObj.getTransform().setLocalScale(vec3.one());
    this.cancelIconObj.enabled = true;

    this.sendToHeaderText.textFill.color = new vec4(1, 1, 1, 0);
    this.cancelIconImg.mainPass.baseColor = new vec4(1, 1, 1, 0);

    animate({
      cancelSet: this.animCancel,
      duration: SENDTO_REVEAL_DURATION,
      easing: "ease-out-cubic",
      update: (t: number) => {
        this.sendToHeaderText.textFill.color = new vec4(1, 1, 1, t);
        this.cancelIconImg.mainPass.baseColor = new vec4(1, 1, 1, t * 0.5);
      },
    });

    this.buttonBar.show();
    this.startDismissTimeout();
  }

  private exitSendTo(): void {
    this.clearDismissTimeout();
    this.animCancel.cancel();
    this.hideTranscriptDisplay();
    this.buttonBar.setInteractionEnabled(true);
    this.buttonBar.hide();
    this.buttonBar.setHoveredAgent(null);
    this.sendToHeaderObj.enabled = false;
    this.sendToMessageObj.enabled = false;
    this.sendToMessageText.text = "";
    this.cancelIconObj.enabled = false;
    this.hoveringTrash = false;
    this.sendCursorObj.enabled = false;
    this.hoveredAgentId = null;
    this.barContainer.enabled = false;
  }

  // --- Dismiss timeout ---

  private startDismissTimeout(): void {
    this.clearDismissTimeout();
    this.dismissHandle = setTimeout(() => {
      this.dismissHandle = null;
      if (this.stateMachine.getCurrentState() === "SendTo") {
        this.stateMachine.send("DISMISS_TIMEOUT");
      }
    }, DISMISS_TIMEOUT_MS);
  }

  private clearDismissTimeout(): void {
    if (this.dismissHandle !== null) {
      clearTimeout(this.dismissHandle);
      this.dismissHandle = null;
    }
  }

  // --- Display helpers ---

  private setTranscriptDisplay(text: string, color: vec4): void {
    this.transcriptObj.enabled = true;
    this.transcriptText.text = text;
    this.transcriptText.textFill.color = color;
  }

  private hideTranscriptDisplay(): void {
    this.transcriptObj.enabled = false;
    this.transcriptText.text = "";
    this.transcriptObj
      .getTransform()
      .setLocalPosition(new vec3(0, TEXT_Y_ABOVE, 0));
  }

  // --- Positioning ---

  private positionDevice(): void {
    const transform = this.getSceneObject().getTransform();
    const indexPos = this.hand.indexTip.position;
    const thumbPos = this.hand.thumbTip.position;
    const midpoint = vec3.lerp(indexPos, thumbPos, 0.5);

    const curPosition = transform.getWorldPosition();
    const nPosition = vec3.lerp(curPosition, midpoint, POS_LERP);
    transform.setWorldPosition(nPosition);

    const toCamera = this.camera.getWorldPosition().sub(nPosition).normalize();
    const targetRot = quat.lookAt(toCamera, vec3.up());
    const curRot = transform.getWorldRotation();
    transform.setWorldRotation(quat.slerp(curRot, targetRot, ROT_LERP));
  }

  private positionDeviceSendTo(): void {
    const transform = this.getSceneObject().getTransform();
    transform.setWorldPosition(this.sendToLockedWorldPos);
    const toCam = this.camera
      .getWorldPosition()
      .sub(this.sendToLockedWorldPos)
      .normalize();
    transform.setWorldRotation(quat.lookAt(toCam, vec3.up()));
  }

  private positionEditor(): void {
    if (!this.menuAnchor) return;

    const transform = this.getSceneObject().getTransform();
    const menuPos = this.menuAnchor.getTransform().getWorldPosition();
    const camPos = this.camera.getWorldPosition();

    const toCamera = camPos.sub(menuPos).normalize();
    const rightDir = vec3.up().cross(toCamera).normalize();

    const targetPos = menuPos.add(rightDir.uniformScale(EDITOR_MENU_RIGHT_GAP));

    const curPosition = transform.getWorldPosition();
    const delta = curPosition.sub(targetPos).length;
    if (delta > 0.01) {
      transform.setWorldPosition(vec3.lerp(curPosition, targetPos, POS_LERP));
      transform.setWorldRotation(quat.lookAt(toCamera, vec3.up()));
    }
  }

  private playSfx(track: AudioTrackAsset): void {
    this.audioComponent.audioTrack = track;
    this.audioComponent.play(1);
  }
}
