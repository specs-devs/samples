import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { AgentStatus } from "../Types";
import { AgentStore } from "../State/AgentStore";
import { VoiceInputController } from "../Input/VoiceInputController";
import { InputBarController } from "./Input/InputBarController";
import { AgentWorldView } from "./Agent/AgentWorldView";
import { AgentObject } from "./Agent/AgentObject";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { MIN_SCALE, ANIM_DURATION } from "./Shared/UIConstants";
import { createAudioComponent } from "./Shared/UIBuilders";
import { BLEKeyboardManager } from "../Bluetooth/BLEKeyboardManager";

const INPUT_BAR_PREFAB: ObjectPrefab = requireAsset(
  "../../Prefabs/InputBar.prefab",
) as ObjectPrefab;

const MIC_ON_SFX: AudioTrackAsset = requireAsset(
  "../../Audio/audioInputOn.wav",
) as AudioTrackAsset;
const MIC_OFF_SFX: AudioTrackAsset = requireAsset(
  "../../Audio/audioInputOff.wav",
) as AudioTrackAsset;
const INPUT_RECEIVED_SFX: AudioTrackAsset = requireAsset(
  "../../Audio/inputRecieved.wav",
) as AudioTrackAsset;

const PADDING_BELOW_VISUAL = 2;
const PADDING_BELOW_VISUAL_FRAMED = 3;
const PADDING_BELOW_VISUAL_CLONE = 0;
const PADDING_FORWARD = 8;
const FRAME_INTERSECT_Z = 4;
const CLONE_FRAME_Z = 8;
const TILT_X_DEG = -50;
const SCALE_DELAY = 0.1;
const PARTIAL_TEXT_COLOR = new vec4(0.6, 0.6, 0.6, 1);
const FINAL_TEXT_COLOR = new vec4(1, 1, 1, 1);
const DEFAULT_PROMPT = "Describe a task...";

export interface TaskSubmission {
  agentId: string;
  prompt: string;
  images?: Texture[];
}

export interface StopRequest {
  agentId: string;
}

export class AgentInputBar {
  private store: AgentStore;
  private worldView: AgentWorldView;
  private controller: InputBarController;
  private sceneObject: SceneObject;
  private currentAgentId: string | null = null;
  private textBuffer = "";
  private isRecording = false;
  private fullScale: vec3;
  private animCancels = new CancelSet();
  private isVisible = false;
  private isAnimatingPos = false;
  private originalParent: SceneObject;
  private currentAgent: AgentObject | null = null;
  private isCameraActive = false;
  private previewedImageIndex = -1;
  private _settingsMode = false;
  private baselineInputHeight = 0;
  private lastPushY = 0;
  private lastRobotPosX = Infinity;
  private lastRobotPosZ = Infinity;
  private lastBottomY = Infinity;
  private lastTrackedPushY = 0;
  private audioComponent: AudioComponent;
  private positionUpdateEvent: SceneEvent;

  public readonly onTaskSubmitted = new Event<TaskSubmission>();
  public readonly onStopRequested = new Event<StopRequest>();
  public readonly onCameraToggled = new Event<boolean>();
  public readonly onCaptureGestureStarted = new Event<void>();
  public readonly onInputBarShown = new Event<void>();
  public readonly onInputBarHidden = new Event<void>();
  public readonly onRecordingChanged = new Event<boolean>();

  constructor(
    store: AgentStore,
    worldView: AgentWorldView,
    parent: SceneObject,
  ) {
    this.store = store;
    this.worldView = worldView;
    this.originalParent = parent;

    this.sceneObject = INPUT_BAR_PREFAB.instantiate(parent);
    this.controller = this.sceneObject.getComponent(
      InputBarController.getTypeName(),
    ) as InputBarController;

    this.fullScale = this.sceneObject.getTransform().getLocalScale();
    this.sceneObject
      .getTransform()
      .setLocalScale(new vec3(MIN_SCALE, MIN_SCALE, MIN_SCALE));

    this.audioComponent = createAudioComponent(this.sceneObject);

    this.controller.onMicTapped.add(() => this.toggleMic());
    this.controller.onCameraTapped.add(() => this.toggleCamera());
    this.controller.onSendTapped.add(() => this.submit());
    this.controller.onStopTapped.add(() => this.requestStop());
    this.controller.onCaptureGestureStarted.add(() => {
      this.onCaptureGestureStarted.invoke();
    });

    this.controller.onPreviewImageTapped.add((index: number) => {
      const captureController = this.controller.getCaptureController();
      if (!captureController) return;
      const images = this.controller.getPendingImages();
      if (index >= 0 && index < images.length) {
        this.previewedImageIndex = index;
        const worldPos = this.controller.getPreviewWorldPosition(index);
        captureController.previewTexture(images[index], worldPos ?? undefined);
      }
    });

    this.controller.onPreviewImageDeleted.add(() => {
      if (this.previewedImageIndex >= 0) {
        this.controller.removePendingImage(this.previewedImageIndex);
        this.previewedImageIndex = -1;
      }
    });

    this.store.onAgentStatusChanged.add(({ agentId }) => {
      if (agentId !== this.currentAgentId) return;
      this.controller.setStopMode(this.isActiveTopicWorking());
    });

    this.store.onTopicSelected.add(({ agentId }) => {
      if (agentId !== this.currentAgentId) return;
      this.controller.setStopMode(this.isActiveTopicWorking());
    });

    this.store.onTopicsChanged.add(({ agentId }) => {
      if (agentId !== this.currentAgentId) return;
      this.controller.setStopMode(this.isActiveTopicWorking());
    });

    this.store.onAgentSelected.add((agent) => {
      if (agent) {
        const unavailable =
          agent.status === AgentStatus.Offline ||
          agent.status === AgentStatus.Sleeping ||
          agent.status === AgentStatus.Deactivated;

        if (unavailable) {
          this.currentAgentId = null;
          this.stopRecording();
          this.resetCamera();
          this.controller.clearPendingImages();
          this.controller.setBleFocus(false);
          this.animateHide();
          this.controller.setText("");
          return;
        }

        this.currentAgentId = agent.id;
        this.textBuffer = "";
        this.controller.setStopMode(this.isActiveTopicWorking());
        this.controller.setBleFocus(true);
        this.refresh();
        this.attachToAgent(agent.id);
        this.animateShow();
      } else {
        this.currentAgentId = null;
        this._settingsMode = false;
        this.stopRecording();
        this.resetCamera();
        this.controller.clearPendingImages();
        this.controller.setBleFocus(false);
        this.animateHide();
        this.controller.setText("");
      }
    });

    VoiceInputController.getInstance().onTranscript.add((text) => {
      if (!this.currentAgentId || !this.isRecording) return;
      this.controller.stopListeningAnimation();
      this.textBuffer = text;
      this.stopRecording();
      this.controller.setText(text);
      this.controller.setTextColor(FINAL_TEXT_COLOR);
      this.controller.setSendEnabled(text.trim().length > 0);
    });

    VoiceInputController.getInstance().onPartialTranscript.add((text) => {
      if (!this.currentAgentId || !this.isRecording) return;
      this.controller.stopListeningAnimation();
      this.textBuffer = text;
      this.controller.setText(text);
      this.controller.setTextColor(PARTIAL_TEXT_COLOR);
    });

    this.controller.onEditModeChanged.add((editing: boolean) => {
      if (!this.currentAgentId) return;
      if (editing) this.stopRecording();
      if (!editing) {
        const typed = this.controller.getText().trim();
        const hasContent = typed.length > 0;
        this.textBuffer = hasContent ? typed : "";
        this.controller.setSendEnabled(hasContent);
        if (!hasContent) {
          this.refresh();
        }
      }
      this.worldView.setAgentTyping(this.currentAgentId, editing);
    });

    this.controller.onHeightChanged.add((totalHeight: number) =>
      this.handleHeightChanged(totalHeight),
    );

    this.positionUpdateEvent = this.controller.createEvent("UpdateEvent");
    this.positionUpdateEvent.bind(() => this.onUpdate());
    this.positionUpdateEvent.enabled = false;
  }

  submitText(text: string): void {
    if (!this.currentAgentId) return;
    this.textBuffer = text;
    this.controller.setText(text);
    this.submit();
  }

  prefillText(text: string): void {
    if (this.baselineInputHeight === 0) {
      this.baselineInputHeight = this.controller.getBaselineHeight();
    }
    this.textBuffer = text;
    this.controller.setText(text);
    this.controller.setTextColor(FINAL_TEXT_COLOR);
  }

  connectBLEKeyboard(manager: BLEKeyboardManager): void {
    this.controller.connectBLEKeyboard(manager);
  }

  get isTextInputActive(): boolean {
    return this.controller.isTextInputActive;
  }

  setSettingsMode(active: boolean): void {
    if (this._settingsMode === active) return;
    this._settingsMode = active;
    if (active) {
      this.stopRecording();
      this.animateHide();
    } else if (this.currentAgentId) {
      this.attachToAgent(this.currentAgentId);
      this.animateShow();
    }
  }

  toggleMic(): void {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
    this.refresh();
  }

  private toggleCamera(): void {
    this.isCameraActive = !this.isCameraActive;
    this.controller.setCameraActive(this.isCameraActive);
    this.onCameraToggled.invoke(this.isCameraActive);
  }

  private resetCamera(): void {
    if (!this.isCameraActive) return;
    this.isCameraActive = false;
    this.controller.setCameraActive(false);
    this.onCameraToggled.invoke(false);
  }

  private startRecording(): void {
    this.isRecording = true;
    VoiceInputController.getInstance().startListening();
    this.controller.setMicActive(true);
    this.controller.setTextInputEnabled(false);
    this.playSfx(MIC_ON_SFX);
    this.onRecordingChanged.invoke(true);
    if (this.currentAgentId) {
      this.worldView.setAgentListening(this.currentAgentId, true);
    }
  }

  private stopRecording(): void {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.controller.stopListeningAnimation();
    VoiceInputController.getInstance().stopListening();
    this.controller.setMicActive(false);
    this.controller.setTextInputEnabled(true);
    this.playSfx(MIC_OFF_SFX);
    this.onRecordingChanged.invoke(false);
    if (this.currentAgentId) {
      this.worldView.setAgentListening(this.currentAgentId, false);
    }
  }

  private submit(): void {
    const prompt = this.controller.getText().trim();
    if (!prompt || prompt === DEFAULT_PROMPT || !this.currentAgentId) return;

    this.playSfx(INPUT_RECEIVED_SFX);

    const images = this.controller.getPendingImages();
    this.onTaskSubmitted.invoke({
      agentId: this.currentAgentId,
      prompt,
      images: images.length > 0 ? images : undefined,
    });

    this.controller.clearPendingImages();
    this.textBuffer = "";
    this.stopRecording();
    this.refresh();
  }

  private playSfx(track: AudioTrackAsset): void {
    this.audioComponent.audioTrack = track;
    this.audioComponent.play(1);
  }

  private requestStop(): void {
    if (!this.currentAgentId) return;
    this.onStopRequested.invoke({ agentId: this.currentAgentId });
  }

  private handleHeightChanged(totalHeight: number): void {
    if (!this.currentAgent || this.isAnimatingPos) return;
    if (this.baselineInputHeight === 0) {
      this.baselineInputHeight = totalHeight;
    }
    const extraHeight = Math.max(0, totalHeight - this.baselineInputHeight);
    if (Math.abs(extraHeight - this.lastPushY) > 0.001) {
      this.lastPushY = extraHeight;
      this.currentAgent.setInputPushY(extraHeight);
    }
  }

  private onUpdate(): void {
    if (!this.currentAgent || this.isAnimatingPos) return;

    if (this.baselineInputHeight === 0) {
      const totalHeight = this.controller.getTotalHeight();
      if (totalHeight > 0) {
        this.baselineInputHeight = totalHeight;
      }
    }

    const robotPos = this.currentAgent.getRobotLocalPosition();
    const bottomY = this.currentAgent.getVisualBottomLocalY();
    const previewPush = this.controller.getPreviewExtraHeight();

    if (
      Math.abs(robotPos.x - this.lastRobotPosX) > 0.0001 ||
      Math.abs(robotPos.z - this.lastRobotPosZ) > 0.0001 ||
      Math.abs(bottomY - this.lastBottomY) > 0.0001 ||
      Math.abs(previewPush - this.lastTrackedPushY) > 0.0001
    ) {
      this.lastRobotPosX = robotPos.x;
      this.lastRobotPosZ = robotPos.z;
      this.lastBottomY = bottomY;
      this.lastTrackedPushY = previewPush;
      this.sceneObject
        .getTransform()
        .setLocalPosition(this.getLocalRestingPos());
    }
  }

  private enablePositionUpdate(): void {
    if (this.positionUpdateEvent) {
      this.positionUpdateEvent.enabled = true;
    }
  }

  private attachToAgent(agentId: string): void {
    const agent = this.worldView.getAgentComponent(agentId);
    if (!agent) return;
    if (this.currentAgent) {
      this.currentAgent.setInputPushY(0);
    }
    this.baselineInputHeight = 0;
    this.currentAgent = agent;
    this.sceneObject.setParent(agent.getSceneObject());
    const transform = this.sceneObject.getTransform();
    transform.setLocalPosition(this.getLocalRestingPos());
    transform.setLocalRotation(
      quat.fromEulerAngles(MathUtils.DegToRad * TILT_X_DEG, 0, 0),
    );
    this.enablePositionUpdate();
  }

  private animateShow(): void {
    if (this.isVisible || this._settingsMode) return;
    this.isVisible = true;
    this.animCancels.cancel();
    this.controller.setEnabled(true);
    this.isAnimatingPos = true;
    this.onInputBarShown.invoke();

    if (!this.currentAgent) return;

    const transform = this.sceneObject.getTransform();
    const startPos = this.currentAgent.getRobotLocalPosition();

    transform.setLocalPosition(startPos);

    const startScale = new vec3(MIN_SCALE, MIN_SCALE, MIN_SCALE);
    transform.setLocalScale(startScale);

    animate({
      duration: ANIM_DURATION + SCALE_DELAY,
      easing: "ease-out-cubic",
      cancelSet: this.animCancels,
      update: (t: number) => {
        if (isNull(this.sceneObject)) return;
        const liveEnd = this.getLocalRestingPos();
        transform.setLocalPosition(vec3.lerp(startPos, liveEnd, t));
      },
      ended: () => {
        if (isNull(this.sceneObject)) return;
        transform.setLocalPosition(this.getLocalRestingPos());
        this.isAnimatingPos = false;
      },
    });

    setTimeout(() => {
      if (!this.isVisible) return;
      animate({
        duration: ANIM_DURATION,
        easing: "ease-out-cubic",
        cancelSet: this.animCancels,
        update: (t: number) => {
          if (isNull(this.sceneObject)) return;
          transform.setLocalScale(vec3.lerp(startScale, this.fullScale, t));
        },
        ended: () => {
          if (isNull(this.sceneObject)) return;
          transform.setLocalScale(this.fullScale);
        },
      });
    }, SCALE_DELAY * 1000);
  }

  private animateHide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.animCancels.cancel();
    this.isAnimatingPos = true;
    this.onInputBarHidden.invoke();

    const transform = this.sceneObject.getTransform();
    const startPos = transform.getLocalPosition();
    const endPos = this.currentAgent
      ? this.currentAgent.getRobotLocalPosition()
      : startPos;

    const startScale = transform.getLocalScale();
    const endScale = new vec3(MIN_SCALE, MIN_SCALE, MIN_SCALE);

    const hideDuration = ANIM_DURATION * 0.75;

    animate({
      duration: hideDuration,
      easing: "ease-in-cubic",
      cancelSet: this.animCancels,
      update: (t: number) => {
        if (isNull(this.sceneObject)) return;
        const scale = vec3.lerp(startScale, endScale, t);
        transform.setLocalScale(scale);
      },
      ended: () => {
        if (isNull(this.sceneObject)) return;
        transform.setLocalScale(endScale);
        this.controller.setEnabled(false);
      },
    });

    animate({
      duration: hideDuration,
      easing: "ease-in-cubic",
      cancelSet: this.animCancels,
      update: (t: number) => {
        if (isNull(this.sceneObject)) return;
        transform.setLocalPosition(vec3.lerp(startPos, endPos, t));
      },
      ended: () => {
        if (isNull(this.sceneObject)) return;
        transform.setLocalPosition(endPos);
        this.baselineInputHeight = 0;
        if (this.currentAgent) {
          this.currentAgent.setInputPushY(0);
        }
        this.sceneObject.setParent(this.originalParent);
        this.currentAgent = null;
        this.isAnimatingPos = false;
        this.positionUpdateEvent.enabled = false;
      },
    });
  }

  private getLocalRestingPos(): vec3 {
    if (!this.currentAgent) return vec3.zero();
    const robotPos = this.currentAgent.getRobotLocalPosition();
    const bottomY = this.currentAgent.getVisualBottomLocalY();
    const frame = this.currentAgent.getHorizontalFrame();
    if (frame) {
      const zOffset = this.currentAgent.isClone ? CLONE_FRAME_Z : FRAME_INTERSECT_Z;
      const yPadding = this.currentAgent.isClone ? PADDING_BELOW_VISUAL_CLONE : PADDING_BELOW_VISUAL_FRAMED;
      return new vec3(
        robotPos.x,
        bottomY - yPadding,
        zOffset,
      );
    }
    const previewPush = this.controller.getPreviewExtraHeight();
    return new vec3(
      robotPos.x,
      bottomY - PADDING_BELOW_VISUAL + previewPush,
      robotPos.z + PADDING_FORWARD,
    );
  }

  private isActiveTopicWorking(): boolean {
    if (!this.currentAgentId) return false;
    const topic = this.store.getActiveTopic(this.currentAgentId);
    const status = topic?.metadata?.status;
    return status === "CREATING" || status === "RUNNING";
  }

  private refresh(): void {
    if (this.isRecording) {
      this.controller.startListeningAnimation();
      this.controller.setTextColor(PARTIAL_TEXT_COLOR);
      return;
    }
    this.controller.stopListeningAnimation();
    const hasText = this.textBuffer.length > 0;
    if (hasText) {
      this.controller.setText(this.textBuffer);
      this.controller.setTextColor(FINAL_TEXT_COLOR);
    } else {
      this.controller.showPlaceholderText(DEFAULT_PROMPT);
    }
    this.controller.setSendEnabled(hasText);
  }
}
