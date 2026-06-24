import { CameraService } from "../../../Utils/CameraService";
import { createAudioComponent } from "../../../UI/Shared/UIBuilders";
import { CropRegion } from "../Core/CropRegion";
import { UIController } from "../UI/UIController";
import { UIElement } from "../UI/UIElement";
import { InteractionController } from "./InteractionController";

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { CaptureStateMachine } from "../UI/CaptureStateMachine";
import { CornerController } from "./CornerController";
import {
  Interactor,
  InteractorInputType,
} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import { InteractionManager } from "SpectaclesInteractionKit.lspkg/Core/InteractionManager/InteractionManager";
import { CropGestureFrame } from "../UI/CropGestureFrame";
import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame";

const CAPTURE_SFX: AudioTrackAsset = requireAsset(
  "../../../../Audio/capture_photo.mp3",
) as AudioTrackAsset;

const EDITOR_PLACE_DISTANCE = 110; // cm
const EDITOR_SIZE = 35; // cm
const PREVIEW_SIZE = 25; // cm
const PREVIEW_FORWARD_OFFSET = 10; // cm toward camera

@component
export class CaptureController extends BaseScriptComponent {
  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Both", "both"),
      new ComboBoxItem("Double Hand", "double"),
      new ComboBoxItem("Single Hand", "single"),
    ]),
  )
  gestureMode: string = "both";

  @input picAnchorObj: SceneObject;

  private uiController: UIController;
  private cornerController: CornerController;
  private cropRegion: CropRegion;
  private cropGestureFrame: CropGestureFrame;
  private interactionController: InteractionController;

  private camTrans: Transform;
  private picAnchorTrans: Transform;

  private isGestureActive: boolean = false;
  private isPreviewMode: boolean = false;

  private stateMachine: CaptureStateMachine;
  private audioComponent: AudioComponent;

  public readonly onInitialized = new Event();
  public readonly onImageCaptured = new Event<Texture>();
  public readonly onImageAttached = new Event<Texture>();
  public readonly onGestureStarted = new Event();
  public readonly onPreviewDeleted = new Event<void>();

  protected mouseInteractor: Interactor = null;

  onAwake() {
    const root = this.getSceneObject();

    const cornerObj = global.scene.createSceneObject("Corners");
    cornerObj.setParent(root);
    this.cornerController = cornerObj.createComponent(
      CornerController.getTypeName(),
    ) as CornerController;

    const topLeft = global.scene.createSceneObject("TopLeft");
    topLeft.setParent(cornerObj);
    const topRight = global.scene.createSceneObject("TopRight");
    topRight.setParent(cornerObj);
    const bottomLeft = global.scene.createSceneObject("BottomLeft");
    bottomLeft.setParent(cornerObj);
    const bottomRight = global.scene.createSceneObject("BottomRight");
    bottomRight.setParent(cornerObj);

    this.cornerController.topLeftObj = topLeft;
    this.cornerController.topRightObj = topRight;
    this.cornerController.bottomLeftObj = bottomLeft;
    this.cornerController.bottomRightObj = bottomRight;

    this.interactionController = root.createComponent(
      InteractionController.getTypeName(),
    ) as InteractionController;

    const cropRegionObj = global.scene.createSceneObject("CropRegion");
    cropRegionObj.setParent(root);
    this.cropRegion = cropRegionObj.createComponent(
      CropRegion.getTypeName(),
    ) as CropRegion;

    const uiObj = global.scene.createSceneObject("UIController");
    uiObj.setParent(root);
    this.uiController = uiObj.createComponent(
      UIController.getTypeName(),
    ) as UIController;
    this.uiController.picAnchorObj = this.picAnchorObj;

    const loadingObj = global.scene.createSceneObject("Loading");
    loadingObj.setParent(uiObj);
    const loading = loadingObj.createComponent(
      UIElement.getTypeName(),
    ) as UIElement;
    loading.anchorObj = this.picAnchorObj;
    loading.anchor = new vec2(0, -0.5);
    loading.offsetCM = new vec3(0, -2, 0);
    loading.initializeAnchor();
    this.uiController.loading = loading;

    const frameObj = global.scene.createSceneObject("CropGestureFrame");
    frameObj.setParent(root);
    const frame = frameObj.createComponent(Frame.getTypeName()) as Frame;
    frame.initialize();
    this.cropGestureFrame = frameObj.createComponent(
      CropGestureFrame.getTypeName(),
    ) as CropGestureFrame;
    this.cropGestureFrame.picAnchorObj = this.picAnchorObj;
    this.cropGestureFrame.captureController = this;

    this.cropGestureFrame.onDeletePressed.add(() => {
      if (this.isPreviewMode) {
        this.onPreviewDeleted.invoke();
        this.closePreview();
        return;
      }
      this.closeCaptureGesture();
    });

    this.cropGestureFrame.onAttachPressed.add(() => {
      if (this.isPreviewMode) {
        this.closePreview();
        return;
      }
      const texture = this.uiController.getCapturedTexture();
      if (texture) {
        this.onImageAttached.invoke(texture);
      }
      this.resetCapture();
    });

    this.audioComponent = createAudioComponent(this.getSceneObject());

    this.setupDebugTapEvent();
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  private setupDebugTapEvent() {
    if (global.deviceInfoSystem.isEditor()) {
      this.mouseInteractor =
        InteractionManager.getInstance().getInteractorsByType(
          InteractorInputType.Mouse,
        )[0] as Interactor;
      const tapEvent = this.createEvent("TapEvent");
      tapEvent.bind(() => {
        if (!isNull(this.mouseInteractor.currentInteractable)) {
          return;
        }
        this.placeInEditorAndCapture();
      });
    }
  }

  private initializeControllers() {
    this.cornerController.initializeTransforms();
    this.cropRegion.initializeWithSceneObjects(
      this.cornerController.getCornerObjects(),
    );

    this.interactionController.initialize(
      this.cropRegion,
      this.cornerController,
    );

    this.uiController.initialize(
      this.cropRegion,
      this.interactionController,
      this.cornerController,
    );

    this.picAnchorTrans = this.picAnchorObj.getTransform();
    this.picAnchorTrans.setLocalScale(vec3.zero());

    this.interactionController.mode = this.gestureMode;
    this.interactionController.createGestureHandlers(this.cornerController);
    this.interactionController.setTransforms(this.picAnchorTrans);

    this.setupControllerEvents();
  }

  private setupControllerEvents() {
    this.interactionController.onGestureStarted.add(() => {
      this.isGestureActive = true;
      this.onGestureStarted.invoke();
      if (this.stateMachine) {
        this.stateMachine.send("GESTURE_STARTED");
      }
    });

    this.interactionController.onCaptureTriggered.add(() => {
      if (this.stateMachine) {
        this.stateMachine.send("CAPTURE_REQUESTED");
      }
    });

    this.interactionController.onGestureCompleted.add(() => {
      this.isGestureActive = false;
      if (this.stateMachine) {
        this.stateMachine.send("GESTURE_COMPLETED");
      }
    });

    this.interactionController.onGestureCanceled.add(() => {
      this.isGestureActive = false;
      this.resetCapture();
      if (this.stateMachine) {
        this.stateMachine.send("GESTURE_CANCELED");
      }
    });

    this.interactionController.onResetTriggered.add(() => {
      if (this.stateMachine) {
        this.stateMachine.send("RESET");
      }
    });

    this.interactionController.onCloseTriggered.add(() => {
      this.isGestureActive = false;
      this.resetCapture();
      if (this.stateMachine) {
        this.stateMachine.send("CLOSE");
      }
    });
  }

  private onStart() {
    this.initializeControllers();
    CameraService.getInstance().waitForInitialization(() => {
      this.initializeWithCamera();
    });
  }

  private initializeWithCamera() {
    try {
      this.camTrans = CameraService.getInstance()
        .getMainCamera()
        .getSceneObject()
        .getTransform();

      this.uiController.onStart();
      this.interactionController.onStart(this.camTrans);

      this.stateMachine = new CaptureStateMachine({
        onEnterIdle: () => {
          this.uiController.setCaptureToLiveCrop();
          this.interactionController.reset();
        },
        onEnterGesturing: () => {
          this.resetCapture();
          this.uiController.setCaptureToLiveCrop();
        },
        onEnterCaptured: () => {
          this.audioComponent.audioTrack = CAPTURE_SFX;
          this.audioComponent.play(1);
          this.cropGestureFrame.openFrame();
          const cropTexture = this.cropRegion.getCropTexture();
          if (cropTexture) {
            this.onImageCaptured.invoke(cropTexture);
          }
        },
        onEnterClosing: () => {
          this.uiController.closeWindow(() => {
            this.resetCapture();
            if (this.stateMachine) {
              this.stateMachine.send("RESET");
            }
          });
        },
        onStateChanged: (state) => {
          this.uiController.setUIState(state);
        },
      });

      this.onInitialized.invoke();

      if (this.stateMachine) {
        this.stateMachine.enter("Idle");
      }
    } catch (error) {
      print("CaptureController: Error during initialization - " + error);
    }
  }

  public closeCaptureGesture() {
    this.uiController.closeWindow(() => {
      this.resetCapture();
    });
  }

  private resetCapture() {
    this.cropGestureFrame.closeFrame();
    this.uiController.reset();
    this.uiController.setCaptureToLiveCrop();
    this.interactionController.reset();
    this.picAnchorTrans.setLocalScale(vec3.zero());
  }

  public placeInEditorAndCapture() {
    if (this.stateMachine) {
      this.stateMachine.send("TRIGGER_GESTURE");
    }

    this.uiController.placeInEditor(
      this.camTrans,
      EDITOR_PLACE_DISTANCE,
      EDITOR_SIZE,
    );
    this.interactionController.triggerGestureStarted();

    const delayedEvent = this.createEvent("DelayedCallbackEvent");
    delayedEvent.bind(() => {
      this.interactionController.triggerGestureCompleted();
    });
    delayedEvent.reset(0.1);
  }

  public previewTexture(texture: Texture, worldPosition?: vec3): void {
    if (!this.camTrans) return;
    this.isPreviewMode = true;

    let position: vec3;
    let rotation: quat;
    let size: number;

    if (worldPosition) {
      const camFwd = this.camTrans.forward;
      const flatFwd = new vec3(camFwd.x, 0, camFwd.z).normalize();
      position = worldPosition.add(
        flatFwd.uniformScale(PREVIEW_FORWARD_OFFSET),
      );
      rotation = quat.lookAt(flatFwd, vec3.up());
      size = PREVIEW_SIZE;
    } else {
      position = this.camTrans
        .getWorldPosition()
        .add(this.camTrans.forward.uniformScale(-EDITOR_PLACE_DISTANCE));
      rotation = quat.lookAt(this.camTrans.forward, vec3.up());
      size = EDITOR_SIZE;
    }

    this.uiController.updatePicAnchorWithPose(
      position,
      rotation,
      new vec2(size, size),
    );

    const rendMesh = this.picAnchorObj.getComponent(
      "RenderMeshVisual",
    ) as RenderMeshVisual;
    if (rendMesh) {
      const mat = rendMesh.mainMaterial;
      mat.mainPass.cropImageTex = texture;
      mat.mainPass.ShowImage = true;
    }

    this.cropGestureFrame.openFrame();
  }

  private closePreview(): void {
    this.isPreviewMode = false;
    this.cropGestureFrame.closeFrame().then(() => {
      this.uiController.closeWindow(() => {
        this.picAnchorTrans.setLocalScale(vec3.zero());
      });
    });
  }
}
