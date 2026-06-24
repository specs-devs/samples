import { CameraService } from "../../../Utils/CameraService";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

@component
export class CropRegion extends BaseScriptComponent {
  public cropTexture: Texture;
  private pointsToTrack: SceneObject[];
  private cropTextureController: RectCropTextureProvider = null;

  private isEditor = global.deviceInfoSystem.isEditor();
  private sourceCameraTexture: Texture = null;

  private transformsToTrack = [];
  private currentCropRect: Rect = null;

  private readonly _imagePoints: vec2[] = [vec2.zero(), vec2.zero(), vec2.zero(), vec2.zero()];
  private readonly _scratchCenter = vec2.zero();
  private readonly _scratchSize = vec2.zero();
  private readonly _scratchCropRect = Rect.create(-1, 1, -1, 1);
  private _updateBound = false;

  public readonly onInitialized = new Event();

  public initializeWithSceneObjects(sceneObjects: SceneObject[]) {
    this.pointsToTrack = sceneObjects;
    this.transformsToTrack = [];

    for (var i = 0; i < this.pointsToTrack.length; i++) {
      this.transformsToTrack.push(this.pointsToTrack[i].getTransform());
    }

    if (this.transformsToTrack.length < 1) {
      print("No points to track!");
      return;
    }

    this.initializeCropRegion();
  }

  onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  private initializeCropRegion() {
    CameraService.getInstance().waitForInitialization(() => {
      this.setupCropRegion();
    });
  }

  private setupCropRegion() {
    const cameraService = CameraService.getInstance();
    this.sourceCameraTexture = cameraService.getCameraTexture();
    this.cropTexture = cameraService.getScreenCropTexture();
    this.cropTextureController = this.cropTexture
      .control as RectCropTextureProvider;

    this.cropTextureController.inputTexture = this.sourceCameraTexture;

    this.currentCropRect = Rect.create(-1, 1, -1, 1);

    if (!this._updateBound) {
      this._updateBound = true;
      this.createEvent("UpdateEvent").bind(this.update.bind(this));
    }
  }

  onStart() {
    this.initializeCropRegion();
    this.onInitialized.invoke();
  }

  update() {
    const cameraService = CameraService.getInstance();
    for (var i = 0; i < this.transformsToTrack.length; i++) {
      if (this.isEditor) {
        this._imagePoints[i] = cameraService.WorldToEditorCameraSpace(
          this.transformsToTrack[i].getWorldPosition(),
        );
      } else {
        this._imagePoints[i] = cameraService.WorldToTrackingRightCameraSpace(
          this.transformsToTrack[i].getWorldPosition(),
        );
      }
    }
    this.onTrackingUpdated(this._imagePoints);
  }

  private readonly _sortBuffer: vec2[] = [vec2.zero(), vec2.zero(), vec2.zero(), vec2.zero()];
  private readonly _sortResult: vec2[] = [vec2.zero(), vec2.zero(), vec2.zero(), vec2.zero()];

  private sortPointsToRectangleOrder(points: vec2[]): vec2[] {
    if (points.length !== 4) {
      return points;
    }

    this._sortBuffer[0] = points[0];
    this._sortBuffer[1] = points[1];
    this._sortBuffer[2] = points[2];
    this._sortBuffer[3] = points[3];
    this._sortBuffer.sort((a, b) => b.y - a.y);

    if (this._sortBuffer[0].x > this._sortBuffer[1].x) {
      const tmp = this._sortBuffer[0];
      this._sortBuffer[0] = this._sortBuffer[1];
      this._sortBuffer[1] = tmp;
    }
    if (this._sortBuffer[2].x > this._sortBuffer[3].x) {
      const tmp = this._sortBuffer[2];
      this._sortBuffer[2] = this._sortBuffer[3];
      this._sortBuffer[3] = tmp;
    }

    this._sortResult[0] = this._sortBuffer[0];
    this._sortResult[1] = this._sortBuffer[1];
    this._sortResult[2] = this._sortBuffer[3];
    this._sortResult[3] = this._sortBuffer[2];
    return this._sortResult;
  }

  private onTrackingUpdated(imagePoints: vec2[]) {
    if (imagePoints.length !== 4) {
      print(
        `CropRegion: Expected 4 tracking points, got ${imagePoints.length}`,
      );
      return;
    }

    const sortedPoints = this.sortPointsToRectangleOrder(imagePoints);

    const topLeft = sortedPoints[0];
    const topRight = sortedPoints[1];
    const bottomRight = sortedPoints[2];
    const bottomLeft = sortedPoints[3];

    const topY = (topLeft.y + topRight.y) / 2;
    const bottomY = (bottomLeft.y + bottomRight.y) / 2;

    const leftX = (topLeft.x + bottomLeft.x) / 2;
    const rightX = (topRight.x + bottomRight.x) / 2;

    const minX = Math.min(leftX, rightX);
    const maxX = Math.max(leftX, rightX);
    const minY = Math.min(topY, bottomY);
    const maxY = Math.max(topY, bottomY);

    this._scratchCenter.x = (minX + maxX) * 0.5;
    this._scratchCenter.y = (minY + maxY) * 0.5;
    this._scratchSize.x = maxX - minX;
    this._scratchSize.y = maxY - minY;

    const sizeLen = Math.sqrt(
      this._scratchSize.x * this._scratchSize.x +
      this._scratchSize.y * this._scratchSize.y,
    );

    if (sizeLen > 0.01) {
      this._scratchCropRect.setCenter(this._scratchCenter);
      this._scratchCropRect.setSize(this._scratchSize);

      const prevCenter = this.currentCropRect.getCenter();
      const prevSize = this.currentCropRect.getSize();
      const centerDelta =
        Math.abs(this._scratchCenter.x - prevCenter.x) +
        Math.abs(this._scratchCenter.y - prevCenter.y);
      const sizeDelta =
        Math.abs(this._scratchSize.x - prevSize.x) +
        Math.abs(this._scratchSize.y - prevSize.y);

      if (centerDelta > 0.0001 || sizeDelta > 0.0001) {
        this.currentCropRect.setCenter(this._scratchCenter);
        this.currentCropRect.setSize(this._scratchSize);
        this.cropTextureController.cropRect = this.currentCropRect;
      }
    } else {
      this.currentCropRect = Rect.create(-1, 1, -1, 1);
      this.cropTextureController.cropRect = this.currentCropRect;
    }
  }

  public getCurrentCropRect(): Rect {
    return this.currentCropRect;
  }

  public getSourceTexture(): Texture {
    return this.sourceCameraTexture;
  }

  public getCropTexture(): Texture {
    return this.cropTexture;
  }

  public createCroppedTexture(): Texture {
    if (!this.sourceCameraTexture || !this.currentCropRect) {
      return this.sourceCameraTexture;
    }

    return this.cropTexture || this.sourceCameraTexture;
  }
}
