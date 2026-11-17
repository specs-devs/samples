export const DEBUG_DISABLE_SCROLL_WINDOWS = false;

export const MIN_SCALE = 0.001;
export const ICON_Z_OFFSET = 0.05;
export const TOOLTIP_OFFSET = new vec3(0, -3, 0.25);
export const CONTENT_TILT_DEG = -75.0;
export const THEME_KEYS = ["cat", "owl", "ghost", "axolotl", "crt", "robot"];

export const PANEL_WIDTH = 28;
export const Z_CONTENT = 0.5;
export const PANEL_PADDING = new vec2(2, 2);
export const TITLE_HEIGHT = 4;
export const SCROLLBAR_GAP = 1.75;
export const ANIM_DURATION = 0.35;

export const SETTINGS_TEXTURE: Texture = requireAsset(
  "Icons.lspkg/Iconography/System/gear.png",
) as Texture;
export const BOT_GROUP_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/BotGroup.png",
) as Texture;
export const BOT_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Bot.png",
) as Texture;
export const UNLINK_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/unlink.png",
) as Texture;
export const CLOSE_TEXTURE: Texture = requireAsset(
  "Icons.lspkg/Iconography/System/close.png",
) as Texture;
export const ATTACH_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/attach.png",
) as Texture;
export const TRASH_TEXTURE: Texture = requireAsset(
  "Icons.lspkg/Iconography/System/trash.png",
) as Texture;
export const CHEVRON_LEFT_TEXTURE: Texture = requireAsset(
  "Icons.lspkg/Iconography/Arrows/chevron-left.png",
) as Texture;
export const SPARKLES_TEXTURE: Texture = requireAsset(
  "Icons.lspkg/Iconography/System/sparkles.png",
) as Texture;
export const MICROPHONE_TEXTURE: Texture = requireAsset(
  "Icons.lspkg/Iconography/Media/microphone-on.png",
) as Texture;
export const SEND_TEXTURE: Texture = requireAsset(
  "Icons.lspkg/Iconography/Communication-people/send-to.png",
) as Texture;
