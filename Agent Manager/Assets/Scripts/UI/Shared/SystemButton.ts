import { Button } from "UIKit.lspkg/Scripts/Components/Button/Button";

/**
 * System 3.0 button emphasis.
 *  - Primary:   the single main action in a context (send, new chat, submit,
 *               pair, attach). Filled gradient — use sparingly.
 *  - Secondary: supporting actions and toggles (settings, mic, camera, tabs,
 *               minimize, delete). Outlined, transparent fill.
 *  - Ghost:     low-emphasis chrome (back, close, thumbnails, tap targets).
 *  - Prism:     raised 3D beveled button, reserved for the "create" affordance (+).
 */
export type ButtonStyle = "Primary" | "Secondary" | "Ghost" | "Prism";

/**
 * Creates a square System 3.0 `Button` on `obj`. Style/shape must be set
 * before `initialize()`, so callers set `size` and then initialize as usual.
 */
export function createSystemButton(
  obj: SceneObject,
  style: ButtonStyle = "Secondary",
): Button {
  const btn = obj.createComponent(Button.getTypeName()) as Button;
  btn.setVariant({ theme: "System 3.0", shape: "Rectangle", style });
  return btn;
}

/**
 * Swaps a deprecated button component that lives in a prefab (and so can't be
 * created in code) for a System 3.0 `Button` of the same footprint. Must run
 * before the old button is initialized.
 */
export function replaceWithSystemButton(
  obj: SceneObject,
  oldTypeName: string,
  style: ButtonStyle,
  fallbackSize = 3,
): Button {
  const old = obj.getComponent(oldTypeName as keyof ComponentNameMap) as unknown as {
    width?: number;
    destroy(): void;
  } | null;
  // Keep the footprint the prefab was authored with.
  const size = old?.width ?? fallbackSize;
  if (old) old.destroy();
  const btn = createSystemButton(obj, style);
  btn.size = new vec3(size, size, 1);
  return btn;
}
