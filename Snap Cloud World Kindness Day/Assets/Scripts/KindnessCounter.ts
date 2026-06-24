/**
 * Specs Inc. 2026
 * Kindness Counter component for the World Kindness Day Spectacles lens.
 */
import {createClient} from "SupabaseClient.lspkg/supabase-snapcloud"
import {SnapCloudRequirements} from "./SnapCloudRequirements"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

@component
export class KindnessCounter extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">KindnessCounter – Supabase pledge manager</span><br/><span style="color: #94A3B8; font-size: 11px;">Handles pledge submission, global count, and screen transitions.</span>')
  @ui.separator

  @input
  @hint("SnapCloudRequirements component for centralized Supabase configuration")
  @allowUndefined
  public snapCloudRequirements!: SnapCloudRequirements

  @input
  @hint("Allow the Lens to increment the pledge count in Supabase")
  allowIncrementFromLens: boolean = true

  @input
  @hint("Text component displaying the global pledge count")
  totalText?: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Scene References</span>')

  @input
  @hint("Root scene object for the start screen")
  startRoot?: SceneObject

  @input
  @hint("Root scene object for the end screen")
  endRoot?: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Balloon Settings</span>')

  @input
  @hint("Array of balloon prefabs to spawn on the end screen")
  balloonPrefabs: ObjectPrefab[]

  @input
  @hint("Parent scene object that spawned balloons are attached to")
  balloonsParent?: SceneObject

  @input
  @hint("Maximum number of balloons to spawn on the end screen")
  maxOthers: number = 20

  @input
  @hint("Root scene object shown when Supabase configuration is missing")
  missingConfigRoot?: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private client: any = null
  private inited = false
  private alreadyPledged = false

  onAwake(): void {
    this.logger = new Logger("KindnessCounter", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  onDestroy(): void {
    try {
      this.client?.removeAllChannels?.()
    } catch (_) {
      // Ignore cleanup errors
    }
  }

  @bindStartEvent
  private async initFlow(): Promise<void> {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    await this.ensureInit()

    if (!this.snapCloudRequirements?.isConfigured()) {
      return
    }

    try {
      const {data, error} = await this.client.rpc("has_pledged_ever")
      if (error) {
        this.logger.error("has_pledged_before error: " + error.message)
        this.showStart()
        return
      }

      const has = Boolean(data)
      this.alreadyPledged = has

      if (has) {
        const totalAll = await this.fetchAllTimeTotal()
        this.updateTotalText(totalAll)
        this.alreadyPledged = true
        this.showEnd(totalAll)
        this.logger.info(`Already pledged → showing End. Total: ${totalAll}`)
      } else {
        this.showStart()
        this.logger.info("No pledge yet → showing Start.")
      }
    } catch (e) {
      this.logger.error("Startup check exception: " + e)
      this.showStart()
    }
  }

  public async onBalloonSelected(): Promise<void> {
    await this.ensureInit()
    if (this.alreadyPledged) {
      this.logger.info("Already pledged in this session.")
      return
    }

    const {error} = await this.client.rpc("pledge_and_total_once")
    if (error) {
      this.logger.error("pledge_and_total_once error: " + error.message)
      return
    }

    const totalAll = await this.fetchAllTimeTotal()
    this.alreadyPledged = true
    this.updateTotalText(totalAll)
    this.showEnd(totalAll)
  }

  private async ensureInit(): Promise<void> {
    if (this.inited) return

    if (!this.snapCloudRequirements?.isConfigured()) {
      this.logger.error("SnapCloudRequirements not assigned or not configured.")

      if (this.missingConfigRoot) {
        this.missingConfigRoot.enabled = true
      }

      if (this.startRoot) this.startRoot.enabled = false
      if (this.endRoot) this.endRoot.enabled = false

      this.inited = true
      return
    }

    globalThis.supabaseModule = require("LensStudio:SupabaseModule")

    try {
      this.client = createClient(
        this.snapCloudRequirements.getSupabaseUrl(),
        this.snapCloudRequirements.getSupabasePublicToken()
      )
      this.logger.info("Client created.")

      const {data, error} = await this.client.auth.signInWithIdToken({
        provider: "snapchat",
        token: ""
      })
      if (error) this.logger.error("Auth error: " + error.message)
      else this.logger.info("Auth OK: " + (data?.user?.id || "no-id"))
    } catch (e) {
      this.logger.error("Init failure: " + e)
      return
    }

    this.inited = true
  }

  private showStart(): void {
    if (this.startRoot) {
      this.startRoot.enabled = true
    }
    if (this.endRoot) {
      this.endRoot.enabled = false
    }
  }

  private showEnd(total: number): void {
    if (this.startRoot) {
      this.startRoot.enabled = false
    }
    if (this.endRoot) {
      this.endRoot.enabled = true
    }

    const count = Math.min(this.maxOthers, Math.max(0, total))
    this.logger.info(`Spawning ${count} balloons for total ${total}`)

    for (let i = 0; i < count; i++) {
      this.spawnRandomBalloon()
    }
  }

  private spawnRandomBalloon(): void {
    if (!this.balloonsParent || !this.balloonPrefabs || this.balloonPrefabs.length === 0) {
      this.logger.warn("Spawn skipped: missing container or prefabs")
      return
    }

    const prefab = this.balloonPrefabs[Math.floor(Math.random() * this.balloonPrefabs.length)]
    const obj = prefab.instantiate(this.balloonsParent)
    if (!obj) return

    const tr = obj.getTransform()
    const x = this.randRange(-30, 30)
    const y = this.randRange(50, 100)
    const z = this.randRange(-50, 5)
    tr.setLocalPosition(new vec3(x, y, z))
  }

  private randRange(min: number, max: number): number {
    return min + Math.random() * (max - min)
  }

  private updateTotalText(n: number): void {
    if (!this.totalText) return
    this.totalText.text = n.toLocaleString()
  }

  private async fetchAllTimeTotal(): Promise<number> {
    try {
      const {data, error} = await this.client.rpc("get_kindness_total_all")
      if (error) {
        this.logger.error("get_kindness_total_all error: " + error.message)
        return 0
      }
      return Number(data || 0)
    } catch (e) {
      this.logger.error("get_kindness_total_all exception: " + e)
      return 0
    }
  }
}
