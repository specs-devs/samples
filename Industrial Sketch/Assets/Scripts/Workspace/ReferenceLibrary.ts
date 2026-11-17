/**
 * SPECS Inc. 2027
 * Built-in reference models at real-world size (cm), for checking proportions while sketching: furniture,
 * handheld products and a compact car. Each model is a group of ordinary primitive items, so it can be moved,
 * scaled, recolored, hidden on a layer or deleted like anything else.
 */
import {identityTransform, ItemKind, MaterialPreset, newItemId, SketchItem} from "../Core/SketchTypes"
import {PrimitiveKind} from "../Geometry/Primitives"
import {P3} from "../Geometry/Vec"

interface Part {
  primitive: PrimitiveKind
  /** Center, relative to the model's footprint center on the floor. */
  at: [number, number, number]
  /** Size of the unit primitive along x, y, z. */
  size: [number, number, number]
  /** Optional rotation about X (radians), e.g. to stand a ring upright. */
  rotateX?: number
  /** Optional rotation about Z (radians), e.g. to turn a cylinder's axis onto X for a wheel. */
  rotateZ?: number
  color?: [number, number, number]
}

export interface ReferenceModel {
  id: string
  label: string
  parts: Part[]
}

const WOOD: [number, number, number] = [0.6, 0.45, 0.32]
const GRAY: [number, number, number] = [0.7, 0.72, 0.75]
const DARK: [number, number, number] = [0.18, 0.19, 0.21]
const GLASS: [number, number, number] = [0.45, 0.65, 0.8]

function legs(width: number, depth: number, height: number, thickness: number, color: [number, number, number]) {
  const out: Part[] = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push({
        primitive: PrimitiveKind.Cylinder,
        at: [(sx * (width - thickness)) / 2, height / 2, (sz * (depth - thickness)) / 2],
        size: [thickness, height, thickness],
        color
      })
    }
  }
  return out
}

export const REFERENCE_MODELS: ReferenceModel[] = [
  {
    id: "chair",
    label: "Chair",
    parts: [
      {primitive: PrimitiveKind.Cube, at: [0, 44, 0], size: [44, 4, 42], color: WOOD},
      ...legs(40, 38, 42, 3, DARK),
      {primitive: PrimitiveKind.Cube, at: [0, 68, -19.5], size: [44, 32, 3], color: WOOD}
    ]
  },
  {
    id: "table",
    label: "Table",
    parts: [
      {primitive: PrimitiveKind.Cube, at: [0, 73, 0], size: [140, 4, 80], color: WOOD},
      ...legs(130, 70, 71, 5, DARK)
    ]
  },
  {
    id: "phone",
    label: "Phone",
    parts: [
      {primitive: PrimitiveKind.Cube, at: [0, 7.4, 0], size: [7.2, 14.8, 0.8], color: DARK},
      {primitive: PrimitiveKind.Cube, at: [0, 7.4, 0.42], size: [6.8, 14.2, 0.05], color: GLASS}
    ]
  },
  {
    id: "mug",
    label: "Mug",
    parts: [
      {primitive: PrimitiveKind.Cylinder, at: [0, 4.75, 0], size: [8.5, 9.5, 8.5], color: GRAY},
      {primitive: PrimitiveKind.Torus, at: [4.6, 5, 0], size: [6, 6, 6], rotateX: Math.PI / 2, color: GRAY}
    ]
  },
  {
    id: "bottle",
    label: "Bottle",
    parts: [
      {primitive: PrimitiveKind.Cylinder, at: [0, 9, 0], size: [6.5, 18, 6.5], color: GLASS},
      {primitive: PrimitiveKind.Cone, at: [0, 20, 0], size: [6.5, 4, 6.5], color: GLASS},
      {primitive: PrimitiveKind.Cylinder, at: [0, 22.5, 0], size: [2.8, 2, 2.8], color: DARK}
    ]
  },
  {
    id: "car",
    label: "Compact car",
    parts: [
      {primitive: PrimitiveKind.Cube, at: [0, 55, 0], size: [175, 55, 400], color: GRAY},
      {primitive: PrimitiveKind.Cube, at: [0, 107, -15], size: [158, 50, 210], color: GLASS},
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map(
          (sz): Part => ({
            primitive: PrimitiveKind.Cylinder,
            at: [sx * 76, 32, sz * 128],
            // Diameter, tire width, diameter along the cylinder's own axes; turned so the axle runs along X.
            size: [64, 22, 64],
            rotateZ: Math.PI / 2,
            color: DARK
          })
        )
      )
    ]
  }
]

/**
 * Builds the items of a reference model standing on the floor at `base` (sketch-root space), as one group.
 */
export function referenceItems(model: ReferenceModel, base: P3, layer: number): SketchItem[] {
  const group = newItemId()
  return model.parts.map((part) => {
    const t = identityTransform()
    t.position = {x: base.x + part.at[0], y: base.y + part.at[1], z: base.z + part.at[2]}
    t.scale = {x: part.size[0], y: part.size[1], z: part.size[2]}
    if (part.rotateZ) {
      t.rotation = [0, 0, Math.sin(part.rotateZ / 2), Math.cos(part.rotateZ / 2)]
    } else if (part.rotateX) {
      t.rotation = [Math.sin(part.rotateX / 2), 0, 0, Math.cos(part.rotateX / 2)]
    }
    return {
      id: newItemId(),
      kind: ItemKind.Primitive,
      primitive: part.primitive,
      color: part.color ?? GRAY,
      material: MaterialPreset.Matte,
      layer,
      group,
      transform: t
    }
  })
}
