/**
 * SPECS Inc. 2027
 * Map3D [BETA] – standalone 3D city map (Mapbox) clipped to a disc you can drag to explore.
 *
 * Give it a latitude/longitude and it renders, on a round tabletop map of `mapSizeCm`:
 *  - a Mapbox Static Images ground texture,
 *  - extruded buildings from Mapbox Streets v8 vector tiles (real footprints + heights),
 *  - the top POIs around the spot as pins with labels (Mapbox Tilequery),
 *  - a centre marker for the location of interest, and the required "© Mapbox © OpenStreetMap" attribution.
 * Pinch/drag on the map pans it; anything outside the disc is clipped (the "clamp mask").
 *
 * TOKEN: `mapboxToken` is intentionally empty. Paste your own token in the Inspector for local testing only —
 * never commit a scene/prefab that contains it. The token is never printed or logged by this script.
 */
import {Interactable} from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {Interactor} from "InteractionKit.lspkg/Core/Interactor/Interactor"
import {InteractorEvent} from "InteractionKit.lspkg/Core/Interactor/InteractorEvent"
import WorldCameraFinderProvider from "InteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {
  GroundPoint,
  cmPerMeter,
  groundScale,
  lonLatToGround,
  lonLatToTile,
  metersPerPixel512,
  tileSizeMercator,
  zoomForCoverage
} from "./MapboxMercator"
import {GEOM_POLYGON, TilePoint, decodeVectorTile, isGzip, ringArea} from "./MapboxVectorTile"

const TAG = "[Map3D]"
const API = "https://api.mapbox.com"
const TILESET = "mapbox.mapbox-streets-v8"
const GROUND_PX = 1280 // Static Images API max edge
const DISC_SEGMENTS = 72
const MAX_TILES = 16
const MAX_VERTS_PER_MESH = 60000
const MAX_RING_POINTS = 256
const REBUILD_INTERVAL_S = 0.06
const ATTRIBUTION = "© Mapbox © OpenStreetMap"

type Building = {ring: GroundPoint[]; cx: number; cy: number; reach: number; height: number; minHeight: number}
type Landmark = {name: string; p: GroundPoint; root: SceneObject; label: Text}

/** Flat-shaded, non-indexed-shared triangle soup that splits into <=60k-vertex RenderMeshes. */
class TriSoup {
  private chunks: number[][] = [[]]
  private add(p: vec3, n: vec3, u: number, v: number): void {
    let c = this.chunks[this.chunks.length - 1]
    c.push(p.x, p.y, p.z, n.x, n.y, n.z, u, v)
  }
  /** Adds a triangle, flipping its winding so it faces `n`. */
  tri(a: vec3, b: vec3, c: vec3, n: vec3, v: number = 0): void {
    if (this.chunks[this.chunks.length - 1].length / 8 + 3 > MAX_VERTS_PER_MESH) this.chunks.push([])
    const face = b.sub(a).cross(c.sub(a))
    if (face.dot(n) < 0) {
      const t = b
      b = c
      c = t
    }
    this.add(a, n, 0, v)
    this.add(b, n, 1, v)
    this.add(c, n, 1, v)
  }
  quad(a: vec3, b: vec3, c: vec3, d: vec3, n: vec3): void {
    this.tri(a, b, c, n, 0)
    this.tri(a, c, d, n, 1)
  }
  box(center: vec3, size: vec3): void {
    const h = size.uniformScale(0.5)
    const p = (x: number, y: number, z: number) => new vec3(center.x + x * h.x, center.y + y * h.y, center.z + z * h.z)
    this.quad(p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1), vec3.up())
    this.quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), vec3.down())
    this.quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), vec3.forward())
    this.quad(p(-1, -1, -1), p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1), vec3.back())
    this.quad(p(1, -1, -1), p(1, -1, 1), p(1, 1, 1), p(1, 1, -1), vec3.right())
    this.quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), vec3.left())
  }
  toMeshes(): RenderMesh[] {
    const out: RenderMesh[] = []
    for (const data of this.chunks) {
      const count = data.length / 8
      if (count < 3) continue
      const mb = newBuilder()
      mb.appendVerticesInterleaved(data)
      const idx = new Array<number>(count)
      for (let i = 0; i < count; i++) idx[i] = i
      mb.appendIndices(idx)
      if (mb.isValid()) {
        mb.updateMesh()
        out.push(mb.getMesh())
      }
    }
    return out
  }
}

function newBuilder(): MeshBuilder {
  const mb = new MeshBuilder([
    {name: "position", components: 3},
    {name: "normal", components: 3, normalized: true},
    {name: "texture0", components: 2}
  ])
  mb.topology = MeshTopology.Triangles
  mb.indexType = MeshIndexType.UInt16
  return mb
}

/** Ear-clipping triangulation of a simple CCW polygon (x east, y north). Falls back to a fan. */
function triangulate(pts: GroundPoint[]): number[] {
  const n = pts.length
  const out: number[] = []
  if (n < 3) return out
  const cross = (a: GroundPoint, b: GroundPoint, c: GroundPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const inTri = (p: GroundPoint, a: GroundPoint, b: GroundPoint, c: GroundPoint) =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0
  const idx: number[] = []
  for (let i = 0; i < n; i++) idx.push(i)
  let guard = 0
  while (idx.length > 3 && guard++ < n * n && n <= MAX_RING_POINTS) {
    let clipped = false
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length]
      const ib = idx[i]
      const ic = idx[(i + 1) % idx.length]
      const a = pts[ia]
      const b = pts[ib]
      const c = pts[ic]
      if (cross(a, b, c) <= 1e-9) continue
      let blocked = false
      for (const j of idx) {
        if (j !== ia && j !== ib && j !== ic && inTri(pts[j], a, b, c)) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      out.push(ia, ib, ic)
      idx.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  for (let i = 1; i + 1 < idx.length; i++) out.push(idx[0], idx[i], idx[i + 1])
  return out
}

function signedArea(r: GroundPoint[]): number {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y
  return a / 2
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN
  return isFinite(n) ? n : fallback
}

@component
export class Map3D extends BaseScriptComponent {
  @ui.label('<span style="color: #F59E0B;">Map3D [BETA]</span><br/><span style="color: #94A3B8; font-size: 11px;">Standalone 3D city map (Mapbox). Drag to explore; content is clipped to the disc.</span>')
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Mapbox</span>')
  @input
  @hint("Your PERSONAL Mapbox public token (pk.…) for local testing. Never commit it — leave empty in the repo.")
  mapboxToken: string = ""

  @input
  @hint("Mapbox style for the ground texture, e.g. mapbox/dark-v11, mapbox/light-v11, mapbox/streets-v12")
  mapStyle: string = "mapbox/dark-v11"

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Location of interest</span>')
  @input
  latitude: number = 51.5079

  @input
  longitude: number = -0.1281

  @input
  @hint("Label shown on the centre marker (empty = no label)")
  placeName: string = "Trafalgar Square"

  @input
  @hint("Load the map automatically on start")
  loadOnStart: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Area & scale</span>')
  @input
  @hint("Vector tile zoom for buildings (13–16). 15 = good default, 16 = more detail but more tiles")
  @widget(new SliderWidget(13, 16, 1))
  zoom: number = 15

  @input
  @hint("Ground radius (meters) visible inside the disc")
  radiusMeters: number = 300

  @input
  @hint("How far (meters) you can drag away from the location of interest")
  panRangeMeters: number = 300

  @input
  @hint("Diameter of the map disc in cm")
  mapSizeCm: number = 40

  @input
  @hint("Vertical exaggeration for buildings (1 = true scale)")
  heightScale: number = 1.5

  @input
  @hint("Height (m) used when a building has no height data")
  defaultBuildingHeight: number = 10

  @input
  @hint("Number of POI landmarks to show")
  landmarkCount: number = 8

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Look</span>')
  @input
  @hint("Material for the ground disc; its mainPass.baseTex receives the Mapbox image (an Unlit material works)")
  groundMaterial: Material

  @input
  @hint("Material for extruded buildings (a lit PBR material reads best)")
  buildingMaterial: Material

  @input
  @hint("Material for landmark pins")
  pinMaterial: Material

  @input
  @allowUndefined
  @hint("Optional material for the centre marker (defaults to the pin material)")
  markerMaterial: Material

  @input
  @allowUndefined
  @hint("Optional material for the thin rim around the disc")
  edgeMaterial: Material

  @input
  @hint("Flip the ground texture vertically if north/south appear mirrored")
  flipGroundV: boolean = false

  @input
  @hint("Text size for landmark labels")
  labelSize: number = 36

  @input
  @allowUndefined
  @hint("Optional Text for status messages (one is created above the map if empty)")
  statusText: Text

  @input
  enableLogging: boolean = false

  // ── runtime state ──────────────────────────────────────────────────────
  private internet: InternetModule = require("LensStudio:InternetModule") as InternetModule
  private remoteMedia: RemoteMediaModule = require("LensStudio:RemoteMediaModule") as RemoteMediaModule

  private content: SceneObject
  private buildingsObj: SceneObject
  private buildingVisuals: RenderMeshVisual[] = []
  private groundBuilder: MeshBuilder
  private groundVisual: RenderMeshVisual
  private groundMat: Material | null = null
  private groundHalfMeters = 0
  private marker: SceneObject
  private markerLabel: Text
  private attribution: Text
  private status: Text
  private pinMesh: RenderMesh

  private buildings: Building[] = []
  private landmarks: Landmark[] = []
  private pan: GroundPoint = {x: 0, y: 0}
  private dirty = true
  private buildingsDirty = true
  private lastRebuild = 0
  private loadId = 0

  private dragging = false
  private dragStartLocal: vec3 | null = null
  private dragStartPan: GroundPoint = {x: 0, y: 0}

  onAwake(): void {
    this.content = this.child(this.sceneObject, "Map3DContent")
    this.buildingsObj = this.child(this.content, "Buildings")
    this.pinMesh = this.makePinMesh()
    this.createGround()
    this.createEdge()
    this.createMarker()
    this.createTexts()
    this.setupInteraction()
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
    this.createEvent("OnStartEvent").bind(() => {
      if (this.loadOnStart) this.load()
      else this.setStatus(this.tokenMissing() ? this.tokenHelp() : "Map3D [BETA] ready — call load()")
    })
  }

  // ── public API ─────────────────────────────────────────────────────────

  /** Re-centres the map on a new location of interest and reloads it. */
  public setLocation(latitude: number, longitude: number, placeName?: string): void {
    this.latitude = latitude
    this.longitude = longitude
    if (placeName !== undefined) this.placeName = placeName
    this.load()
  }

  /** Recentres the view on the location of interest without reloading. */
  public recenter(): void {
    this.pan = {x: 0, y: 0}
    this.markDirty()
  }

  /** (Re)loads ground, buildings and landmarks for the current inputs. */
  public load(): void {
    this.loadAsync().catch((e) => this.setStatus("Map3D error: " + this.safe(e)))
  }

  // ── loading ────────────────────────────────────────────────────────────

  private tokenMissing(): boolean {
    return !this.mapboxToken || this.mapboxToken.trim().length === 0
  }

  private tokenHelp(): string {
    return "Add your Mapbox token on Map3D\n(Inspector → Mapbox Token)"
  }

  private async loadAsync(): Promise<void> {
    const id = ++this.loadId
    this.clearData()
    if (this.tokenMissing()) {
      this.setStatus(this.tokenHelp())
      return
    }
    this.markerLabel.text = this.placeName || ""
    this.setStatus("Loading map…")
    const area = Math.max(10, this.radiusMeters) + Math.max(0, this.panRangeMeters)
    const errors: string[] = []
    const guard = (label: string, p: Promise<void>) =>
      p.catch((e) => {
        errors.push(label + ": " + this.safe(e))
      })
    await Promise.all([
      guard("ground", this.loadGround(area, id)),
      guard("buildings", this.loadBuildings(area, id)),
      guard("landmarks", this.loadLandmarks(area, id))
    ])
    if (id !== this.loadId) return
    this.setStatus(errors.length ? errors.join("\n") : "")
    this.log("loaded " + this.buildings.length + " buildings, " + this.landmarks.length + " landmarks")
    this.markDirty()
  }

  private url(path: string, query: string): string {
    const sep = query.length ? "&" : ""
    return API + path + "?" + query + sep + "access_token=" + encodeURIComponent(this.mapboxToken.trim())
  }

  private async fetchOk(url: string): Promise<Response> {
    const res = await this.internet.fetch(url, {method: "GET"})
    if (res.status === 401 || res.status === 403) throw new Error("token rejected (" + res.status + ") — check your Mapbox token/scopes")
    if (res.status === 429) throw new Error("rate limited by Mapbox (429)")
    if (res.status < 200 || res.status >= 300) throw new Error("HTTP " + res.status)
    return res
  }

  private loadGround(area: number, id: number): Promise<void> {
    const z = Math.max(0, Math.min(22, Math.floor(zoomForCoverage(this.latitude, area * 2, GROUND_PX) * 100) / 100))
    this.groundHalfMeters = (GROUND_PX / 2) * metersPerPixel512(this.latitude, z)
    const style = this.mapStyle.trim().replace(/^mapbox:\/\/styles\//, "") || "mapbox/dark-v11"
    const center = this.longitude.toFixed(6) + "," + this.latitude.toFixed(6) + "," + z + ",0"
    const url = this.url(
      "/styles/v1/" + style + "/static/" + center + "/" + GROUND_PX + "x" + GROUND_PX,
      "attribution=false&logo=false"
    )
    return new Promise<void>((resolve, reject) => {
      const resource = this.internet.makeResourceFromUrl(url)
      this.remoteMedia.loadResourceAsImageTexture(
        resource,
        (texture) => {
          if (id !== this.loadId) return resolve()
          if (!this.groundMat && this.groundMaterial) this.groundMat = this.groundMaterial.clone()
          if (this.groundMat) {
            this.groundMat.mainPass.baseTex = texture
            this.groundVisual.mainMaterial = this.groundMat
          }
          this.markDirty()
          resolve()
        },
        (err) => reject(new Error("image failed (" + this.safe(err) + ")"))
      )
    })
  }

  private async loadBuildings(area: number, id: number): Promise<void> {
    let z = Math.round(Math.max(13, Math.min(16, this.zoom)))
    const k = groundScale(this.latitude)
    let range = this.tileRange(z, area / k)
    while (range.count > MAX_TILES && z > 13) range = this.tileRange(--z, area / k)
    const tasks: Promise<Building[]>[] = []
    for (let x = range.x0; x <= range.x1; x++) {
      for (let y = range.y0; y <= range.y1; y++) {
        tasks.push(this.loadBuildingTile(z, x, y, area))
      }
    }
    let gzip = false
    const results = await Promise.all(
      tasks.map((t) =>
        t.catch((e) => {
          if (String(e).indexOf("gzip") >= 0) gzip = true
          else throw e
          return [] as Building[]
        })
      )
    )
    if (id !== this.loadId) return
    let all: Building[] = []
    for (const r of results) all = all.concat(r)
    if (gzip && all.length === 0) {
      this.log("vector tiles arrived gzip-compressed; falling back to Tilequery boxes")
      all = await this.loadBuildingsTilequery(area)
      if (id !== this.loadId) return
    }
    this.buildings = all
    this.buildingsDirty = true
  }

  private tileRange(z: number, mercHalf: number) {
    const c = lonLatToTile(this.longitude, this.latitude, z)
    const t = mercHalf / tileSizeMercator(z)
    const n = Math.pow(2, z)
    const x0 = Math.floor(c.x - t)
    const x1 = Math.floor(c.x + t)
    const y0 = Math.max(0, Math.floor(c.y - t))
    const y1 = Math.min(n - 1, Math.floor(c.y + t))
    return {x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1)}
  }

  private async loadBuildingTile(z: number, tx: number, ty: number, area: number): Promise<Building[]> {
    const n = Math.pow(2, z)
    const wx = ((tx % n) + n) % n
    const res = await this.fetchOk(this.url("/v4/" + TILESET + "/" + z + "/" + wx + "/" + ty + ".vector.pbf", ""))
    const bytes = await res.bytes()
    if (isGzip(bytes)) throw new Error("gzip")
    const layers = decodeVectorTile(bytes, ["building"])
    const c = lonLatToTile(this.longitude, this.latitude, z)
    const ts = tileSizeMercator(z)
    const k = groundScale(this.latitude)
    const out: Building[] = []
    for (const layer of layers) {
      const ext = layer.extent || 4096
      const toGround = (p: TilePoint): GroundPoint => ({
        x: (tx + p.x / ext - c.x) * ts * k,
        y: -(ty + p.y / ext - c.y) * ts * k
      })
      for (const f of layer.features) {
        if (f.type !== GEOM_POLYGON || f.rings.length === 0) continue
        const pr = f.properties
        if (String(pr["underground"]) === "true" || String(pr["extrude"]) === "false") continue
        const height = num(pr["height"], this.defaultBuildingHeight)
        const minHeight = num(pr["min_height"], 0)
        const outerSign = Math.sign(ringArea(f.rings[0]))
        for (const ring of f.rings) {
          if (ring.length < 3 || Math.sign(ringArea(ring)) !== outerSign) continue // holes skipped (beta)
          const b = this.makeBuilding(ring.map(toGround), height, minHeight, area)
          if (b) out.push(b)
        }
      }
    }
    return out
  }

  private makeBuilding(pts: GroundPoint[], height: number, minHeight: number, area: number): Building | null {
    const last = pts[pts.length - 1]
    if (pts.length > 1 && last.x === pts[0].x && last.y === pts[0].y) pts.pop()
    if (pts.length < 3 || pts.length > MAX_RING_POINTS) return null
    if (Math.abs(signedArea(pts)) < 1) return null
    if (signedArea(pts) < 0) pts.reverse()
    let cx = 0
    let cy = 0
    for (const p of pts) {
      cx += p.x
      cy += p.y
    }
    cx /= pts.length
    cy /= pts.length
    if (Math.hypot(cx, cy) > area + 50) return null
    let reach = 0
    for (const p of pts) reach = Math.max(reach, Math.hypot(p.x - cx, p.y - cy))
    return {ring: pts, cx, cy, reach, height: Math.max(height, minHeight + 1), minHeight}
  }

  /** Fallback when vector tiles can't be decoded: approximate 14 m boxes at Tilequery building hits (max 50). */
  private async loadBuildingsTilequery(area: number): Promise<Building[]> {
    const res = await this.fetchOk(
      this.url(
        "/v4/" + TILESET + "/tilequery/" + this.longitude.toFixed(6) + "," + this.latitude.toFixed(6) + ".json",
        "radius=" + Math.round(area) + "&limit=50&layers=building"
      )
    )
    const json = await res.json()
    const out: Building[] = []
    for (const f of (json && json.features) || []) {
      const coords = f.geometry && f.geometry.coordinates
      if (!coords) continue
      const g = lonLatToGround(coords[0], coords[1], this.longitude, this.latitude)
      const h = 7
      const ring = [
        {x: g.x - h, y: g.y - h},
        {x: g.x + h, y: g.y - h},
        {x: g.x + h, y: g.y + h},
        {x: g.x - h, y: g.y + h}
      ]
      const pr = f.properties || {}
      const b = this.makeBuilding(ring, num(pr.height, this.defaultBuildingHeight), num(pr.min_height, 0), area)
      if (b) out.push(b)
    }
    return out
  }

  private async loadLandmarks(area: number, id: number): Promise<void> {
    if (this.landmarkCount <= 0) return
    const res = await this.fetchOk(
      this.url(
        "/v4/" + TILESET + "/tilequery/" + this.longitude.toFixed(6) + "," + this.latitude.toFixed(6) + ".json",
        "radius=" + Math.round(area) + "&limit=50&layers=poi_label&dedupe=true"
      )
    )
    const json = await res.json()
    if (id !== this.loadId) return
    type Poi = {name: string; rank: number; dist: number; lon: number; lat: number}
    const pois: Poi[] = []
    const seen: {[n: string]: boolean} = {}
    for (const f of (json && json.features) || []) {
      const pr = f.properties || {}
      const coords = f.geometry && f.geometry.coordinates
      const name = pr.name_en || pr.name
      if (!name || !coords || seen[name]) continue
      seen[name] = true
      pois.push({
        name: String(name),
        rank: num(pr.filterrank, 5) * 10 + num(pr.sizerank, 16),
        dist: num(pr.tilequery && pr.tilequery.distance, 0),
        lon: coords[0],
        lat: coords[1]
      })
    }
    pois.sort((a, b) => a.rank - b.rank || a.dist - b.dist)
    for (const poi of pois.slice(0, Math.floor(this.landmarkCount))) {
      this.landmarks.push(this.createLandmark(poi.name, lonLatToGround(poi.lon, poi.lat, this.longitude, this.latitude)))
    }
  }

  private clearData(): void {
    for (const l of this.landmarks) l.root.destroy()
    this.landmarks = []
    this.buildings = []
    this.pan = {x: 0, y: 0}
    this.buildingsDirty = true
    this.markDirty()
  }

  // ── per-frame view update (pan + clamp mask) ───────────────────────────

  private markDirty(): void {
    this.dirty = true
    this.buildingsDirty = true
  }

  private onUpdate(): void {
    if (this.dirty) {
      this.dirty = false
      this.updateGroundUVs()
      this.updatePins()
    }
    const now = getTime()
    if (this.buildingsDirty && now - this.lastRebuild >= REBUILD_INTERVAL_S) {
      this.buildingsDirty = false
      this.lastRebuild = now
      this.rebuildBuildings()
    }
    this.billboardLabels()
  }

  private get scale(): number {
    return cmPerMeter(this.radiusMeters, this.mapSizeCm)
  }

  private updateGroundUVs(): void {
    const half = this.groundHalfMeters > 0 ? this.groundHalfMeters : this.radiusMeters + this.panRangeMeters
    const r = this.radiusMeters
    const s = this.scale
    for (let i = 0; i <= DISC_SEGMENTS; i++) {
      let gx = 0
      let gy = 0
      if (i > 0) {
        const a = ((i - 1) / DISC_SEGMENTS) * Math.PI * 2
        gx = Math.cos(a) * r
        gy = Math.sin(a) * r
      }
      const u = 0.5 + (this.pan.x + gx) / (2 * half)
      let v = 0.5 + (this.pan.y + gy) / (2 * half)
      if (this.flipGroundV) v = 1 - v
      this.groundBuilder.setVertexInterleaved(i, [gx * s, 0, -gy * s, 0, 1, 0, u, v])
    }
    this.groundBuilder.updateMesh()
  }

  private rebuildBuildings(): void {
    const s = this.scale
    const r = this.radiusMeters
    const hs = s * this.heightScale
    const soup = new TriSoup()
    const up = vec3.up()
    for (const b of this.buildings) {
      const bx = b.cx - this.pan.x
      const by = b.cy - this.pan.y
      if (Math.hypot(bx, by) + b.reach > r) continue // clamp mask: whole footprint must be inside the disc
      const ring = b.ring
      const y0 = b.minHeight * hs + 0.05
      const y1 = Math.max(b.height * hs, y0 + 0.1)
      const lo: vec3[] = []
      const hi: vec3[] = []
      for (const p of ring) {
        const x = (p.x - this.pan.x) * s
        const z = -(p.y - this.pan.y) * s
        lo.push(new vec3(x, y0, z))
        hi.push(new vec3(x, y1, z))
      }
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length
        const de = ring[j].x - ring[i].x
        const dn = ring[j].y - ring[i].y
        const len = Math.hypot(de, dn)
        if (len < 1e-6) continue
        soup.quad(lo[i], lo[j], hi[j], hi[i], new vec3(dn / len, 0, de / len)) // outward for a CCW ring
      }
      const tris = triangulate(ring)
      for (let t = 0; t + 2 < tris.length; t += 3) soup.tri(hi[tris[t]], hi[tris[t + 1]], hi[tris[t + 2]], up, 1)
    }
    const meshes = soup.toMeshes()
    while (this.buildingVisuals.length < meshes.length) {
      const v = this.buildingsObj.createComponent("Component.RenderMeshVisual")
      if (this.buildingMaterial) v.mainMaterial = this.buildingMaterial
      this.buildingVisuals.push(v)
    }
    for (let i = 0; i < this.buildingVisuals.length; i++) {
      const v = this.buildingVisuals[i]
      if (i < meshes.length) {
        v.mesh = meshes[i]
        v.enabled = true
      } else {
        v.enabled = false
      }
    }
  }

  private updatePins(): void {
    const s = this.scale
    const limit = this.radiusMeters * 0.97
    const place = (obj: SceneObject, p: GroundPoint) => {
      const x = p.x - this.pan.x
      const y = p.y - this.pan.y
      const inside = Math.hypot(x, y) <= limit
      obj.enabled = inside
      if (inside) obj.getTransform().setLocalPosition(new vec3(x * s, 0, -y * s))
    }
    place(this.marker, {x: 0, y: 0})
    for (const l of this.landmarks) place(l.root, l.p)
  }

  private billboardLabels(): void {
    let cam: vec3
    try {
      cam = WorldCameraFinderProvider.getInstance().getTransform().getWorldPosition()
    } catch (e) {
      return
    }
    const face = (t: Text) => {
      if (!t || !t.getSceneObject().isEnabledInHierarchy) return
      const tr = t.getSceneObject().getTransform()
      const d = cam.sub(tr.getWorldPosition())
      d.y = 0
      if (d.length < 1e-3) return
      tr.setWorldRotation(quat.lookAt(d.normalize(), vec3.up()))
    }
    face(this.markerLabel)
    for (const l of this.landmarks) face(l.label)
  }

  // ── drag to pan ────────────────────────────────────────────────────────

  private setupInteraction(): void {
    let collider = this.sceneObject.getComponent("Physics.ColliderComponent")
    if (!collider) {
      collider = this.sceneObject.createComponent("Physics.ColliderComponent")
      const shape = Shape.createBoxShape()
      shape.size = new vec3(this.mapSizeCm, 2, this.mapSizeCm)
      collider.shape = shape
      collider.fitVisual = false
    }
    let interactable = this.sceneObject.getComponent(Interactable.getTypeName()) as Interactable
    if (!interactable) interactable = this.sceneObject.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onInteractorTriggerStart.add((e: InteractorEvent) => this.onDragStart(e.interactor))
    interactable.onTriggerUpdate.add((e: InteractorEvent) => this.onDragUpdate(e.interactor))
    interactable.onInteractorTriggerEnd.add(() => this.onDragEnd())
    interactable.onTriggerCanceled.add(() => this.onDragEnd())
  }

  /** Intersects the interactor ray with the map plane; returns the hit in this object's local space (cm). */
  private rayToLocal(interactor: Interactor): vec3 | null {
    if (!interactor || !interactor.startPoint || !interactor.direction) return null
    const tr = this.getTransform()
    const normal = tr.up
    const origin = interactor.startPoint
    const dir = interactor.direction
    const denom = dir.dot(normal)
    if (Math.abs(denom) < 1e-4) return null
    const t = tr.getWorldPosition().sub(origin).dot(normal) / denom
    if (t < 0) return null
    return tr.getInvertedWorldTransform().multiplyPoint(origin.add(dir.uniformScale(t)))
  }

  private onDragStart(interactor: Interactor): void {
    this.dragStartLocal = this.rayToLocal(interactor)
    this.dragStartPan = {x: this.pan.x, y: this.pan.y}
    this.dragging = this.dragStartLocal !== null
  }

  private onDragUpdate(interactor: Interactor): void {
    if (!this.dragging || !this.dragStartLocal) return
    const hit = this.rayToLocal(interactor)
    if (!hit) return
    const s = this.scale
    const de = (hit.x - this.dragStartLocal.x) / s
    const dn = -(hit.z - this.dragStartLocal.z) / s
    let px = this.dragStartPan.x - de
    let py = this.dragStartPan.y - dn
    const maxPan = Math.max(0, Math.min(this.panRangeMeters, this.groundHalfMeters > 0 ? this.groundHalfMeters - this.radiusMeters : this.panRangeMeters))
    const d = Math.hypot(px, py)
    if (d > maxPan && d > 0) {
      px *= maxPan / d
      py *= maxPan / d
    }
    this.pan = {x: px, y: py}
    this.markDirty()
  }

  private onDragEnd(): void {
    this.dragging = false
    this.dragStartLocal = null
  }

  // ── scene construction ────────────────────────────────────────────────

  private child(parent: SceneObject, name: string): SceneObject {
    const o = global.scene.createSceneObject(name)
    o.setParent(parent)
    o.layer = parent.layer
    return o
  }

  private createGround(): void {
    const obj = this.child(this.content, "Ground")
    this.groundBuilder = newBuilder()
    const verts: number[] = []
    const r = this.mapSizeCm / 2
    verts.push(0, 0, 0, 0, 1, 0, 0.5, 0.5)
    for (let i = 0; i < DISC_SEGMENTS; i++) {
      const a = (i / DISC_SEGMENTS) * Math.PI * 2
      // +X east, -Z north; counter-clockwise seen from above so the disc faces +Y.
      verts.push(Math.cos(a) * r, 0, -Math.sin(a) * r, 0, 1, 0, 0.5, 0.5)
    }
    this.groundBuilder.appendVerticesInterleaved(verts)
    const idx: number[] = []
    for (let i = 0; i < DISC_SEGMENTS; i++) idx.push(0, 1 + i, 1 + ((i + 1) % DISC_SEGMENTS))
    this.groundBuilder.appendIndices(idx)
    this.groundBuilder.updateMesh()
    this.groundVisual = obj.createComponent("Component.RenderMeshVisual")
    this.groundVisual.mesh = this.groundBuilder.getMesh()
    if (this.groundMaterial) this.groundVisual.mainMaterial = this.groundMaterial
  }

  private createEdge(): void {
    if (!this.edgeMaterial) return
    const soup = new TriSoup()
    const r0 = this.mapSizeCm / 2
    const r1 = r0 + Math.max(0.3, this.mapSizeCm * 0.012)
    const h = Math.max(0.3, this.mapSizeCm * 0.01)
    for (let i = 0; i < DISC_SEGMENTS; i++) {
      const a = (i / DISC_SEGMENTS) * Math.PI * 2
      const b = ((i + 1) / DISC_SEGMENTS) * Math.PI * 2
      const p = (rad: number, ang: number, y: number) => new vec3(Math.cos(ang) * rad, y, -Math.sin(ang) * rad)
      const mid = (a + b) / 2
      const out = new vec3(Math.cos(mid), 0, -Math.sin(mid))
      soup.quad(p(r1, a, -h), p(r1, b, -h), p(r1, b, h), p(r1, a, h), out)
      soup.quad(p(r0, a, -h), p(r0, b, -h), p(r0, b, h), p(r0, a, h), out.uniformScale(-1))
      soup.quad(p(r0, a, h), p(r1, a, h), p(r1, b, h), p(r0, b, h), vec3.up())
    }
    const obj = this.child(this.sceneObject, "Rim")
    for (const m of soup.toMeshes()) {
      const v = obj.createComponent("Component.RenderMeshVisual")
      v.mesh = m
      v.mainMaterial = this.edgeMaterial
    }
  }

  private makePinMesh(): RenderMesh {
    const k = this.mapSizeCm / 40
    const soup = new TriSoup()
    soup.box(new vec3(0, 1.25 * k, 0), new vec3(0.15 * k, 2.5 * k, 0.15 * k))
    soup.box(new vec3(0, 2.75 * k, 0), new vec3(0.6 * k, 0.6 * k, 0.6 * k))
    return soup.toMeshes()[0]
  }

  private addPin(parent: SceneObject, material: Material | null, scale: number): void {
    const pin = this.child(parent, "Pin")
    pin.getTransform().setLocalScale(vec3.one().uniformScale(scale))
    const v = pin.createComponent("Component.RenderMeshVisual")
    v.mesh = this.pinMesh
    if (material) v.mainMaterial = material
  }

  private makeText(parent: SceneObject, name: string, size: number, pos: vec3): Text {
    const o = this.child(parent, name)
    o.getTransform().setLocalPosition(pos)
    const t = o.createComponent("Component.Text")
    t.size = size
    t.text = ""
    t.textFill.color = new vec4(1, 1, 1, 1)
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Bottom
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.depthTest = true
    return t
  }

  private createMarker(): void {
    this.marker = this.child(this.content, "CentreMarker")
    this.addPin(this.marker, this.markerMaterial || this.pinMaterial, 1.6)
    this.markerLabel = this.makeText(this.marker, "Label", this.labelSize * 1.2, new vec3(0, 5.2 * (this.mapSizeCm / 40), 0))
    this.markerLabel.text = this.placeName || ""
  }

  private createLandmark(name: string, p: GroundPoint): Landmark {
    const root = this.child(this.content, "Landmark " + name)
    this.addPin(root, this.pinMaterial, 1)
    const label = this.makeText(root, "Label", this.labelSize, new vec3(0, 3.4 * (this.mapSizeCm / 40), 0))
    label.text = name
    return {name, p, root, label}
  }

  private createTexts(): void {
    const r = this.mapSizeCm / 2
    // Attribution is required by the Mapbox terms whenever Mapbox maps/data are shown. Do not remove.
    this.attribution = this.makeText(this.sceneObject, "Attribution", Math.max(16, this.labelSize * 0.6), new vec3(0, 0.4, r + 1.5))
    this.attribution.text = ATTRIBUTION
    if (this.statusText) {
      this.status = this.statusText
    } else {
      this.status = this.makeText(this.sceneObject, "Status", this.labelSize * 1.1, new vec3(0, r * 0.5, -r))
    }
  }

  // ── utils ──────────────────────────────────────────────────────────────

  private setStatus(msg: string): void {
    if (this.status) this.status.text = msg ? "Map3D [BETA]\n" + msg : ""
    if (msg) this.log(msg)
  }

  /** Error text with any token scrubbed out. */
  private safe(e: unknown): string {
    let s = e instanceof Error ? e.message : String(e)
    const tok = (this.mapboxToken || "").trim()
    if (tok.length > 0) s = s.split(tok).join("<token>").split(encodeURIComponent(tok)).join("<token>")
    return s.replace(/access_token=[^&\s]+/g, "access_token=<token>")
  }

  private log(msg: string): void {
    if (this.enableLogging) print(TAG + " " + msg)
  }
}
