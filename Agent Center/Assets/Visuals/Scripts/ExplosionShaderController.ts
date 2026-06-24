import { createAudioComponent } from "../../Scripts/UI/Shared/UIBuilders";

@component
export class ExplosionController extends BaseScriptComponent {
  private rmv: RenderMeshVisual;
  private targetMaterial: Material;
  private baseLocalPos: vec3;

  // Default aspect ratio for 9:16 mobile portrait mode.
  // Adjust if running on different screen dimensions.
  @input
  public aspectRatio: number = 1;

  @input
  public loop: boolean = false;

  @input
  public animationDuration: number = 2.0;

  public explosionAudio: AudioTrackAsset = requireAsset(
    "../../Audio/explode.wav",
  ) as AudioTrackAsset;

  private audioComponent: AudioComponent;
  private updateEvent: SceneEvent;
  private readonly _scratchPos = new vec3(0, 0, 0);
  private elapsedTime: number = 0;
  private active: boolean = false;

  onAwake() {
    this.rmv = this.getSceneObject().getComponent(
      "RenderMeshVisual",
    ) as RenderMeshVisual;

    if (!this.rmv || !this.rmv.mainMaterial) {
      print(
        "Error: ExplosionController needs a RenderMeshVisual with a Material.",
      );
      return;
    }

    this.targetMaterial = this.rmv.mainMaterial.clone();
    this.rmv.clearMaterials();
    this.rmv.mainMaterial = this.targetMaterial;

    this.audioComponent = createAudioComponent(this.getSceneObject(), 0.25);
    this.audioComponent.audioTrack = this.explosionAudio;

    this.baseLocalPos = this.getSceneObject().getTransform().getLocalPosition();

    this.updateEvent = this.createEvent("UpdateEvent");
    this.updateEvent.bind(this.onUpdate.bind(this));
    this.updateEvent.enabled = this.loop;
    if (this.loop) {
      this.active = true;
    }
  }

  public triggerExplosion() {
    this.elapsedTime = 0;
    this.active = true;
    this.updateEvent.enabled = true;
    this.audioComponent.play(1);
  }

  private onUpdate() {
    const pass = this.targetMaterial.mainPass;
    const dt = getDeltaTime();

    this.elapsedTime += dt;

    if (this.loop) {
      this.elapsedTime = this.elapsedTime % this.animationDuration;
    } else if (this.elapsedTime >= this.animationDuration) {
      this.active = false;
      pass.u_time = -1.0;
      pass.u_expl_start = 0;
      pass.u_aspect_ratio = this.aspectRatio;
      this.getSceneObject().getTransform().setLocalPosition(this.baseLocalPos);
      this.updateEvent.enabled = false;
      return;
    }

    pass.u_time = this.elapsedTime;
    pass.u_expl_start = 0;
    pass.u_aspect_ratio = this.aspectRatio;

    let shakeX = 0;
    let shakeY = 0;
    if (this.elapsedTime < 0.4) {
      const intensity = (0.4 - this.elapsedTime) * 3.0;
      shakeX = (Math.random() - 0.5) * intensity;
      shakeY = (Math.random() - 0.5) * intensity;
    }

    const transform = this.getSceneObject().getTransform();
    this._scratchPos.x = this.baseLocalPos.x + shakeX;
    this._scratchPos.y = this.baseLocalPos.y + shakeY;
    this._scratchPos.z = this.baseLocalPos.z;
    transform.setLocalPosition(this._scratchPos);
  }
}
