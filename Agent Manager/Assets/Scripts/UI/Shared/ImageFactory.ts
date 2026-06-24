const ICON_MATERIAL: Material = requireAsset(
  "../../../Visuals/Materials/Image.mat",
) as Material;

export interface ImageOptions {
  parent: SceneObject;
  name?: string;
  position?: vec3;
  size?: number;
  scale?: vec3;
  shared?: boolean;
}

const MAX_MATERIAL_CACHE_SIZE = 32;
const materialCache = new Map<Texture, Material>();

function getSharedMaterial(texture: Texture): Material {
  const cached = materialCache.get(texture);
  if (cached) return cached;
  if (materialCache.size >= MAX_MATERIAL_CACHE_SIZE) {
    // Evict the oldest entry to prevent unbounded growth from captured textures.
    materialCache.delete(materialCache.keys().next().value);
  }
  const mat = ICON_MATERIAL.clone();
  mat.mainPass.baseTex = texture;
  materialCache.set(texture, mat);
  return mat;
}

/**
 * Creates a SceneObject with a configured Image component.
 * When `size` is provided, the image fits within a `size x size` bounding box
 * while preserving the texture's aspect ratio.
 * When `scale` is provided, it is used directly. `scale` takes precedence over `size`.
 *
 * By default, materials are shared across images with the same texture.
 * Pass `shared: false` if the material will be mutated after creation.
 */
export function createImage(texture: Texture, options: ImageOptions): Image {
  const obj = global.scene.createSceneObject(options.name ?? "Icon");
  obj.setParent(options.parent);

  if (options.position) {
    obj.getTransform().setLocalPosition(options.position);
  }

  if (options.scale) {
    obj.getTransform().setLocalScale(options.scale);
  } else if (options.size !== undefined) {
    const tw = texture.getWidth();
    const th = texture.getHeight();
    const maxDim = Math.max(tw, th, 1);
    const sx = options.size * (tw / maxDim);
    const sy = options.size * (th / maxDim);
    obj.getTransform().setLocalScale(new vec3(sx, sy, 1));
  }

  const shared = options.shared !== false;
  const image = obj.createComponent("Image") as Image;
  image.clearMaterials();
  if (shared) {
    image.mainMaterial = getSharedMaterial(texture);
  } else {
    image.mainMaterial = ICON_MATERIAL.clone();
    image.mainMaterial.mainPass.baseTex = texture;
  }
  image.mainPass.depthTest = true;
  image.mainPass.depthWrite = true;
  image.renderOrder = 0;
  return image;
}
