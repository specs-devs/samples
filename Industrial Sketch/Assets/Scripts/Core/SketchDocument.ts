/**
 * SPECS Inc. 2027
 * The sketch document: the set of items plus an undo/redo history of item snapshots.
 */
import {Signal} from "./Signal"
import {cloneItem, isValidItem, SketchItem} from "./SketchTypes"

/** Where a change came from. Remote changes are applied but never re-broadcast or recorded in local undo. */
export enum ChangeSource {
  Local = "local",
  Remote = "remote",
  History = "history",
  Load = "load"
}

export interface ItemChange {
  id: string
  /** The new state, or null when the item was removed. */
  item: SketchItem | null
  source: ChangeSource
}

interface HistoryEntry {
  label: string
  before: Map<string, SketchItem | null>
  after: Map<string, SketchItem | null>
}

const MAX_HISTORY = 64

/**
 * Holds the items of a sketch. All mutations go through {@link commit} (recorded, undoable),
 * {@link preview} (live, not recorded — used while dragging) or {@link applyRemote}.
 */
export class SketchDocument {
  readonly onItemChanged = new Signal<ItemChange>()
  readonly onHistoryChanged = new Signal<void>()

  private items = new Map<string, SketchItem>()
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  /** Snapshots taken by beginEdit, keyed by id. */
  private pendingBefore: Map<string, SketchItem | null> | null = null

  get count(): number {
    return this.items.size
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoLabel(): string {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].label : ""
  }

  get redoLabel(): string {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].label : ""
  }

  get(id: string): SketchItem | undefined {
    return this.items.get(id)
  }

  has(id: string): boolean {
    return this.items.has(id)
  }

  all(): SketchItem[] {
    return Array.from(this.items.values())
  }

  /** Ids of items in the same group as `id` (just `[id]` when ungrouped). */
  groupOf(id: string): string[] {
    const item = this.items.get(id)
    if (!item || !item.group) {
      return item ? [id] : []
    }
    return this.all()
      .filter((i) => i.group === item.group)
      .map((i) => i.id)
  }

  /**
   * Applies a set of changes as one undoable step. `changes` maps id to the new item (or null to delete).
   */
  commit(label: string, changes: Map<string, SketchItem | null>): void {
    if (changes.size === 0) {
      return
    }
    const before = new Map<string, SketchItem | null>()
    changes.forEach((_v, id) => {
      const current = this.items.get(id)
      before.set(id, current ? cloneItem(current) : null)
    })
    this.applyChanges(changes, ChangeSource.Local)
    this.pushHistory({label, before, after: cloneMap(changes)})
  }

  /** Convenience: add or replace a single item as an undoable step. */
  put(label: string, item: SketchItem): void {
    this.commit(label, new Map([[item.id, item]]))
  }

  /** Convenience: remove items as one undoable step. */
  remove(label: string, ids: string[]): void {
    const changes = new Map<string, SketchItem | null>()
    for (const id of ids) {
      if (this.items.has(id)) {
        changes.set(id, null)
      }
    }
    this.commit(label, changes)
  }

  /** Starts a continuous edit of `ids` (e.g. a grab). Call {@link preview} while dragging and {@link endEdit} at the end. */
  beginEdit(ids: string[]): void {
    this.pendingBefore = new Map()
    for (const id of ids) {
      const item = this.items.get(id)
      this.pendingBefore.set(id, item ? cloneItem(item) : null)
    }
  }

  get isEditing(): boolean {
    return this.pendingBefore !== null
  }

  /** Live update during a continuous edit; not recorded in history. */
  preview(item: SketchItem): void {
    if (this.pendingBefore && !this.pendingBefore.has(item.id)) {
      const current = this.items.get(item.id)
      this.pendingBefore.set(item.id, current ? cloneItem(current) : null)
    }
    this.applyChanges(new Map([[item.id, item]]), ChangeSource.Local)
  }

  /** Commits the continuous edit as one history entry. Pass `cancel` to restore the snapshots instead. */
  endEdit(label: string, cancel: boolean = false): void {
    const before = this.pendingBefore
    this.pendingBefore = null
    if (!before) {
      return
    }
    if (cancel) {
      // Restore only what actually changed, so a cancelled tap doesn't re-broadcast or re-save anything.
      const restore = new Map<string, SketchItem | null>()
      before.forEach((prev, id) => {
        if (JSON.stringify(prev) !== JSON.stringify(this.items.get(id) ?? null)) {
          restore.set(id, prev)
        }
      })
      this.applyChanges(restore, ChangeSource.Local)
      return
    }
    const after = new Map<string, SketchItem | null>()
    let changed = false
    before.forEach((prev, id) => {
      const current = this.items.get(id)
      after.set(id, current ? cloneItem(current) : null)
      if (JSON.stringify(prev) !== JSON.stringify(current ?? null)) {
        changed = true
      }
    })
    if (changed) {
      this.pushHistory({label, before, after})
    }
  }

  undo(): string | null {
    const entry = this.undoStack.pop()
    if (!entry) {
      return null
    }
    this.applyChanges(entry.before, ChangeSource.History)
    this.redoStack.push(entry)
    this.onHistoryChanged.emit()
    return entry.label
  }

  redo(): string | null {
    const entry = this.redoStack.pop()
    if (!entry) {
      return null
    }
    this.applyChanges(entry.after, ChangeSource.History)
    this.undoStack.push(entry)
    this.onHistoryChanged.emit()
    return entry.label
  }

  /** Applies changes received from a collaborator. Invalid payloads are ignored. */
  applyRemote(id: string, item: SketchItem | null): void {
    if (item !== null && !isValidItem(item)) {
      return
    }
    this.applyChanges(new Map([[id, item]]), ChangeSource.Remote)
  }

  /** Replaces the whole document (load / new). Clears history. */
  replaceAll(items: SketchItem[], source: ChangeSource = ChangeSource.Load): void {
    const changes = new Map<string, SketchItem | null>()
    this.items.forEach((_v, id) => changes.set(id, null))
    for (const item of items) {
      if (isValidItem(item)) {
        changes.set(item.id, item)
      }
    }
    this.applyChanges(changes, source)
    this.undoStack = []
    this.redoStack = []
    this.onHistoryChanged.emit()
  }

  private pushHistory(entry: HistoryEntry): void {
    this.undoStack.push(entry)
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift()
    }
    this.redoStack = []
    this.onHistoryChanged.emit()
  }

  private applyChanges(changes: Map<string, SketchItem | null>, source: ChangeSource): void {
    changes.forEach((value, id) => {
      if (value === null) {
        if (this.items.delete(id)) {
          this.onItemChanged.emit({id, item: null, source})
        }
      } else {
        const copy = cloneItem(value)
        this.items.set(id, copy)
        this.onItemChanged.emit({id, item: copy, source})
      }
    })
  }
}

function cloneMap(changes: Map<string, SketchItem | null>): Map<string, SketchItem | null> {
  const out = new Map<string, SketchItem | null>()
  changes.forEach((v, id) => out.set(id, v ? cloneItem(v) : null))
  return out
}
