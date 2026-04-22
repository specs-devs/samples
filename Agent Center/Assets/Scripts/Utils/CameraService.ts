import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { Singleton } from "SpectaclesInteractionKit.lspkg/Decorators/Singleton";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

@Singleton
export class CameraService {
  private static _instance: CameraService;

  private screenCropTexture: Texture = requireAsset(
    "../../Visuals/Textures/Screen Crop Texture.screenCropTexture",
  ) as Texture;

  private isEditor = global.deviceInfoSystem.isEditor();
  private cropProvider: CropTextureProvider = null;
  private virtualCamPrefab: ObjectPrefab = requireAsset(
    "../../Prefabs/VirtualCamera.prefab",
  ) as ObjectPrefab;
  private virtualCamComp: Camera = null;
  private cameraMain: Camera;
  private cameraTexture: Texture = null;
  private cameraModule: CameraModule = require("LensStudio:CameraModule");

  public onInitialized = new Event();
  private isInitialized = false;

  public static getInstance(): CameraService {
    if (!CameraService._instance) {
      // The @Singleton decorator should handle instance creation
      // This is just a fallback in case it's needed
      throw new Error(
        "CameraService instance not initialized. Make sure the component is added to a scene object.",
      );
    }
    return CameraService._instance;
  }

  public waitForInitialization(callback: () => void): void {
    if (this.isInitialized) {
      callback();
    } else {
      this.onInitialized.add(callback);
    }
  }

  constructor() {
    this.onAwake();
  }

  onAwake() {
    CameraService._instance = this;
    this.cameraMain = WorldCameraFinderProvider.getInstance().getComponent();

    setTimeout(() => {
      this.onStart();
    }, 100);
  }

  onDestroy() {
    if (CameraService._instance === this) {
      CameraService._instance = null;
    }
  }

  private onStart() {
    // Create virtual camera based on the default camera configuration
    var defaultCameraId = this.isEditor
      ? CameraModule.CameraId.Default_Color
      : CameraModule.CameraId.Right_Color;

    var camRequest = CameraModule.createCameraRequest();
    camRequest.cameraId = defaultCameraId;
    this.cameraTexture = this.cameraModule.requestCamera(camRequest);
    var virtualCam = this.virtualCamPrefab.instantiate(
      this.cameraMain.getSceneObject(),
    );
    virtualCam.setParent(this.cameraMain.getSceneObject());
    virtualCam.getTransform().setLocalPosition(vec3.zero());
    this.virtualCamComp = virtualCam.getComponent("Camera") as Camera;
    let camTextureControl = this.cameraTexture.control as CameraTextureProvider;
    camTextureControl.onNewFrame.add(() => {});

    // Set up the crop provider to use the ComposedVideoProvider's output
    this.cropProvider = this.screenCropTexture.control as CropTextureProvider;
    this.cropProvider.inputTexture = this.cameraTexture;

    var trackingCamera =
      global.deviceInfoSystem.getTrackingCameraForId(defaultCameraId);
    this.createVirtualCamera(trackingCamera);
    this.isInitialized = true;
    this.onInitialized.invoke();
  }

  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  getMainCamera(): Camera {
    return this.cameraMain;
  }

  getCameraTexture(): Texture {
    return this.cameraTexture;
  }

  getScreenCropTexture(): Texture {
    return this.screenCropTexture;
  }

  private createVirtualCamera(trackingCam: DeviceCamera) {
    //set pose
    var camTrans = this.virtualCamComp.getSceneObject().getTransform();
    camTrans.setLocalTransform(trackingCam.pose);
    //set intrinsics
    var aspect = trackingCam.resolution.x / trackingCam.resolution.y;
    this.virtualCamComp.aspect = aspect;
    const avgFocalLengthPixels =
      (trackingCam.focalLength.x + trackingCam.focalLength.y) / 2;
    const fovRadians =
      2 * Math.atan(trackingCam.resolution.y / 2 / avgFocalLengthPixels);
    this.virtualCamComp.fov = fovRadians;
  }

  WorldToEditorCameraSpace(worldPos: vec3): vec2 {
    return this.CameraToScreenSpace(this.cameraMain, worldPos);
  }

  WorldToTrackingLeftCameraSpace(worldPos: vec3): vec2 {
    return this.CameraToScreenSpace(this.virtualCamComp, worldPos);
  }

  WorldToTrackingRightCameraSpace(worldPos: vec3): vec2 {
    return this.CameraToScreenSpace(this.virtualCamComp, worldPos);
  }

  CameraToScreenSpace(camComp: Camera, worldPos: vec3): vec2 {
    var screenPoint = camComp.worldSpaceToScreenSpace(worldPos);
    var localX = this.Remap(screenPoint.x, 0, 1, -1, 1);
    var localY = this.Remap(screenPoint.y, 1, 0, -1, 1);
    return new vec2(localX, localY);
  }

  Remap(value: number, low1: number, high1: number, low2: number, high2: number): number {
    return low2 + ((high2 - low2) * (value - low1)) / (high1 - low1);
  }
}
