/**
 * Direct port of the working AnchorManager from the Spatial Persistence sample.
 * Uses the exact same session cueing, create→save chain, and followSession pattern.
 * Adapted with event names that AppController expects.
 */
import {Anchor, State, UserAnchor} from "Spatial Anchors.lspkg/Anchor"
import {AnchorSession, AnchorSessionOptions} from "Spatial Anchors.lspkg/AnchorSession"
import {AnchorModule} from "Spatial Anchors.lspkg/AnchorModule"
import Event, {PublicApi, unsubscribe} from "SpectaclesInteractionKit.lspkg/Utils/Event"

const CAMERA_GAZE_OFFSET_FACTOR = 60

export class AnchorController {
  private static instance: AnchorController

  private anchorModule: AnchorModule
  private anchorSession?: AnchorSession
  private currentCuedSelectArea: Promise<void> | null = null
  private nextCuedSelectArea: () => Promise<void> | null = () => null

  private onAnchorFoundEvent: Event<Anchor> = new Event<Anchor>()
  readonly onAnchorFound: PublicApi<Anchor> = this.onAnchorFoundEvent.publicApi()

  private onAnchorSavedEvent: Event<Anchor> = new Event<Anchor>()
  readonly onAnchorSaved: PublicApi<Anchor> = this.onAnchorSavedEvent.publicApi()

  private onAnchorLostEvent: Event<Anchor> = new Event<Anchor>()
  readonly onAnchorLost: PublicApi<Anchor> = this.onAnchorLostEvent.publicApi()

  private currentAnchor: Anchor
  private anchorFoundUnsubscribes: unsubscribe[] = []
  private isCreatingNewAnchor: boolean = false
  private _currentAreaId: string | null = null

  private constructor() {
    if (global.deviceInfoSystem.isEditor()) {
      print("[AnchorController] Running in Editor — anchor operations will be stubbed")
      return
    }

    const sceneObjectCount = global.scene.getRootObjectsCount()
    for (let i = 0; i < sceneObjectCount; i++) {
      const sceneObject = global.scene.getRootObject(i)
      if (sceneObject.name === "AnchorModule") {
        this.anchorModule = sceneObject.getComponent(AnchorModule.getTypeName())
      }
    }

    if (!this.anchorModule) {
      print("[AnchorController] ERROR: AnchorModule not found on any root SceneObject named 'AnchorModule'")
    }
  }

  static getInstance(): AnchorController {
    if (this.instance) {
      return this.instance
    }
    this.instance = new AnchorController()
    return this.instance
  }

  get hasActiveSession(): boolean {
    return this.anchorSession !== undefined && this.anchorSession !== null
  }

  get anchor(): Anchor | null {
    return this.currentAnchor ?? null
  }

  get currentAreaId(): string | null {
    return this._currentAreaId
  }

  get isSavePending(): boolean {
    return this.isCreatingNewAnchor
  }

  // -------------------------------------------------------
  // Session lifecycle — exact port of old cueSelectArea
  // -------------------------------------------------------

  selectArea(areaId: string, afterSelect: () => void): void {
    if (global.deviceInfoSystem.isEditor()) {
      print(`[AnchorController] Editor mode — stubbed selectArea("${areaId}")`)
      this._currentAreaId = areaId
      afterSelect()
      return
    }
    this._currentAreaId = areaId
    this.cueSelectArea(areaId, afterSelect)
  }

  private cueSelectArea(areaId: string, afterSelect: () => void) {
    this.nextCuedSelectArea = async (): Promise<void> | null => {
      if (this.anchorSession) {
        await this.anchorSession.close()
        this.anchorSession = null
      }
      this.anchorSession = await this.createAnchorSession(areaId)
      this.followSession(this.anchorSession)
      afterSelect()

      this.currentCuedSelectArea = this.nextCuedSelectArea()
      this.nextCuedSelectArea = () => null
    }

    if (!this.currentCuedSelectArea) {
      this.currentCuedSelectArea = this.nextCuedSelectArea()
      this.nextCuedSelectArea = () => null
    }
  }

  private async createAnchorSession(areaId: string): Promise<AnchorSession> {
    const options = new AnchorSessionOptions()
    options.area = areaId
    options.scanForWorldAnchors = true
    try {
      print(`[AnchorController] Opening session for area: ${areaId}`)
      const session = await this.anchorModule.openSession(options)
      print(`[AnchorController] Session opened for area: ${areaId}`)
      return session
    } catch (error) {
      print(`[AnchorController] Error creating anchor session: ${error}`)
    }
  }

  private followSession(session: AnchorSession) {
    print(`[AnchorController] followSession: subscribing to onAnchorNearby`)
    session.onAnchorNearby.add((anchor) => {
      print(`[AnchorController] onAnchorNearby id: ${anchor.id}`)
      this.anchorFoundUnsubscribes.push(
        anchor.onFound.add(() => {
          this.currentAnchor = anchor
          print(`[AnchorController] onAnchorFound: ${this.currentAnchor.toWorldFromAnchor.column3} id: ${this.currentAnchor.id}`)
          this.onAnchorFoundEvent.invoke(this.currentAnchor)
        })
      )
    })
  }

  // -------------------------------------------------------
  // Anchor operations — exact port of old createAreaAnchor
  // -------------------------------------------------------

  createAreaAnchor(anchorPosition: vec3, anchorRotation: quat): void {
    if (global.deviceInfoSystem.isEditor()) {
      print("[AnchorController] Editor mode — stubbed createAreaAnchor")
      return
    }

    this.isCreatingNewAnchor = true

    for (let i = 0; i < this.anchorFoundUnsubscribes.length; i++) {
      this.anchorFoundUnsubscribes[i]()
    }
    this.anchorFoundUnsubscribes = []

    print(`[AnchorController] createAreaAnchor position: ${anchorPosition}`)

    this.currentAnchor = undefined

    this.anchorSession
      .createWorldAnchor(mat4.compose(anchorPosition, anchorRotation, vec3.one()))
      .then(async (anchor): Promise<UserAnchor> => {
        print(`[AnchorController] createWorldAnchor success: ${anchor.toWorldFromAnchor.column3} id: ${anchor.id}`)
        if (this.anchorSession) {
          return await this.anchorSession.saveAnchor(anchor)
        } else {
          throw new Error("No AnchorSession")
        }
      })
      .then(async (anchor) => {
        print(`[AnchorController] saveAnchor success: ${anchor.toWorldFromAnchor.column3} id: ${anchor.id}`)
        if (anchor.state === State.Found) {
          this.currentAnchor = anchor
          print(`[AnchorController] >>> Anchor SAVED and FOUND — id: ${anchor.id}`)
          this.onAnchorFoundEvent.invoke(this.currentAnchor)
          this.onAnchorSavedEvent.invoke(this.currentAnchor)
        }
        this.isCreatingNewAnchor = false
      })
      .catch((error) => {
        print(`[AnchorController] createAreaAnchor error: ${error}`)
        this.isCreatingNewAnchor = false
      })
  }

  updateAreaAnchor(anchorPosition: vec3, anchorRotation: quat): Promise<UserAnchor> {
    this.currentAnchor.toWorldFromAnchor = mat4.compose(anchorPosition, anchorRotation, vec3.one())
    print(`[AnchorController] updateAreaAnchor: ${this.currentAnchor.toWorldFromAnchor}`)
    return this.anchorSession.saveAnchor(this.currentAnchor)
  }

  async resetArea(): Promise<void> {
    print(`[AnchorController] resetArea`)
    this.currentAnchor = undefined
    await this.anchorSession.reset()
  }

  // Compat stubs for CaptureFlowManager (not used in main flow)
  async startSession(areaId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.selectArea(areaId, () => resolve())
    })
  }

  async createAnchorAtWorldPose(toWorldFromAnchor: mat4): Promise<Anchor | null> {
    if (!this.anchorSession) return null
    try {
      return await this.anchorSession.createWorldAnchor(toWorldFromAnchor)
    } catch (e) {
      print(`[AnchorController] createAnchorAtWorldPose error: ${e}`)
      return null
    }
  }

  saveAnchorInBackground(anchor: Anchor): void {
    if (!this.anchorSession) return
    this.currentAnchor = anchor
    this.anchorSession.saveAnchor(anchor as UserAnchor)
      .then(() => {
        print(`[AnchorController] background save complete — id: ${anchor.id}`)
        this.onAnchorSavedEvent.invoke(anchor)
      })
      .catch((e: any) => {
        print(`[AnchorController] background save error: ${e}`)
      })
  }

  async deleteAnchor(anchor: Anchor): Promise<void> {
    if (!this.anchorSession) return
    try {
      await this.anchorSession.deleteAnchor(anchor as UserAnchor)
      if (this.currentAnchor === anchor) this.currentAnchor = undefined
      print(`[AnchorController] Anchor deleted — id: ${anchor.id}`)
    } catch (e) {
      print(`[AnchorController] deleteAnchor error: ${e}`)
    }
  }

  async closeSession(): Promise<void> {
    if (global.deviceInfoSystem.isEditor()) {
      return
    }
    if (this.anchorSession) {
      try {
        await this.anchorSession.close()
        print("[AnchorController] Session closed")
      } catch (e) {
        print(`[AnchorController] Error closing session: ${e}`)
      }
      this.anchorSession = null
    }
    this._currentAreaId = null
  }

  async awaitPendingSave(timeoutSec: number): Promise<boolean> {
    return !this.isCreatingNewAnchor
  }
}
