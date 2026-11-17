/**
 * SPECS Inc. 2027
 * Real-time co-creation over Sync Kit: every committed or live-edited item is shared with the other people in
 * the session, late joiners receive the current sketch from the host, and each participant's cursor is shown.
 *
 * Positions are sketch-relative, so each person sees the shared sketch in front of them at their own view
 * scale — remote design reviews work without a shared physical space. A presenter can also bring everyone to
 * their viewpoint.
 */
import {NetworkMessage} from "SyncKit.lspkg/Core/NetworkMessage"
import {SessionController} from "SyncKit.lspkg/Core/SessionController"
import {SyncEntity} from "SyncKit.lspkg/Core/SyncEntity"
import {AppState} from "../Core/AppState"
import {Signal} from "../Core/Signal"
import {ChangeSource, SketchDocument} from "../Core/SketchDocument"
import {compactItem, isValidItem, isValidViewpoint, SketchItem, Viewpoint} from "../Core/SketchTypes"

const SEND_INTERVAL = 0.1
const CURSOR_INTERVAL = 0.12
const CURSOR_TIMEOUT = 2.5
/** Items per message when sending the whole sketch to a late joiner. */
const SNAPSHOT_BATCH = 4

interface PutMessage {
  items: SketchItem[]
}

interface DeleteMessage {
  ids: string[]
}

interface CursorMessage {
  p: [number, number, number]
  c: [number, number, number]
  d: boolean
}

interface ViewMessage {
  v: Viewpoint
}

export interface SharedView {
  viewpoint: Viewpoint
  from: string
}

export interface RemoteCursor {
  /** Sketch-root position. */
  position: vec3
  color: [number, number, number]
  drawing: boolean
  name: string
  lastSeen: number
}

export class CollabSession {
  readonly cursors = new Map<string, RemoteCursor>()
  /** A collaborator asked everyone to look from their viewpoint. */
  readonly onViewShared = new Signal<SharedView>()
  private entity: SyncEntity | null = null
  private ready = false
  private sharing = true
  private pending = new Map<string, SketchItem | null>()
  private lastSend = 0
  private lastCursor = 0
  private time = 0
  private error: string | null = null

  constructor(
    private readonly script: ScriptComponent,
    private readonly doc: SketchDocument,
    private readonly state: AppState
  ) {
    let controller: SessionController | null = null
    try {
      controller = SessionController.getInstance()
    } catch (e) {
      this.error = "Sync Kit not set up"
      print("Industrial Sketch: Sync Kit unavailable, collaboration off: " + e)
      return
    }
    if (!controller) {
      this.error = "Sync Kit not set up"
      return
    }
    controller.notifyOnReady(() => this.onSessionReady())
    doc.onItemChanged.add((change) => {
      if (change.source === ChangeSource.Remote) {
        return
      }
      this.pending.set(change.id, change.item)
    })
  }

  private get controller(): SessionController | null {
    try {
      return SessionController.getInstance()
    } catch {
      return null
    }
  }

  get isLive(): boolean {
    const c = this.controller
    return this.ready && !!c && !c.isSingleplayer() && this.sharing
  }

  statusLabel(): string {
    if (this.error) {
      return "Collaboration unavailable"
    }
    const c = this.controller
    if (!this.ready || !c) {
      return "Collaboration: connecting…"
    }
    if (c.isSingleplayer()) {
      return "Solo session"
    }
    const people = c.getUsers().length
    return this.sharing ? "Live · " + people + (people === 1 ? " person" : " people") : "Sharing paused"
  }

  toggle(): void {
    const c = this.controller
    if (this.error || !c) {
      this.state.toast("Collaboration needs the Sync Kit start menu (Multiplayer)")
      return
    }
    if (!this.ready || c.isSingleplayer()) {
      this.state.toast("Restart the lens and choose Multiplayer to sketch together")
      return
    }
    this.sharing = !this.sharing
    if (this.sharing && this.entity) {
      // Send what changed locally while paused (including deletions), our full sketch, and ask peers for theirs.
      this.flush()
      this.sendSnapshot()
      this.entity.sendEvent("hello", {}, true)
      this.state.toast("Sharing resumed")
    } else {
      this.state.toast("Sharing paused — your changes stay local")
    }
  }

  /** Asks everyone in the session to jump to `viewpoint`. Returns false when not in a live session. */
  shareView(viewpoint: Viewpoint): boolean {
    if (!this.isLive || !this.entity) {
      return false
    }
    const msg: ViewMessage = {v: viewpoint}
    this.entity.sendEvent("view", msg, true)
    return true
  }

  /** Call every frame with the local dominant-hand cursor (sketch-root space) when tracked. */
  update(time: number, cursor?: {position: vec3; drawing: boolean} | null): void {
    this.time = time
    if (!this.isLive || !this.entity) {
      return
    }
    if (this.pending.size > 0 && time - this.lastSend >= SEND_INTERVAL) {
      this.lastSend = time
      this.flush()
    }
    if (cursor && time - this.lastCursor >= CURSOR_INTERVAL) {
      this.lastCursor = time
      const msg: CursorMessage = {
        p: [round(cursor.position.x), round(cursor.position.y), round(cursor.position.z)],
        c: this.state.color,
        d: cursor.drawing
      }
      this.entity.sendEvent("cursor", msg, true)
    }
    this.cursors.forEach((c, id) => {
      if (time - c.lastSeen > CURSOR_TIMEOUT) {
        this.cursors.delete(id)
      }
    })
  }

  private onSessionReady(): void {
    const c = this.controller
    if (!c) {
      return
    }
    try {
      this.entity = new SyncEntity(this.script, null, false, "Session")
    } catch (e) {
      this.error = "Sync Kit error"
      print("Industrial Sketch: could not create the collaboration entity: " + e)
      return
    }
    const entity = this.entity
    entity.notifyOnReady(() => {
      this.ready = true
      if (c.isSingleplayer()) {
        return
      }
      entity.onRemoteEventReceived.add("put", (m: NetworkMessage<unknown>) => this.onPut(m))
      entity.onRemoteEventReceived.add("del", (m: NetworkMessage<unknown>) => this.onDelete(m))
      entity.onRemoteEventReceived.add("cursor", (m: NetworkMessage<unknown>) => this.onCursor(m))
      entity.onRemoteEventReceived.add("view", (m: NetworkMessage<unknown>) => this.onView(m))
      entity.onRemoteEventReceived.add("hello", () => {
        // Everyone answers a newcomer with their items, so nobody depends on host election timing.
        // Items are keyed by id, so duplicates from several peers are harmless.
        this.sendSnapshot()
      })
      // Announce ourselves (peers reply with the shared sketch) and contribute our own items:
      // the session holds the union of everyone's sketches.
      entity.sendEvent("hello", {}, true)
      this.pending.clear()
      this.sendSnapshot()
      this.state.toast("Live session — sketching together")
    })
  }

  private sendSnapshot(): void {
    if (!this.entity) {
      return
    }
    const items = this.doc.all().map(compactItem)
    for (let i = 0; i < items.length; i += SNAPSHOT_BATCH) {
      const batch: PutMessage = {items: items.slice(i, i + SNAPSHOT_BATCH)}
      this.entity.sendEvent("put", batch, true)
    }
  }

  private flush(): void {
    if (!this.entity) {
      return
    }
    const puts: SketchItem[] = []
    const dels: string[] = []
    this.pending.forEach((item, id) => {
      if (item) {
        puts.push(compactItem(item))
      } else {
        dels.push(id)
      }
    })
    this.pending.clear()
    for (let i = 0; i < puts.length; i += SNAPSHOT_BATCH) {
      const msg: PutMessage = {items: puts.slice(i, i + SNAPSHOT_BATCH)}
      this.entity.sendEvent("put", msg, true)
    }
    if (dels.length > 0) {
      const msg: DeleteMessage = {ids: dels}
      this.entity.sendEvent("del", msg, true)
    }
  }

  private onPut(m: NetworkMessage<unknown>): void {
    if (!this.sharing) {
      return
    }
    const data = m.data as PutMessage
    if (!data || !Array.isArray(data.items)) {
      return
    }
    for (const item of data.items) {
      if (isValidItem(item)) {
        this.doc.applyRemote(item.id, item)
      }
    }
  }

  private onDelete(m: NetworkMessage<unknown>): void {
    if (!this.sharing) {
      return
    }
    const data = m.data as DeleteMessage
    if (!data || !Array.isArray(data.ids)) {
      return
    }
    for (const id of data.ids) {
      if (typeof id === "string") {
        this.doc.applyRemote(id, null)
      }
    }
  }

  private onView(m: NetworkMessage<unknown>): void {
    if (!this.sharing) {
      return
    }
    const data = m.data as ViewMessage
    if (!data || !isValidViewpoint(data.v)) {
      return
    }
    const from = m.senderInfo && m.senderInfo.displayName ? m.senderInfo.displayName : "A collaborator"
    this.onViewShared.emit({viewpoint: data.v, from})
  }

  private onCursor(m: NetworkMessage<unknown>): void {
    const data = m.data as CursorMessage
    if (!data || !Array.isArray(data.p)) {
      return
    }
    const id = m.senderConnectionId
    const existing = this.cursors.get(id)
    const name = m.senderInfo && m.senderInfo.displayName ? m.senderInfo.displayName : "Guest"
    const cursor: RemoteCursor = {
      position: new vec3(data.p[0], data.p[1], data.p[2]),
      color: Array.isArray(data.c) && data.c.length === 3 ? data.c : [1, 1, 1],
      drawing: !!data.d,
      name,
      lastSeen: this.time
    }
    if (existing) {
      // Smooth remote motion between 8 Hz updates.
      cursor.position = vec3.lerp(existing.position, cursor.position, 0.6)
    }
    this.cursors.set(id, cursor)
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}
