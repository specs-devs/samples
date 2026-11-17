/**
 * UIStyle — the single source of truth for menu typography and layout.
 *
 * Rules:
 *  - Pick text by ROLE (`TextStyle.X`), never by raw size. `TextSize` is the
 *    underlying scale and should only be referenced from this file.
 *  - Button labels are derived from button height via `buttonTextStyle()`;
 *    `createIconButton` does this automatically.
 *  - Use `Layout` tokens for shared dimensions (back buttons, rows, dialog
 *    buttons, gaps). Keep a local constant only for geometry that is truly
 *    unique to one view, and derive it from these tokens where possible.
 */
import { TextSize, TextFont, TextSizeValue, TextFontValue } from "./TextSizes";

export interface TextRole {
  readonly size: TextSizeValue;
  readonly font: TextFontValue;
}

export const TextStyle: {
  readonly PanelTitle: TextRole;
  readonly DialogTitle: TextRole;
  readonly ItemTitle: TextRole;
  readonly Body: TextRole;
  readonly Label: TextRole;
  readonly Secondary: TextRole;
  readonly Caption: TextRole;
  readonly Button: TextRole;
  readonly ButtonCompact: TextRole;
} = {
  /** Top-level view title, and the headline of full-panel empty/error states. */
  PanelTitle: { size: TextSize.XXL, font: TextFont.SemiBold },
  /** Modal or prompt title (confirmation dialog, permission request). */
  DialogTitle: { size: TextSize.XL, font: TextFont.SemiBold },
  /** Title of a row, card, tile, or toggle inside a panel. */
  ItemTitle: { size: TextSize.L, font: TextFont.SemiBold },
  /** Primary readable text: messages, instructions, dialog bodies, panel subtitles. */
  Body: { size: TextSize.M, font: TextFont.Regular },
  /** Emphasized single-line text: status lines, list-item names, inline empty-state headers. */
  Label: { size: TextSize.M, font: TextFont.Medium },
  /** Supporting text under an ItemTitle or Label. */
  Secondary: { size: TextSize.S, font: TextFont.Regular },
  /** Metadata: timestamps, footers, file paths. */
  Caption: { size: TextSize.XS, font: TextFont.Light },
  /** Label on a standard-height button. */
  Button: { size: TextSize.M, font: TextFont.Medium },
  /** Label on a compact button or chip. */
  ButtonCompact: { size: TextSize.S, font: TextFont.Medium },
};

/**
 * Text color tiers. Never go below `Muted` for text people need to read —
 * on Specs, low alpha over passthrough washes out fast, especially at size S.
 */
export const TextColor = {
  /** Titles, labels, button text, message bodies. */
  Primary: new vec4(1, 1, 1, 1),
  /** Instructions, dialog messages, de-emphasized headlines. */
  Secondary: new vec4(1, 1, 1, 0.75),
  /** Descriptions, subtitles, status lines, metadata. The readability floor. */
  Muted: new vec4(1, 1, 1, 0.6),
} as const;

export const Layout = {
  /** Standard button height (dialog actions, option lists, primary CTAs). */
  BUTTON_HEIGHT: 4,
  /** Compact button height (inline actions, chips). Buttons this short or
   *  shorter get `TextStyle.ButtonCompact` labels. */
  COMPACT_BUTTON_HEIGHT: 2.5,
  /** Width of each button in a side-by-side Cancel/Confirm style pair. */
  ACTION_BUTTON_WIDTH: 10,
  /** Gap between side-by-side action buttons. */
  ACTION_BUTTON_GAP: 2.5,
  /** Vertical gap between stacked option buttons / grid cells. */
  OPTION_GAP: 1.2,

  /** Square icon-only buttons (back, minimize, footer, tabs). */
  ICON_BUTTON_SIZE: 3.2,
  /** Icon glyph size as a fraction of its button. */
  ICON_RATIO: 0.47,
  /** Inset of a panel's back button from the panel's top-left corner. */
  BACK_BUTTON_MARGIN: 0.6,

  /** Header strip holding a panel/dialog title. */
  HEADER_HEIGHT: 4,
  /** Gap between a header and the content below it. */
  HEADER_CONTENT_GAP: 1.5,
  /** Settings-style row (label + control). */
  ROW_HEIGHT: 3,
  /** Small section heading above a group of rows. */
  SECTION_HEADER_HEIGHT: 2,
  /** One line of Secondary description text under a row. */
  DESC_HEIGHT: 2,
  /** Gap between sections / groups within a panel. */
  SECTION_GAP: 1.5,
} as const;

/** Text role for a button label, derived from the button's height. */
export function buttonTextStyle(buttonHeight: number): TextRole {
  return buttonHeight <= Layout.COMPACT_BUTTON_HEIGHT
    ? TextStyle.ButtonCompact
    : TextStyle.Button;
}
