export const TextSize = {
  XS: 22,
  S: 24,
  M: 32,
  L: 36,
  XL: 40,
  XXL: 56,
  XXXL: 64,
  Title: 72,
} as const;

export type TextSizeValue = (typeof TextSize)[keyof typeof TextSize];

export const TextFont = {
  Light: requireAsset("../../../Visuals/Fonts/Inter_24pt-Light.ttf") as Font,
  Regular: requireAsset(
    "../../../Visuals/Fonts/Inter_24pt-Regular.ttf",
  ) as Font,
  Medium: requireAsset("../../../Visuals/Fonts/Inter_24pt-Medium.ttf") as Font,
  SemiBold: requireAsset(
    "../../../Visuals/Fonts/Inter_24pt-SemiBold.ttf",
  ) as Font,
} as const;

export type TextFontValue = (typeof TextFont)[keyof typeof TextFont];

/**
 * Applies size and font to a Text component.
 * Defaults to Inter Regular if no font is specified.
 */
export function styleText(
  text: Text,
  size: TextSizeValue,
  font: Font = TextFont.Regular,
): void {
  text.size = size;
  text.font = font;
  text.depthTest = true;
  text.setRenderOrder(1);
}
