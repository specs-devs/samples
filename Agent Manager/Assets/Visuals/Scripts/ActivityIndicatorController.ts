import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";

@component
export class ActivityIndicatorController extends BaseScriptComponent {
  private rmv: RenderMeshVisual;
  private targetMaterial: Material;
  private animCancels = new CancelSet();

  @input
  public transitionDuration: number = 0.5;

  onAwake() {
    this.rmv = this.getSceneObject().getComponent(
      "RenderMeshVisual",
    ) as RenderMeshVisual;
    if (!this.rmv || !this.rmv.mainMaterial) {
      print("Error: ActivityIndicatorController needs a RenderMeshVisual with a Material.");
      return;
    }

    this.targetMaterial = this.rmv.mainMaterial.clone();
    this.rmv.clearMaterials();
    this.rmv.mainMaterial = this.targetMaterial;

    this.targetMaterial.mainPass.in_out = 0;
  }

  public show(): void {
    this.animCancels.cancel();
    const startValue = this.targetMaterial.mainPass.in_out;
    animate({
      duration: this.transitionDuration * (1 - startValue),
      easing: "linear",
      cancelSet: this.animCancels,
      update: (t: number) => {
        this.targetMaterial.mainPass.in_out = startValue + (1 - startValue) * t;
      },
    });
  }

  public hide(): void {
    this.animCancels.cancel();
    const startValue = this.targetMaterial.mainPass.in_out;
    animate({
      duration: this.transitionDuration * startValue,
      easing: "linear",
      cancelSet: this.animCancels,
      update: (t: number) => {
        this.targetMaterial.mainPass.in_out = startValue * (1 - t);
      },
    });
  }

  public setVisible(visible: boolean): void {
    if (visible) {
      this.show();
    } else {
      this.hide();
    }
  }
}
