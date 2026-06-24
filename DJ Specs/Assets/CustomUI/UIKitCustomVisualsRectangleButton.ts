import { RectangleButton } from 'SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton';
import {
  RoundedRectangleVisual,
  RoundedRectangleVisualState,
} from 'SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangleVisual';
import { StateName } from 'SpectaclesUIKit.lspkg/Scripts/Components/Element';
import { GradientParameters } from 'SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle';

// Same palette as UIKitCustomVisualsFrame
const PINK  = new vec4(1.00, 0.42, 0.71, 1.0);
const MAGEN = new vec4(0.88, 0.38, 0.82, 1.0);
const PURP  = new vec4(0.55, 0.48, 0.90, 1.0);
const BLUE  = new vec4(0.26, 0.72, 0.94, 1.0);
const H_PINK = new vec4(1.00, 0.60, 0.82, 1.0);
const H_PURP = new vec4(0.68, 0.60, 0.96, 1.0);
const H_BLUE = new vec4(0.48, 0.82, 0.98, 1.0);
const BORDER  = new vec4(1.0, 1.0, 1.0, 0.70);
const BORDER_H = new vec4(1.0, 0.85, 0.95, 1.0);

const DEFAULT_GRAD: GradientParameters = {
  enabled: true, type: 'Linear',
  start: new vec2(0, 1), end: new vec2(0, -1),
  stop0: { enabled: true, percent: 0,    color: PINK  },
  stop1: { enabled: true, percent: 0.35, color: MAGEN },
  stop2: { enabled: true, percent: 0.65, color: PURP  },
  stop3: { enabled: true, percent: 1.0,  color: BLUE  },
};

const HOVERED_GRAD: GradientParameters = {
  enabled: true, type: 'Linear',
  start: new vec2(0, 1), end: new vec2(0, -1),
  stop0: { enabled: true, percent: 0,    color: H_PINK },
  stop1: { enabled: true, percent: 0.40, color: H_PURP },
  stop2: { enabled: true, percent: 0.75, color: H_PURP },
  stop3: { enabled: true, percent: 1.0,  color: H_BLUE },
};

/**
 * UIKitCustomVisualsRectangleButton applies the same hot-pink → sky-blue gradient
 * as the Frame to each RectangleButton.
 *
 * Two-path approach to handle both pre-initialized and not-yet-initialized buttons:
 *  A) onAwake:       sets custom visual before button auto-initializes (prefab instantiation)
 *  B) OnStartEvent:  overrides the visual's gradient via public API regardless of timing
 *
 * Attach to the same SceneObject as the RectangleButton component.
 */
@component
export class UIKitCustomVisualsRectangleButton extends BaseScriptComponent {
  onAwake() {
    const button = this.sceneObject.getComponent(
      RectangleButton.getTypeName()
    ) as RectangleButton;

    if (!button) {
      print('UIKitCustomVisualsRectangleButton: RectangleButton not found');
      return;
    }

    // Path A — try to set visual before initialization (works when button not yet initialized)
    const style: Partial<Record<StateName, RoundedRectangleVisualState>> = {
      default: {
        hasBorder: true, borderSize: 0.08, borderType: 'Color', borderColor: BORDER,
        baseGradient: DEFAULT_GRAD,
      },
      hovered: {
        hasBorder: true, borderSize: 0.08, borderType: 'Color', borderColor: BORDER_H,
        baseGradient: HOVERED_GRAD,
      },
      triggered: {
        hasBorder: true, borderSize: 0.10, borderType: 'Color', borderColor: BORDER,
        baseGradient: DEFAULT_GRAD,
      },
    };
    const customVisual = new RoundedRectangleVisual({
      sceneObject: button.sceneObject,
      style,
    });
    button.visual = customVisual;
    button.initialize();

    // Path B — guaranteed override via public API after all OnStartEvent handlers have run
    // Covers the case where the button was already initialized (e.g. by GridContentCreator)
    this.createEvent('OnStartEvent').bind(() => {
      const vis = button.visual as RoundedRectangleVisual;
      if (!vis) return;

      vis.defaultBaseType   = 'Gradient';
      vis.hoveredBaseType   = 'Gradient';
      vis.triggeredBaseType = 'Gradient';

      vis.defaultGradient   = DEFAULT_GRAD;
      vis.hoveredGradient   = HOVERED_GRAD;
      vis.triggeredGradient = DEFAULT_GRAD;

      vis.defaultHasBorder   = true;
      vis.hoveredHasBorder   = true;
      vis.triggeredHasBorder = true;

      vis.defaultBorderSize   = 0.08;
      vis.hoveredBorderSize   = 0.08;
      vis.triggeredBorderSize = 0.10;

      vis.borderDefaultColor   = BORDER;
      vis.borderHoveredColor   = BORDER_H;
      vis.borderTriggeredColor = BORDER;
    });
  }
}
