export interface EncodedImage {
  data: string;
  dimension?: {
    width: number;
    height: number;
  };
}

export function encodeTextureToBase64(texture: Texture): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    Base64.encodeTextureAsync(
      texture,
      (encoded: string) => resolve(encoded),
      () => reject(new Error("Failed to encode texture to Base64")),
      CompressionQuality.HighQuality,
      EncodingType.Png,
    );
  });
}

export function decodeBase64ToTexture(data: string): Promise<Texture> {
  return new Promise<Texture>((resolve, reject) => {
    Base64.decodeTextureAsync(
      data,
      (decoded: Texture) => resolve(decoded),
      () => reject(new Error("Failed to decode Base64 to texture")),
    );
  });
}

export async function encodeTextureAsImage(
  texture: Texture,
): Promise<EncodedImage> {
  const data = await encodeTextureToBase64(texture);
  return {
    data,
    dimension: {
      width: texture.getWidth(),
      height: texture.getHeight(),
    },
  };
}
