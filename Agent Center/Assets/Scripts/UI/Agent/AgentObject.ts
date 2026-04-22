import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { Agent, AgentStatus, ChatTopic } from "../../Types";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractableManipulation } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation";
import { TargetingMode } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import { RobotMeshController } from "../../../Visuals/Scripts/RobotMeshController";
import { ExplosionController } from "../../../Visuals/Scripts/ExplosionShaderController";
import { ChatSelectorObject } from "../Chat/ChatSelectorObject";
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { TextSize, TextFont } from "../Shared/TextSizes";
import {
  RobotState,
  STATUS_TO_ROBOT_STATE,
  TOPIC_STATUS_TO_ROBOT_STATE,
  toTitleCase,
} from "../Shared/RobotTypes";
import { HorizontalFrame } from "../Elements/HorizontalFrame";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

import { createImage } from "../Shared/ImageFactory";
import { SETTINGS_TEXTURE, ICON_Z_OFFSET } from "../Shared/UIConstants";
import {
  createTooltip,
  createAudioComponent,
  createText,
} from "../Shared/UIBuilders";
import { createCloneControls } from "../Shared/CloneControlsBuilder";
import { DirtyComponent } from "../Shared/DirtyComponent";

const ROBOT_DESTROY_SFX: AudioTrackAsset = requireAsset(
  "../../../Audio/robotDestroy.wav",
) as AudioTrackAsset;

const AGENT_MESH_PREFAB: ObjectPrefab = requireAsset(
  "../../../Prefabs/AgentMesh.prefab",
) as ObjectPrefab;

const MESH_HOLDER_OFFSET = new vec3(0, -4, 0);
const HOVER_PUSH_Y = 0.25;
const HOVER_ANIM_DURATION = 0.25;
const UNSELECTED_IDLE_PUSH_Y = -1.5;
const WAKE_DELAY_MS = 2500;
const DOCK_SCALE_IN_DURATION = 1.0;
const DOCK_RETURN_DURATION = 0.5;
const TYPING_LOOK_TARGET = new vec2(0, -1.2);
const DEFAULT_LOOK_TARGET = new vec2(0, 0);
const NAME_PADDING_BELOW = -1.75;
const MESH_LABEL_GAP = 2.0;
const NAME_FORWARD_Z = 6;
const NAME_FORWARD_VEC = new vec3(0, 0, NAME_FORWARD_Z);
const PLATE_INNER_SIZE = new vec2(10, 7);
const PLATE_OFFSET_Y = 10;
const PLATE_FORWARD_Z = -3;
const EXPLOSION_FORWARD_Z = 4;
const IDENTITY_ROT = quat.fromEulerAngles(0, 0, 0);

@component
export class AgentObject extends DirtyComponent {
  private robotController: RobotMeshController;
  private meshHolder: SceneObject;
  private labelContainer: SceneObject;
  private interactable: Interactable;
  private colliderShape: BoxShape;

  private agent: Agent | null = null;
  private _activeTopicId = "";
  private _topicStatus: string | null = null;
  private selected = false;
  private listening = false;
  private hovered = false;
  private _docked = true;
  private chatSelector: ChatSelectorObject;
  private settingsObj: SceneObject;
  private settingsBtn: RoundButton;
  private settingsHovered = false;
  private nameText: Text;
  private nameObj: SceneObject;
  private errorObj: SceneObject;
  private errorText: Text;
  private horizontalFrame: HorizontalFrame | null = null;
  private manipulation: InteractableManipulation | null = null;
  private billboardWeight = 0;
  private snappedYaw: quat | null = null;
  private robotBaseLocalRot: quat | null = null;
  private agentBaseLocalRot: quat | null = null;
  private lastPlatePos: vec3 | null = null;
  private hasWokenUp = false;
  private introCancels = new CancelSet();
  private dockReturnCancels = new CancelSet();
  private hoverPushCancels = new CancelSet();
  private explosionPrefab: ObjectPrefab | null = null;
  private _targetPushY = 0;
  private _currentPushY = 0;
  private _hoverAnimY = 0;
  private _targetSelectedY = UNSELECTED_IDLE_PUSH_Y;
  private _currentSelectedY = UNSELECTED_IDLE_PUSH_Y;
  private _isClone = false;
  private closeObj: SceneObject | null = null;
  private closeBtn: RoundButton | null = null;
  private closeIconImage: Image | null = null;
  private settingsTooltip: Tooltip | null = null;
  private closeTooltip: Tooltip | null = null;
  private dragTooltip: Tooltip | null = null;
  private lastRobotState: RobotState | null = null;
  private lastRobotRot: quat | null = null;
  private _lastSettingsRot: quat | null = null;
  private _lastHoverOffset = 0;
  private cachedContentTopY: number | null = null;
  private settingsInitialized = false;
  private _needsOrientToCamera = true;
  private wasDragged = false;
  private audioComponent: AudioComponent;
  private cameraTransform: Transform;
  private _cachedPlateOffset: vec3 | null = null;
  private _settingsActive = false;
  private _lastAgentName = "";
  private _lastTitleCasedName = "";
  private _agentSize = 6;

  private readonly _scratchLabelPos = new vec3(0, 0, 0);
  private readonly _scratchFlatDir = new vec3(0, 0, 0);
  private readonly _scratchMeshPos = new vec3(0, 0, 0);
  private _rootTransform: Transform;
  private _labelTransform: Transform;

  public readonly onTapped = new Event<string>();
  public readonly onTopicClicked = new Event<string>();
  public readonly onNewChatRequested = new Event<void>();
  public readonly onSettingsTapped = new Event<void>();
  public readonly onCloseRequested = new Event<void>();
  public readonly onContentTopChanged = new Event<void>();

  get docked(): boolean {
    return this._docked;
  }

  set docked(value: boolean) {
    this._docked = value;
    this.setTracking(true);
  }

  set isClone(value: boolean) {
    this._isClone = value;
    this.chatSelector.setCloneMode(value);
  }

  get isClone(): boolean {
    return this._isClone;
  }

  getManipulation(): InteractableManipulation | null {
    return this.manipulation;
  }

  onAwake(): void {
    super.onAwake();
    this.cameraTransform =
      WorldCameraFinderProvider.getInstance().getTransform();

    this.meshHolder = global.scene.createSceneObject("MeshHolder");
    this.meshHolder.setParent(this.getSceneObject());
    this.meshHolder
      .getTransform()
      .setLocalPosition(
        new vec3(
          MESH_HOLDER_OFFSET.x,
          MESH_HOLDER_OFFSET.y + this._currentSelectedY,
          MESH_HOLDER_OFFSET.z,
        ),
      );

    const meshObj = AGENT_MESH_PREFAB.instantiate(this.meshHolder);
    this.robotController = meshObj.getComponent(
      RobotMeshController.getTypeName(),
    ) as RobotMeshController;
    this.robotController.setBaseScale(vec3.one().uniformScale(this._agentSize));

    const collider = this.meshHolder.createComponent(
      "ColliderComponent",
    ) as ColliderComponent;
    collider.fitVisual = false;
    this.colliderShape = Shape.createBoxShape();
    this.colliderShape.size = vec3.one().uniformScale(this._agentSize);
    //collider.debugDrawEnabled = true;
    collider.shape = this.colliderShape;

    this.interactable = this.meshHolder.createComponent(
      Interactable.getTypeName(),
    ) as Interactable;

    this.createEvent("OnStartEvent").bind(() => {
      this.initializeInteractions();
    });

    const selectorObj = global.scene.createSceneObject("ChatSelector");
    selectorObj.setParent(this.getSceneObject());
    selectorObj.getTransform().setLocalPosition(vec3.zero());
    this.chatSelector = selectorObj.createComponent(
      ChatSelectorObject.getTypeName(),
    ) as ChatSelectorObject;
    this.chatSelector.setTrackTarget(
      this.meshHolder.getTransform(),
      () => this._agentSize / 2 + this.robotController.getCurHoverY(),
    );

    this.chatSelector.onTopicClicked.add((topicId) => {
      this.onTopicClicked.invoke(topicId);
    });
    this.chatSelector.onNewChatRequested.add(() => {
      this.onNewChatRequested.invoke(undefined);
    });

    this.labelContainer = global.scene.createSceneObject("LabelContainer");
    this.labelContainer.setParent(this.meshHolder);
    this._rootTransform = this.getSceneObject().getTransform();
    this._labelTransform = this.labelContainer.getTransform();

    this.nameText = createText({
      parent: this.labelContainer,
      name: "AgentName",
      size: TextSize.L,
      font: TextFont.SemiBold,
      color: new vec4(1, 1, 1, 1),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
    });
    this.nameObj = this.nameText.getSceneObject();

    const labelBottomY = -this._agentSize / 2 - MESH_LABEL_GAP;
    this.nameObj
      .getTransform()
      .setLocalPosition(new vec3(0, labelBottomY - NAME_PADDING_BELOW, 0));

    this.errorText = createText({
      parent: this.labelContainer,
      name: "AgentError",
      size: TextSize.S,
      font: TextFont.Medium,
      color: new vec4(1, 0.4, 0.4, 1),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(-8, 8, -1.5, 1.5),
    });
    this.errorObj = this.errorText.getSceneObject();
    this.errorObj.enabled = false;
    this.errorObj
      .getTransform()
      .setLocalPosition(
        new vec3(0, labelBottomY - NAME_PADDING_BELOW - 2.5, 0),
      );

    this.audioComponent = createAudioComponent(this.getSceneObject());

    this.initializeManipulation();
    this.initializeDragTooltip();

    this.createEvent("OnStartEvent").bind(() => {
      this.initializeSettingsButton();
      if (this._isClone) {
        this.initializeCloneButtons();
      }
    });

    this.setTracking(true);
  }

  createHorizontalFrame(): void {
    const plateObj = global.scene.createSceneObject("AgentPlate");
    plateObj.setParent(this.getSceneObject().getParent());
    plateObj
      .getTransform()
      .setWorldPosition(
        this.getSceneObject().getTransform().getWorldPosition(),
      );
    this.horizontalFrame = plateObj.createComponent(
      HorizontalFrame.getTypeName(),
    ) as HorizontalFrame;
    this.horizontalFrame.innerSize = PLATE_INNER_SIZE;
    this.horizontalFrame.showCloseButton = false;
  }

  private initializeManipulation(): void {
    this.manipulation = this.meshHolder.createComponent(
      InteractableManipulation.getTypeName(),
    ) as InteractableManipulation;
    this.manipulation.setCanRotate(false);
    this.manipulation.setCanScale(false);
  }

  private initializeDragTooltip(): void {
    this.dragTooltip = createTooltip(
      this.meshHolder,
      "Drag to detach",
      { offset: new vec3(0, this._agentSize / 2 + 2.5, 0) },
    );
  }

  showDragHoldTooltip(show: boolean): void {
    this.dragTooltip?.setOn(show);
  }

  private _isManipulating = false;

  setManipulating(manipulating: boolean): void {
    if (manipulating) {
      this.wasDragged = true;
    }
    this._isManipulating = manipulating;
    this.robotController.setManipulating(manipulating);
    this.chatSelector.setCloneMode(manipulating);
    this.setTracking(true);
  }

  getManipulationAnchorWorldPosition(): vec3 {
    return this.meshHolder.getTransform().getWorldPosition();
  }

  disableManipulation(): void {
    if (this.manipulation) {
      this.manipulation.enabled = false;
      this.manipulation = null;
    }
  }

  snapToDockedPosition(pos: vec3): void {
    this.dockReturnCancels.cancel();
    this.getSceneObject().getTransform().setLocalPosition(pos);
    this.meshHolder.getTransform().setLocalPosition(MESH_HOLDER_OFFSET);
  }

  lerpToDockedPosition(pos: vec3): void {
    this.dockReturnCancels.cancel();
    const rootTransform = this.getSceneObject().getTransform();
    const startRootPos = rootTransform.getLocalPosition();
    const meshTransform = this.meshHolder.getTransform();
    const startMeshPos = meshTransform.getLocalPosition();

    animate({
      duration: DOCK_RETURN_DURATION,
      easing: "ease-out-cubic",
      cancelSet: this.dockReturnCancels,
      update: (t: number) => {
        rootTransform.setLocalPosition(vec3.lerp(startRootPos, pos, t));
        meshTransform.setLocalPosition(
          vec3.lerp(startMeshPos, MESH_HOLDER_OFFSET, t),
        );
      },
    });
  }

  private initializeSettingsButton(): void {
    this.settingsObj = global.scene.createSceneObject("SettingsButton");
    this.settingsObj.setParent(this.labelContainer);

    this.settingsBtn = this.settingsObj.createComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;
    this.settingsBtn.setIsToggleable(true);
    this.settingsBtn.initialize();

    const buttonWidth = 3;
    const iconSize = buttonWidth / 2;
    this.settingsBtn.width = buttonWidth;

    createImage(SETTINGS_TEXTURE, {
      parent: this.settingsObj,
      name: "SettingsIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: iconSize,
    });

    this.settingsTooltip = createTooltip(this.settingsObj, "Settings", {
      hoverSource: this.settingsBtn,
    });

    this.settingsBtn.onTriggerUp.add(() => {
      this.onSettingsTapped.invoke();
    });
    this.settingsBtn.interactable.onHoverEnter.add(() => {
      this.settingsHovered = true;
    });
    this.settingsBtn.interactable.onHoverExit.add(() => {
      this.settingsHovered = false;
    });

    this.settingsObj.enabled = false;
    this.settingsInitialized = true;
    this.updateSettingsPosition();
  }

  private initializeCloneButtons(): void {
    if (!this.horizontalFrame) return;

    const controls = createCloneControls(this.horizontalFrame, {
      onClose: () => this.onCloseRequested.invoke(),
      onHoverEnter: () => {
        this.settingsHovered = true;
      },
      onHoverExit: () => {
        this.settingsHovered = false;
      },
    });

    this.closeObj = controls.closeObj;
    this.closeBtn = controls.closeBtn;
    this.closeIconImage = controls.closeIconImage;
    this.closeTooltip = controls.closeTooltip;
  }

  private initializeInteractions(): void {
    this.interactable.targetingMode = TargetingMode.All;
    this.interactable.onTriggerStart.add(() => {
      this.wasDragged = false;
      this.robotController.setPressing(true);
    });
    this.interactable.onTriggerEnd.add(() => {
      this.robotController.setPressing(false);
      if (!this.agent) return;
      if (this.wasDragged || this.manipulation?.isManipulating()) return;
      if (this.chatSelector.isConsumingInput() || this.settingsHovered) return;
      this.snapToCamera();
      this.onTapped.invoke(this.agent.id);
    });
    this.interactable.onHoverEnter.add(() => {
      this.hovered = true;
      this.robotController.setHovered(true);
      this.chatSelector.setHovered(true);
      this.updateDeactivatedSettingsVisibility();
      this.setTracking(true);
      const startY = this._hoverAnimY;
      animate({
        duration: HOVER_ANIM_DURATION,
        easing: "ease-out-cubic",
        cancelSet: this.hoverPushCancels,
        update: (t: number) => {
          this._hoverAnimY = MathUtils.lerp(startY, HOVER_PUSH_Y, t);
          this._cachedPlateOffset = null;
          this.invalidateContentTopY();
        },
      });
    });
    this.interactable.onHoverExit.add(() => {
      this.hovered = false;
      this.robotController.setHovered(false);
      this.chatSelector.setHovered(false);
      this.updateDeactivatedSettingsVisibility();
      this.setTracking(true);
      const startY = this._hoverAnimY;
      animate({
        duration: HOVER_ANIM_DURATION,
        easing: "ease-in-cubic",
        cancelSet: this.hoverPushCancels,
        update: (t: number) => {
          this._hoverAnimY = MathUtils.lerp(startY, 0, t);
          this._cachedPlateOffset = null;
          this.invalidateContentTopY();
        },
      });
    });
  }

  private getColliderBottomY(): number {
    return MESH_HOLDER_OFFSET.y - this._agentSize / 2;
  }

  private getColliderTopY(): number {
    return MESH_HOLDER_OFFSET.y + this._agentSize / 2;
  }

  protected onTrack(): void {
    if (this._needsOrientToCamera) {
      this.applyOrientToCamera();
    }

    const robotTransform = this.robotController.getTransform();
    const robotRot = robotTransform.getLocalRotation();
    const forwardOffset = robotRot.multiplyVec3(NAME_FORWARD_VEC);
    // Use getCurHoverY() (the settled lerp value) rather than getHoverOffset()
    // (which adds a continuous ±0.03-unit bob sine wave). The bob is sub-perceptual
    // for the nameplate and would otherwise prevent the tracking loop from self-idling.
    const curHoverY = this.robotController.getCurHoverY();

    this._scratchLabelPos.x = forwardOffset.x;
    this._scratchLabelPos.y = curHoverY;
    this._scratchLabelPos.z = forwardOffset.z;
    this.labelContainer.getTransform().setLocalPosition(this._scratchLabelPos);

    const rotL1 = !this.lastRobotRot
      ? Infinity
      : Math.abs(robotRot.x - this.lastRobotRot.x) +
        Math.abs(robotRot.y - this.lastRobotRot.y) +
        Math.abs(robotRot.z - this.lastRobotRot.z) +
        Math.abs(robotRot.w - this.lastRobotRot.w);

    // Fine threshold: keeps cachedContentTopY correctly invalidated.
    const rotChanged = rotL1 > 0.0001;
    // Coarse threshold: above idle eye-animation drift; allows self-idle while animation plays.
    const rotSettled = rotL1 <= 0.002;

    if (rotChanged) {
      this.lastRobotRot = robotRot;
      this.invalidateContentTopY();
      if (this.settingsInitialized) {
        const settingsRotL1 = !this._lastSettingsRot
          ? Infinity
          : Math.abs(robotRot.x - this._lastSettingsRot.x) +
            Math.abs(robotRot.y - this._lastSettingsRot.y) +
            Math.abs(robotRot.z - this._lastSettingsRot.z) +
            Math.abs(robotRot.w - this._lastSettingsRot.w);
        if (settingsRotL1 > 0.01) {
          this._lastSettingsRot = robotRot;
          this.updateSettingsPosition();
        }
      }
    }

    if (Math.abs(curHoverY - this._lastHoverOffset) > 0.0001) {
      this._lastHoverOffset = curHoverY;
      this.invalidateContentTopY();
    }

    this.updateInputPush();

    if (!this._docked && this.horizontalFrame) {
      this.followPlate();
    }

    this.updateChildBillboard();

    // Self-idle when all animated subsystems have settled.
    const inputSettled =
      Math.abs(this._currentPushY - this._targetPushY) < 0.001 &&
      Math.abs(this._hoverAnimY) < 0.001 &&
      Math.abs(this._currentSelectedY - this._targetSelectedY) < 0.001;
    const billboardSettled = !this.robotBaseLocalRot;
    const plateSettled = this._docked;
    if (inputSettled && billboardSettled && plateSettled && rotSettled) {
      this.setTracking(false);
    }
  }

  protected onFlush(_flags: number): void {}

  showError(message: string): void {
    this.errorText.text = message;
    this.errorObj.enabled = true;
  }

  clearError(): void {
    this.errorObj.enabled = false;
    this.errorText.text = "";
  }

  private quatNearEqual(a: quat, b: quat): boolean {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    return 1 - Math.abs(dot) < 0.001;
  }

  private updateChildBillboard(): void {
    const billboardAll =
      this.listening ||
      this._isManipulating ||
      (this.hovered && this._docked && !this.selected);
    if (!billboardAll && !this.robotBaseLocalRot) return;

    const robotTransform = this.robotController.getTransform();
    const lerpSpeed = 10.0 * getDeltaTime();

    if (billboardAll) {
      this.applyBillboardRotation(robotTransform, lerpSpeed, true);
    } else {
      this.restoreBillboardState(robotTransform, lerpSpeed);
    }
  }

  private applyBillboardRotation(
    robotTransform: Transform,
    lerpSpeed: number,
    billboardAll: boolean,
  ): void {
    if (!this.robotBaseLocalRot) {
      this.robotBaseLocalRot = robotTransform.getLocalRotation();
      this.agentBaseLocalRot = this._rootTransform.getLocalRotation();
    }
    const camPos = this.cameraTransform.getWorldPosition();
    const worldPos = robotTransform.getWorldPosition();
    const dir = camPos.sub(worldPos);
    this._scratchFlatDir.x = dir.x;
    this._scratchFlatDir.y = 0;
    this._scratchFlatDir.z = dir.z;
    if (this._scratchFlatDir.length <= 0.001) return;

    const targetRot = quat.lookAt(this._scratchFlatDir.normalize(), vec3.up());

    if (billboardAll) {
      this._rootTransform.setWorldRotation(
        quat.slerp(
          this._rootTransform.getWorldRotation(),
          targetRot,
          lerpSpeed,
        ),
      );
      robotTransform.setLocalRotation(
        quat.slerp(
          robotTransform.getLocalRotation(),
          this.robotBaseLocalRot,
          lerpSpeed,
        ),
      );
      this._labelTransform.setLocalRotation(
        quat.slerp(
          this._labelTransform.getLocalRotation(),
          IDENTITY_ROT,
          lerpSpeed,
        ),
      );
    } else {
      robotTransform.setWorldRotation(
        quat.slerp(robotTransform.getWorldRotation(), targetRot, lerpSpeed),
      );
      this._labelTransform.setWorldRotation(
        quat.slerp(
          this._labelTransform.getWorldRotation(),
          targetRot,
          lerpSpeed,
        ),
      );
    }
  }

  private restoreBillboardState(
    robotTransform: Transform,
    lerpSpeed: number,
  ): void {
    this._rootTransform.setLocalRotation(
      quat.slerp(
        this._rootTransform.getLocalRotation(),
        this.agentBaseLocalRot,
        lerpSpeed,
      ),
    );
    robotTransform.setLocalRotation(
      quat.slerp(
        robotTransform.getLocalRotation(),
        this.robotBaseLocalRot,
        lerpSpeed,
      ),
    );
    this._labelTransform.setLocalRotation(
      quat.slerp(
        this._labelTransform.getLocalRotation(),
        IDENTITY_ROT,
        lerpSpeed,
      ),
    );

    if (
      this.quatNearEqual(
        this._rootTransform.getLocalRotation(),
        this.agentBaseLocalRot,
      ) &&
      this.quatNearEqual(
        robotTransform.getLocalRotation(),
        this.robotBaseLocalRot,
      ) &&
      this.quatNearEqual(this._labelTransform.getLocalRotation(), IDENTITY_ROT)
    ) {
      this._rootTransform.setLocalRotation(this.agentBaseLocalRot);
      robotTransform.setLocalRotation(this.robotBaseLocalRot);
      this._labelTransform.setLocalRotation(IDENTITY_ROT);
      this.robotBaseLocalRot = null;
      this.agentBaseLocalRot = null;
    }
  }

  private followPlate(): void {
    const plateTransform = this.horizontalFrame.getSceneObject().getTransform();
    const platePos = plateTransform.getWorldPosition();
    const yawRot = this.horizontalFrame.yawRotation;
    if (!this._cachedPlateOffset) {
      this._cachedPlateOffset = new vec3(0, PLATE_OFFSET_Y, PLATE_FORWARD_Z);
    }
    const offset = yawRot.multiplyVec3(this._cachedPlateOffset);
    const worldPos = platePos.add(offset);
    this._rootTransform.setWorldPosition(worldPos);

    let isMoving = false;
    if (this.lastPlatePos) {
      isMoving = platePos.sub(this.lastPlatePos).length > 0.001;
    }
    this.lastPlatePos = platePos;

    if (isMoving) {
      this.snappedYaw = null;
    }

    const baseRot = this.snappedYaw ?? yawRot;

    const shouldBillboard = (this.hovered && !this.selected) || isMoving;
    const targetWeight = shouldBillboard ? 1.0 : 0.0;
    const lerpSpeed = 10.0 * getDeltaTime();
    this.billboardWeight = MathUtils.lerp(
      this.billboardWeight,
      targetWeight,
      lerpSpeed,
    );

    const camPos = this.cameraTransform.getWorldPosition();
    const dir = camPos.sub(worldPos);
    this._scratchFlatDir.x = dir.x;
    this._scratchFlatDir.y = 0;
    this._scratchFlatDir.z = dir.z;
    if (this._scratchFlatDir.length > 0.001 && this.billboardWeight > 0.001) {
      const billboardRot = quat.lookAt(
        this._scratchFlatDir.normalize(),
        vec3.up(),
      );
      const blendedRot = quat.slerp(
        baseRot,
        billboardRot,
        this.billboardWeight,
      );
      this._rootTransform.setWorldRotation(blendedRot);
    } else {
      this._rootTransform.setWorldRotation(baseRot);
    }
  }

  orientToCamera(): void {
    this._needsOrientToCamera = true;
    this.setTracking(true);
  }

  private applyOrientToCamera(): void {
    this._needsOrientToCamera = false;
    this._rootTransform.setLocalRotation(IDENTITY_ROT);
    this._labelTransform.setLocalRotation(IDENTITY_ROT);
  }

  private snapToCamera(): void {
    const worldPos = this.getSceneObject().getTransform().getWorldPosition();
    const camPos = this.cameraTransform.getWorldPosition();
    const dir = camPos.sub(worldPos);
    this._scratchFlatDir.x = dir.x;
    this._scratchFlatDir.y = 0;
    this._scratchFlatDir.z = dir.z;
    if (this._scratchFlatDir.length > 0.001) {
      this.snappedYaw = quat.lookAt(
        this._scratchFlatDir.normalize(),
        vec3.up(),
      );
      if (!this._docked) {
        this._rootTransform.setWorldRotation(this.snappedYaw);
      }
    }
  }

  private updateDeactivatedSettingsVisibility(): void {
    if (!this.settingsInitialized || !this.agent) return;
    if (this.agent.status !== AgentStatus.Deactivated || this.selected) return;
    this.settingsObj.enabled = this.hovered;
  }

  private updateSettingsPosition(): void {
    const namePos = this.nameObj.getTransform().getLocalPosition();
    const textRightX = this.nameText.getBoundingBox().right;
    const padding = 2.0;
    this.settingsObj
      .getTransform()
      .setLocalPosition(
        new vec3(namePos.x + textRightX + padding, namePos.y, namePos.z),
      );
  }

  setInputPushY(pushY: number): void {
    this._targetPushY = pushY;
    this.setTracking(true);
  }

  getCurrentPushY(): number {
    return this._currentPushY;
  }

  private updateInputPush(): void {
    if (this.manipulation?.isManipulating()) return;
    const inputSettled = Math.abs(this._currentPushY - this._targetPushY) < 0.001;
    const hoverSettled = Math.abs(this._hoverAnimY) < 0.001;
    const selectedSettled =
      Math.abs(this._currentSelectedY - this._targetSelectedY) < 0.001;
    if (inputSettled && hoverSettled && selectedSettled) return;

    if (!inputSettled) {
      const lerpSpeed = 10.0 * getDeltaTime();
      this._currentPushY = MathUtils.lerp(
        this._currentPushY,
        this._targetPushY,
        Math.min(lerpSpeed, 1),
      );
      this._cachedPlateOffset = null;
      this.invalidateContentTopY();
    }

    if (!selectedSettled) {
      const lerpSpeed = 6.0 * getDeltaTime();
      this._currentSelectedY = MathUtils.lerp(
        this._currentSelectedY,
        this._targetSelectedY,
        Math.min(lerpSpeed, 1),
      );
      this._cachedPlateOffset = null;
      this.invalidateContentTopY();
    }

    this._scratchMeshPos.x = MESH_HOLDER_OFFSET.x;
    this._scratchMeshPos.y =
      MESH_HOLDER_OFFSET.y + this._currentPushY + this._hoverAnimY + this._currentSelectedY;
    this._scratchMeshPos.z = MESH_HOLDER_OFFSET.z;
    this.meshHolder.getTransform().setLocalPosition(this._scratchMeshPos);
    this.chatSelector.requestRetrack();
  }

  setExplosionPrefab(prefab: ObjectPrefab): void {
    this.explosionPrefab = prefab;
  }

  setAgent(agent: Agent): void {
    const isFirstAgent = this.agent === null;
    this.agent = agent;

    if (isFirstAgent && this._isClone) {
      this.hasWokenUp = true;
    }

    this.updateVisuals();

    if (isFirstAgent) {
      if (this._docked) {
        const rootTransform = this.getSceneObject().getTransform();
        const fullScale = rootTransform.getLocalScale();
        rootTransform.setLocalScale(vec3.zero());

        animate({
          duration: DOCK_SCALE_IN_DURATION,
          easing: "ease-out-cubic",
          cancelSet: this.introCancels,
          update: (t: number) => {
            rootTransform.setLocalScale(vec3.lerp(vec3.zero(), fullScale, t));
          },
        });
      }

      if (!this._isClone) {
        setTimeout(() => {
          this.hasWokenUp = true;
          this.updateVisuals();
        }, WAKE_DELAY_MS);
      }
    }
  }

  getAgent(): Agent | null {
    return this.agent;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this._targetSelectedY = selected ? 0 : UNSELECTED_IDLE_PUSH_Y;
    this.setTracking(true);
    this.robotController.setSelected(selected);
    this.chatSelector.setSelected(selected);
    this.invalidateContentTopY();
    if (this.horizontalFrame && !this._isClone) {
      this.horizontalFrame.getSceneObject().enabled = !selected;
      if (!selected) this.horizontalFrame.setForceShow(false);
    }
    if (this.horizontalFrame && this._isClone && selected) {
      this.horizontalFrame.lerpToCamera();
    }
    if (!selected) {
      this.robotController.lookTarget = DEFAULT_LOOK_TARGET;
      this.setSettingsActive(false);
    }
    this.setCloneButtonsVisible(!selected);
    this.updateVisuals();
  }

  private setCloneButtonsVisible(visible: boolean): void {
    if (!this.horizontalFrame) return;
    if (visible) {
      if (this.closeObj)
        this.horizontalFrame.unsuppressManagedObject(this.closeObj);
    } else {
      if (this.closeObj)
        this.horizontalFrame.suppressManagedObject(this.closeObj);
    }
  }

  setChatSelectorVisible(visible: boolean): void {
    this.chatSelector.getSceneObject().enabled = visible;
  }

  setTyping(typing: boolean): void {
    this.robotController.lookTarget = typing
      ? TYPING_LOOK_TARGET
      : DEFAULT_LOOK_TARGET;
  }

  setListening(listening: boolean): void {
    this.listening = listening;
    this.setTracking(true);
    this.updateVisuals();
  }

  setTheme(themeKey: string): void {
    this.robotController.setTheme(
      themeKey as "cat" | "owl" | "ghost" | "axolotl" | "crt" | "robot",
    );
  }

  setSettingsActive(active: boolean): void {
    if (active === this._settingsActive) return;
    this._settingsActive = active;
    this.settingsBtn?.toggle(active);
    this.chatSelector.setSettingsActive(active);
  }

  setActiveTopic(topicId: string): void {
    this._activeTopicId = topicId;
  }

  getActiveTopic(): string {
    return this._activeTopicId;
  }

  setTopicStatus(status: string | null): void {
    this._topicStatus = status;
    this.updateVisuals();
  }

  setTopics(
    topics: ChatTopic[],
    activeTopicId: string,
    unreadTopicIds: Set<string>,
  ): void {
    this._activeTopicId = activeTopicId;
    this.chatSelector.setTopics(topics, activeTopicId, unreadTopicIds);
    this.invalidateContentTopY();
  }

  updateTopicList(topics: ChatTopic[], unreadTopicIds: Set<string>): void {
    this.chatSelector.setTopics(topics, this._activeTopicId, unreadTopicIds);
    this.invalidateContentTopY();
  }

  setConversationsLoading(loading: boolean): void {
    this.chatSelector.setLoading(loading);
  }

  destroy(): void {
    this.introCancels.cancel();
    this.dockReturnCancels.cancel();
    this.hoverPushCancels.cancel();
    if (this.manipulation) {
      this.manipulation.enabled = false;
    }

    const destroyCancels = new CancelSet();

    this.audioComponent.audioTrack = ROBOT_DESTROY_SFX;
    this.audioComponent.play(1);

    this.spawnExplosion();
    this.robotController.getSceneObject().enabled = false;
    this.chatSelector.setExpanded(false);
    this.chatSelector.getSceneObject().enabled = false;
    if (this.settingsInitialized) {
      this.settingsObj.enabled = false;
    }
    this.nameObj.enabled = false;
    this.errorObj.enabled = false;
    if (this.closeObj) this.closeObj.enabled = false;

    if (this.horizontalFrame) {
      const frameObj = this.horizontalFrame.getSceneObject();
      const frameTransform = frameObj.getTransform();
      const frameStartScale = frameTransform.getLocalScale();
      const frameEndScale = vec3.zero();

      animate({
        duration: 0.15,
        easing: "ease-in-cubic",
        cancelSet: destroyCancels,
        update: (t: number) => {
          frameTransform.setLocalScale(
            vec3.lerp(frameStartScale, frameEndScale, t),
          );
        },
        ended: () => {
          frameObj.enabled = false;
          this.destroySceneObjects();
        },
      });
    } else {
      this.destroySceneObjects();
    }
  }

  private destroySceneObjects(): void {
    this.chatSelector.destroyScrollWindow();
    this.horizontalFrame?.getSceneObject().destroy();
    this.getSceneObject().destroy();
  }

  private spawnExplosion(): void {
    if (!this.explosionPrefab) return;

    const robotTransform = this.robotController.getTransform();
    const robotWorldPos = robotTransform.getWorldPosition();
    const robotWorldRot = robotTransform.getWorldRotation();
    const forwardOffset = robotWorldRot.multiplyVec3(
      new vec3(0, 0, EXPLOSION_FORWARD_Z),
    );
    const explosionWorldPos = robotWorldPos.add(forwardOffset);

    const holder = global.scene.createSceneObject("ExplosionHolder");
    holder.setParent(this.getSceneObject().getParent());
    holder.getTransform().setWorldPosition(explosionWorldPos);
    holder.getTransform().setWorldRotation(robotWorldRot);

    const explosionObj = this.explosionPrefab.instantiate(holder);

    const controller = explosionObj.getComponent(
      ExplosionController.getTypeName(),
    ) as ExplosionController;
    controller.triggerExplosion();

    const duration = controller.animationDuration;
    setTimeout(() => {
      holder.destroy();
    }, duration * 1000);
  }

  getHorizontalFrame(): HorizontalFrame | null {
    return this.horizontalFrame;
  }

  getRobotTransform(): Transform {
    return this.robotController.getTransform();
  }

  getRobotLocalPosition(): vec3 {
    return MESH_HOLDER_OFFSET;
  }

  getHoverOffset(): number {
    return this.robotController.getHoverOffset();
  }

  getCurHoverY(): number {
    return this.robotController.getCurHoverY();
  }

  getVisualTopWorldY(): number {
    return this.robotController.getVisualTopWorldY();
  }

  getVisualBottomWorldY(): number {
    return this.robotController.getVisualBottomWorldY();
  }

  getVisualBottomLocalY(): number {
    return this.getColliderBottomY() - MESH_LABEL_GAP;
  }

  private invalidateContentTopY(): void {
    this.cachedContentTopY = null;
    this.onContentTopChanged.invoke(undefined);
  }

  getContentTopLocalY(): number {
    if (this.cachedContentTopY !== null) {
      return this.cachedContentTopY;
    }
    const selectorLocalY = this.chatSelector
      .getSceneObject()
      .getTransform()
      .getLocalPosition().y;
    this.cachedContentTopY =
      selectorLocalY + this.chatSelector.getPlateHeight();
    return this.cachedContentTopY;
  }

  getSelectorCenterLocalY(): number {
    const selectorLocalY = this.chatSelector
      .getSceneObject()
      .getTransform()
      .getLocalPosition().y;
    return selectorLocalY + this.chatSelector.getPlateHeight() / 2;
  }

  getChatSelector(): ChatSelectorObject {
    return this.chatSelector;
  }

  getContentTopWorldY(): number {
    const selectorLocalY = this.chatSelector
      .getSceneObject()
      .getTransform()
      .getLocalPosition().y;
    const localTopY = selectorLocalY + this.chatSelector.getPlateHeight();
    const agentTransform = this.getSceneObject().getTransform();
    return (
      agentTransform.getWorldPosition().y +
      localTopY * agentTransform.getWorldScale().y
    );
  }

  private updateVisuals(): void {
    if (!this.agent) return;

    if (this.agent.name !== this._lastAgentName) {
      this._lastAgentName = this.agent.name;
      this._lastTitleCasedName = toTitleCase(this.agent.name);
    }
    if (this.nameText.text !== this._lastTitleCasedName) {
      this.nameText.text = this._lastTitleCasedName;
    }

    const agentUnavailable =
      this.agent.status === AgentStatus.Offline ||
      this.agent.status === AgentStatus.Sleeping ||
      this.agent.status === AgentStatus.Deactivated;

    this.chatSelector.setOffline(agentUnavailable);

    let baseState: RobotState;
    if (agentUnavailable) {
      baseState = STATUS_TO_ROBOT_STATE[this.agent.status];
    } else if (
      this._topicStatus &&
      TOPIC_STATUS_TO_ROBOT_STATE[this._topicStatus]
    ) {
      baseState = TOPIC_STATUS_TO_ROBOT_STATE[this._topicStatus];
    } else {
      // Active topic has no status (e.g. New Chat). Don't reflect Working here —
      // that state comes from a different topic, not the active one.
      const effectiveStatus =
        this.agent.status === AgentStatus.Working
          ? AgentStatus.Idle
          : this.agent.status;
      baseState = STATUS_TO_ROBOT_STATE[effectiveStatus];
    }
    const robotState: RobotState =
      this.listening && baseState === "idle" ? "listening" : baseState;

    if (!this.hasWokenUp) {
      if (robotState === "error") {
        this.hasWokenUp = true;
        this.robotController.setRobotState("error");
        this.lastRobotState = robotState;
        return;
      }
      if (robotState === "connecting") {
        this.robotController.setRobotState("connecting");
        this.lastRobotState = robotState;
        return;
      }
      this.robotController.setRobotState("sleeping");
      return;
    }

    if (this.lastRobotState === "connecting" && robotState !== "connecting") {
      this.hasWokenUp = true;
    }

    if (this.settingsInitialized) {
      const deactivated = this.agent.status === AgentStatus.Deactivated;
      this.settingsObj.enabled = this.selected || (this.hovered && deactivated);
    }

    if (robotState !== this.lastRobotState) {
      this.lastRobotState = robotState;
      this.robotController.setRobotState(robotState);
    }
  }
}
