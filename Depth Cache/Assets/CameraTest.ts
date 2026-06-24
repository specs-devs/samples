@component
export class ContinuousCameraFrameExample extends BaseScriptComponent {
  private cameraModule: CameraModule = require('LensStudio:CameraModule');
  private cameraRequest: CameraModule.CameraRequest;
  private cameraTexture: Texture;
  private cameraTextureProvider: CameraTextureProvider;

  @input
  @hint('The image in the scene that will be showing the captured frame.')
  uiImage: Image | undefined;

  onAwake() {
    this.createEvent('OnStartEvent').bind(() => {
      this.cameraRequest = CameraModule.createCameraRequest();
      this.cameraRequest.cameraId = CameraModule.CameraId.Right_Color;

      this.cameraTexture = this.cameraModule.requestCamera(this.cameraRequest);
      this.cameraTextureProvider = this.cameraTexture
        .control as CameraTextureProvider;

      this.cameraTextureProvider.onNewFrame.add((cameraFrame) => {
        if (this.uiImage) {
          this.uiImage.mainPass.baseTex = this.cameraTexture;
        }
      });
    });
  }
}