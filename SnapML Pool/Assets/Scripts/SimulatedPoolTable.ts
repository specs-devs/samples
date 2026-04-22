/**
 * Specs Inc. 2026
 * Simulated Chess Board component for the SnapML Pool Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class SimulatedChessBoard extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SimulatedChessBoard – editor pool table simulation</span><br/><span style="color: #94A3B8; font-size: 11px;">Generates a virtual pool table with physics balls for Editor debugging.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Scene References</span>')
  @input
  @hint("Root scene object for the simulated pool table geometry")
  simulatedPoolTable: SceneObject

  @input
  @hint("Camera scene object used in the simulated view")
  simulatedCamera: SceneObject

  @input
  @hint("Prefab used to instantiate each pool ball in the scene")
  poolBall: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private poolBalls: SceneObject[] = []
  private logger: Logger

  onAwake() {
    this.logger = new Logger("SimulatedChessBoard", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    const isEditor = global.deviceInfoSystem.isEditor()

    this.simulatedCamera.enabled = isEditor
    this.simulatedPoolTable.enabled = isEditor

    if (isEditor) {
      this.generatePoolBalls()
      this.createEvent("TapEvent").bind(this.onTap.bind(this))
    }
  }

  private onTap(event: TapEvent) {
    for (let i = 0; i < this.poolBalls.length; i++) {
      const poolBall = this.poolBalls[i]
      const physicsBody = poolBall.getComponent("Physics.BodyComponent")
      const f = 10
      physicsBody.addForce(new vec3(Math.random() * 2 * f - f, 0, Math.random() * 2 * f - f), Physics.ForceMode.Impulse)
    }
  }

  private generatePoolBalls() {
    const parent = this.simulatedPoolTable

    for (let i = 0; i < 16; i++) {
      const poolBall = this.poolBall.instantiate(parent)
      const mesh = poolBall.getComponent("Component.RenderMeshVisual")
      const mat = mesh.mainMaterial.clone()
      mat.mainPass.ballNum = i
      mesh.mainMaterial = mat
      const pos = new vec3(Math.random() * 90 - 45, 77, Math.random() * 210 - 105)
      poolBall.getTransform().setLocalPosition(pos)
      poolBall.getTransform().setLocalRotation(new quat(Math.random(), Math.random(), Math.random(), 1))
      this.poolBalls.push(poolBall)
    }
    this.logger.info("Generated " + this.poolBalls.length + " pool balls")
  }
}
