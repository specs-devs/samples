/**
 * SPECS Inc. 2027
 * Heads-up text: a lazy-follow hint/toast line low in the view, a readout next to the drawing hand, and
 * labels on measurement and note items.
 */
import {NOTE_PIN_HEIGHT} from "../Core/ItemGeometry"
import {itemToRoot} from "../Core/LensMath"
import {SketchDocument} from "../Core/SketchDocument"
import {ItemKind} from "../Core/SketchTypes"
import {formatLength} from "../Tools/BrushTools"
import {Workspace} from "../Workspace/Workspace"
import {createChild, createLabel} from "./UiFactory"

const HINT_DISTANCE = 110
const HINT_DROP = 31
// Labels were sized for 60 cm; scale with distance so the hint keeps its angular size.
const HINT_SCALE = HINT_DISTANCE / 60
const TOAST_SECONDS = 2.2

export class Hud {
  private readonly root: SceneObject
  private readonly hintRoot: SceneObject
  private readonly hint: Text
  private readonly toastText: Text
  private readonly readoutRoot: SceneObject
  private readonly readout: Text
  private toastUntil = 0
  private measureLabels = new Map<string, {obj: SceneObject; text: Text}>()
  private noteLabels = new Map<string, {obj: SceneObject; text: Text}>()
  private labelsRoot: SceneObject
  private initialized = false

  constructor(
    private readonly camera: Transform,
    private readonly doc: SketchDocument,
    private readonly workspace: Workspace
  ) {
    this.root = global.scene.createSceneObject("HUD")
    this.hintRoot = createChild(this.root, "Hint")
    this.hintRoot.getTransform().setLocalScale(vec3.one().uniformScale(HINT_SCALE))
    this.hint = createLabel(this.hintRoot, "", 40, 2, {size: 40, color: new vec4(0.85, 0.9, 0.95, 0.9), z: 0})
    this.toastText = createLabel(this.hintRoot, "", 30, 2.2, {size: 48, color: new vec4(0.45, 0.88, 1, 1), z: 0})
    this.toastText
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, 2.6, 0))
    this.readoutRoot = createChild(this.root, "Readout")
    this.readout = createLabel(this.readoutRoot, "", 14, 1.8, {size: 44, color: new vec4(1, 1, 1, 1), z: 0})
    this.labelsRoot = createChild(this.root, "Item Labels")
    doc.onItemChanged.add((c) => {
      const note = this.noteLabels.get(c.id)
      if (!c.item || c.item.kind !== ItemKind.Note) {
        if (note) {
          note.obj.destroy()
          this.noteLabels.delete(c.id)
        }
      } else if (!note) {
        const obj = createChild(this.labelsRoot, "Note " + c.id)
        const text = createLabel(obj, "", 24, 3.2, {size: 44, color: new vec4(1, 1, 1, 1), z: 0})
        this.noteLabels.set(c.id, {obj, text})
      }
      const existing = this.measureLabels.get(c.id)
      if (!c.item || c.item.kind !== ItemKind.Measure) {
        if (existing) {
          existing.obj.destroy()
          this.measureLabels.delete(c.id)
        }
        return
      }
      if (!existing) {
        const obj = createChild(this.labelsRoot, "Measure " + c.id)
        const text = createLabel(obj, "", 12, 1.6, {size: 40, color: new vec4(0.45, 0.88, 1, 1), z: 0})
        this.measureLabels.set(c.id, {obj, text})
      }
    })
  }

  set visible(v: boolean) {
    this.root.enabled = v
  }

  toast(message: string, time: number): void {
    this.toastText.text = message
    this.toastUntil = time + TOAST_SECONDS
  }

  update(
    time: number,
    hintText: string,
    readoutText: string,
    readoutAt: vec3 | null,
    hiddenLayers: (layer: number) => boolean
  ): void {
    // Lazy-follow the head for the hint line.
    const head = this.camera.getWorldPosition()
    let forward = this.camera.back
    forward = new vec3(forward.x, forward.y * 0.3, forward.z).normalize()
    const target = head.add(forward.uniformScale(HINT_DISTANCE)).add(new vec3(0, -HINT_DROP, 0))
    const t = this.hintRoot.getTransform()
    if (!this.initialized) {
      t.setWorldPosition(target)
      this.initialized = true
    } else {
      t.setWorldPosition(vec3.lerp(t.getWorldPosition(), target, 0.08))
    }
    t.setWorldRotation(quat.lookAt(head.sub(t.getWorldPosition()).normalize(), vec3.up()))
    if (this.hint.text !== hintText) {
      this.hint.text = hintText
    }
    this.toastText.getSceneObject().enabled = time < this.toastUntil

    const showReadout = !!readoutAt && readoutText.length > 0
    this.readoutRoot.enabled = showReadout
    if (showReadout && readoutAt) {
      const toHead = head.sub(readoutAt).normalize()
      const pos = readoutAt.add(new vec3(0, 4, 0)).add(toHead.uniformScale(2))
      const rt = this.readoutRoot.getTransform()
      rt.setWorldPosition(pos)
      rt.setWorldRotation(quat.lookAt(toHead, vec3.up()))
      if (this.readout.text !== readoutText) {
        this.readout.text = readoutText
      }
    }

    // Measurement labels at the midpoint of each dimension line, facing the user.
    this.measureLabels.forEach((label, id) => {
      const item = this.doc.get(id)
      if (!item || !item.points || item.points.length < 2 || hiddenLayers(item.layer)) {
        label.obj.enabled = false
        return
      }
      label.obj.enabled = true
      const a = this.workspace.rootToWorld(itemToRoot(item.transform, item.points[0]))
      const b = this.workspace.rootToWorld(itemToRoot(item.transform, item.points[item.points.length - 1]))
      const mid = a.add(b).uniformScale(0.5)
      const toHead = head.sub(mid).normalize()
      const lt = label.obj.getTransform()
      lt.setWorldPosition(mid.add(new vec3(0, 1.4, 0)).add(toHead.uniformScale(0.5)))
      lt.setWorldRotation(quat.lookAt(toHead, vec3.up()))
      // Report the design length (sketch units are cm at life size), independent of the view scale.
      const ra = itemToRoot(item.transform, item.points[0])
      const rb = itemToRoot(item.transform, item.points[item.points.length - 1])
      const text = formatLength(ra.distance(rb))
      if (label.text.text !== text) {
        label.text.text = text
      }
    })

    // Note text floats just above its pin, facing the user, at a constant readable size.
    this.noteLabels.forEach((label, id) => {
      const item = this.doc.get(id)
      if (!item || hiddenLayers(item.layer)) {
        label.obj.enabled = false
        return
      }
      label.obj.enabled = true
      const pinTop = this.workspace.rootToWorld(itemToRoot(item.transform, {x: 0, y: NOTE_PIN_HEIGHT, z: 0}))
      const toHead = head.sub(pinTop).normalize()
      const lt = label.obj.getTransform()
      lt.setWorldPosition(pinTop.add(new vec3(0, 2.2, 0)).add(toHead.uniformScale(0.5)))
      lt.setWorldRotation(quat.lookAt(toHead, vec3.up()))
      const text = item.text ?? ""
      if (label.text.text !== text) {
        label.text.text = text
      }
    })
  }
}
