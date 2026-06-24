import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { CornerController } from "../Controllers/CornerController";
import { InteractionController } from "../Controllers/InteractionController";
import { CropRegion } from "../Core/CropRegion";
import { UIElement } from "./UIElement";

@component
export class UIController extends BaseScriptComponent {
  public picAnchorObj: SceneObject;
  public loading: UIElement;

  private captureRendMesh: RenderMeshVisual;
  private cornerController: CornerController;
  private cropRegion: CropRegion;
  private interactionController: InteractionController;

  public onResultsShown = new Event();
  public onErrorShown = new Event();
  public readonly onInitialized = new Event();
  public readonly onStateChanged = new Event<string>();

  private currentState: string = "Idle";
  private picAnchorTrans: Transform;
  private isCaptureActive: boolean = false;

  public initialize(
    cropRegion: CropRegion,
    interactionController: InteractionController,
    cornerController?: CornerController,
  ) {
    this.cropRegion = cropRegion;
    this.cornerController = cornerController;
    this.interactionController = interactionController;

    this.picAnchorTrans = this.picAnchorObj.getTransform();
    this.captureRendMesh = this.picAnchorObj.getComponent("RenderMeshVisual");

    if (interactionController) {
      interactionController.onGestureStarted.add(() => {
        this.setCaptureToLiveCrop();
      });

      interactionController.onGesturePoseUpdated.add(
        (poseData: { position: vec3; rotation: quat; scale: vec2 }) => {
          this.updatePicAnchorWithPose(
            poseData.position,
            poseData.rotation,
            poseData.scale,
          );
        },
      );

      this.interactionController.onGestureCompleted.add(() => {
        this.isCaptureActive = true;
        this.setCaptureTexture("static");
        this.loading.openElement();
      });
    }
  }

  public onStart() {
    this.onInitialized.invoke();
  }

  public setUIState(state: string) {
    this.currentState = state;
    this.onStateChanged.invoke(state);
  }

  public getUIState(): string {
    return this.currentState;
  }

  public placeInEditor(camTrans: Transform, distance: number, size: number) {
    const position = camTrans
      .getWorldPosition()
      .add(camTrans.forward.uniformScale(-distance));
    const rotation = quat.lookAt(camTrans.forward, vec3.up());
    this.updatePicAnchorWithPose(position, rotation, new vec2(size, size));

    this.cornerController.createDebugCorners(size);
    var cornerTrans = this.cornerController.getSceneObject().getTransform();
    cornerTrans.setWorldPosition(position);
    cornerTrans.setWorldRotation(rotation);
  }

  public closeWindow(onComplete?: () => void) {
    this.isCaptureActive = false;
    const startScale = this.picAnchorTrans.getLocalScale();
    animate({
      easing: "ease-out-quad",
      duration: 0.3,
      update: (t: number) => {
        this.picAnchorTrans.setLocalScale(
          vec3.lerp(startScale, vec3.one().uniformScale(0.01), t),
        );
      },
      ended: () => {
        if (onComplete) {
          onComplete();
        }
      },
      cancelSet: new CancelSet(),
    });
  }

  public reset() {
    this.isCaptureActive = false;
    this.setCaptureToLiveCrop();
    this.closeAllUIElementsRecursive(this.getSceneObject());
  }

  private closeAllUIElementsRecursive(sceneObj: SceneObject) {
    for (let child of sceneObj.children) {
      const scripts = child.getComponents("ScriptComponent");
      for (let script of scripts) {
        if (script instanceof UIElement) {
          (script as UIElement).closeElement();
        }
      }
      this.closeAllUIElementsRecursive(child);
    }
  }

  public setCaptureTexture(textureType: "live" | "static") {
    const mat = this.captureRendMesh?.mainMaterial;
    if (!mat) return;

    let texture: Texture = null;

    switch (textureType) {
      case "live":
        if (this.cropRegion) {
          texture = this.cropRegion.getCropTexture();
        }
        mat.mainPass.ShowImage = false;
        break;
      case "static":
        if (this.cropRegion) {
          const cropTexture = this.cropRegion.getCropTexture();
          if (cropTexture) {
            texture = ProceduralTextureProvider.createFromTexture(cropTexture);
            mat.mainPass.ShowImage = true;
          }
        }
        break;
    }

    if (texture) {
      mat.mainPass.cropImageTex = texture;
    }
  }

  public setCaptureToLiveCrop() {
    this.setCaptureTexture("live");
  }

  public requestClose() {
    if (this.interactionController) {
      this.interactionController.triggerClose();
    }
  }

  public updatePicAnchorWithPose(position: vec3, rotation: quat, scale: vec2) {
    this.picAnchorTrans.setWorldPosition(position);
    this.picAnchorTrans.setWorldRotation(rotation);
    this.picAnchorTrans.setLocalScale(new vec3(scale.x, scale.y, 1));
    const mat = this.captureRendMesh?.mainMaterial;
    if (mat) {
      mat.mainPass.planeScale = scale;
    }
  }

  public getCapturedTexture(): Texture | null {
    if (!this.captureRendMesh) {
      return null;
    }

    try {
      return this.captureRendMesh.mainMaterial.mainPass.cropImageTex;
    } catch (error) {
      print(`[UIController] Error getting captured texture: ${error}`);
      return null;
    }
  }

  public getCaptureAnchorPosition(): vec3 {
    return this.picAnchorTrans.getWorldPosition();
  }

  public getCaptureAnchorRotation(): quat {
    return this.picAnchorTrans.getWorldRotation();
  }
}
