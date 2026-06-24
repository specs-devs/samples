import { Frame } from 'SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame';
import { RoundedRectangle, GradientParameters } from 'SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle';

// Same palette as UIKitCustomVisualsRectangleButton
const PINK  = new vec4(1.00, 0.42, 0.71, 1.0);
const MAGEN = new vec4(0.88, 0.38, 0.82, 1.0);
const PURP  = new vec4(0.55, 0.48, 0.90, 1.0);
const BLUE  = new vec4(0.26, 0.72, 0.94, 1.0);

const BG_GRADIENT: GradientParameters = {
  enabled: true,
  type: 'Linear',
  start: new vec2(0, 1),
  end:   new vec2(0, -1),
  stop0: { enabled: true, percent: 0,    color: PINK  },
  stop1: { enabled: true, percent: 0.35, color: MAGEN },
  stop2: { enabled: true, percent: 0.65, color: PURP  },
  stop3: { enabled: true, percent: 1.0,  color: BLUE  },
};

/**
 * UIKitCustomVisualsFrame applies a hot-pink → sky-blue gradient to the Frame.
 *
 * The Frame uses a glass/frosted shader that ignores setBackgroundGradient.
 * Lesson from UIKitCustomVisualsRectangleButton: own the whole visual.
 *
 * Strategy: spawn a gradient RoundedRectangle panel that renders ON TOP of the
 * Frame's glass material (renderOrder + 1), fully covering it. The panel owns
 * its own border so the glass border is no longer needed. UIKit spaces render
 * orders by large increments, so +1 sits above the glass but below the Frame's
 * child content (buttons, labels, etc.).
 *
 * Must be on the same SceneObject as the Frame component.
 */
@component
export class UIKitCustomVisualsFrame extends BaseScriptComponent {
  private _gradientPanel: RoundedRectangle = null;

  onAwake() {
    this.createEvent('OnStartEvent').bind(() => {
      const frame = this.sceneObject.getComponent(
        Frame.getTypeName()
      ) as Frame;

      if (!frame) {
        print('UIKitCustomVisualsFrame: Frame component not found');
        return;
      }

      const apply = () => {
        this._gradientPanel = this.createGradientPanel(frame);
        frame.onScalingUpdate.add(() => {
          if (this._gradientPanel) {
            this._gradientPanel.size = frame.totalSize;
          }
        });
      };

      if (frame.roundedRectangle) {
        apply();
      } else {
        frame.onInitialized.add(apply);
      }
    });
  }

  private createGradientPanel(frame: Frame): RoundedRectangle {
    const bgObj = global.scene.createSceneObject('GradientBackground');
    bgObj.setParent(frame.sceneObject);
    bgObj.layer = frame.sceneObject.layer;

    // Same z-plane as the frame's glass so the panel aligns perfectly in world space.
    // Render order (not z-depth) is what determines draw priority in UIKit's 2D stack.
    bgObj.getTransform().setLocalPosition(new vec3(0, 0, 0));

    const rr = bgObj.createComponent(
      RoundedRectangle.getTypeName()
    ) as RoundedRectangle;

    rr.cornerRadius = frame.roundedRectangle.cornerRadius;
    rr.initialize();
    rr.size = frame.totalSize;

    rr.setBackgroundGradient(BG_GRADIENT);

    // White border — owns the border role since we're covering the frame's glass.
    rr.borderColor = new vec4(1.0, 1.0, 1.0, 0.70);

    // Render one step above the Frame's glass so the gradient covers it cleanly,
    // while remaining below the Frame's child content (buttons, labels).
    const frameOrder = frame.roundedRectangle.renderMeshVisual.getRenderOrder();
    rr.renderMeshVisual.setRenderOrder(frameOrder + 1);

    return rr;
  }
}
