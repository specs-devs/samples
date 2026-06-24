import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";

@component
export class UIElement extends BaseScriptComponent {
  public anchorObj: SceneObject;
  public anchor: vec2;
  public offsetCM: vec3;

  private cancelSet = new CancelSet();
  private anchorTrans: Transform = null;
  private trans: Transform = null;
  private readonly _scratchPos = new vec3(0, 0, 0);

  onAwake() {
    this.trans = this.getTransform();
    this.trans.setLocalScale(vec3.zero());
  }

  public initializeAnchor() {
    this.anchorTrans = this.anchorObj.getTransform();
    this.createEvent("LateUpdateEvent").bind(this.onLateUpdate.bind(this));
  }

  public openElement() {
    this.animate(true);
  }

  public closeElement() {
    if (this.cancelSet) this.cancelSet.cancel();
    this.trans.setLocalScale(vec3.zero());
  }

  protected animate(open: boolean) {
    if (this.cancelSet) this.cancelSet.cancel();
    let start = open ? vec3.zero() : this.trans.getLocalScale();
    let end = open ? vec3.one() : vec3.zero();
    animate({
      easing: "ease-out-quad",
      duration: 0.35,
      update: (t: number) => {
        this.trans.setLocalScale(vec3.lerp(start, end, t));
      },
      ended: null,
      cancelSet: this.cancelSet,
    });
  }

  private onLateUpdate() {
    const worldScale = this.anchorTrans.getWorldScale();
    const right = this.anchorTrans.right;
    const up = this.anchorTrans.up;
    const forward = this.anchorTrans.forward;
    const base = this.anchorTrans.getWorldPosition();

    const rx = this.anchor.x * worldScale.x + this.offsetCM.x;
    const uy = this.anchor.y * worldScale.y + this.offsetCM.y;
    const fz = this.offsetCM.z;

    this._scratchPos.x = base.x + right.x * rx + up.x * uy + forward.x * fz;
    this._scratchPos.y = base.y + right.y * rx + up.y * uy + forward.y * fz;
    this._scratchPos.z = base.z + right.z * rx + up.z * uy + forward.z * fz;

    this.trans.setWorldPosition(this._scratchPos);
    this.trans.setWorldRotation(this.anchorTrans.getWorldRotation());
  }
}
