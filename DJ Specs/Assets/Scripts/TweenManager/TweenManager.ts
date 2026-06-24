/**
 * Specs Inc. 2026
 * Tween Manager handling core logic for the DJ Specs lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators";

// TweenManager.ts
// Version: 0.1.1
// Description: Calls TWEEN's update and exposes global helper functions.
//
// Usage:
//   global.tweenManager.startTween(tweenObject, tweenName, callback)
//   global.tweenManager.stopTween(tweenObject, tweenName)
//   global.tweenManager.resetObject(tweenObject, tweenName)
//   global.tweenManager.pauseTween(tweenObject, tweenName)
//   global.tweenManager.resumeTween(tweenObject, tweenName)
//   global.tweenManager.getGenericTweenValue(tweenObject, tweenName)
//   global.tweenManager.resetTween(tweenObject, tweenName)
//   global.tweenManager.resetTweens()
//   global.tweenManager.restartAutoTweens()

declare const TWEEN: any;

@component
export class TweenManager extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">TweenManager – central tween update and registry</span><br/><span style="color: #94A3B8; font-size: 11px;">Place at the top of the Objects Panel. Drives TWEEN engine each frame.</span>'
  )
  @ui.separator

  @input
  @hint("Print debug messages for tween operations")
  printDebugLog: boolean = false;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  registry: any[] = [];

  onAwake(): void {
    this.logger = new Logger(
      "TweenManager",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    );
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    this.registerGlobalAPI();
  }

  @bindUpdateEvent
  onUpdate(): void {
    TWEEN.update();
  }

  private debugPrint(msg: string, force?: boolean): void {
    if (this.printDebugLog || force) {
      this.logger.debug(msg);
    }
  }

  private resumeTween(tweenObject: SceneObject, _tweenName: string): void {
    const tweenScriptComponent = this.findTween(tweenObject, _tweenName);
    if (tweenScriptComponent) {
      const tweenName: string = tweenScriptComponent.tweenName;
      if (
        tweenScriptComponent.playAll &&
        tweenScriptComponent.tweenType === "chain"
      ) {
        for (let i = 0; i < tweenScriptComponent.allTweens.length; i++) {
          tweenScriptComponent.allTweens[i].resume(tweenName);
        }
      } else if (tweenScriptComponent.tween) {
        if (Array.isArray(tweenScriptComponent.tween)) {
          for (let j = 0; j < tweenScriptComponent.tween.length; j++) {
            tweenScriptComponent.tween[j].resume(tweenName);
          }
        } else {
          tweenScriptComponent.tween.resume(tweenName);
        }
      } else {
        this.debugPrint(
          "Tween Manager: Warning, trying to resume " + tweenName + ", which hasn't been initialized",
          true
        );
      }
    } else {
      this.debugPrint(
        "Tween Manager: Trying to resume " +
          _tweenName +
          ", which does not exist. Ensure that the Tween Type has been initialized and started.",
        true
      );
    }
  }

  private pauseTween(tweenObject: SceneObject, _tweenName: string): void {
    const tweenScriptComponent = this.findTween(tweenObject, _tweenName);
    if (tweenScriptComponent) {
      const tweenName: string = tweenScriptComponent.tweenName;
      if (
        tweenScriptComponent.tweenType === "chain" &&
        tweenScriptComponent.playAll
      ) {
        for (let i = 0; i < tweenScriptComponent.allTweens.length; i++) {
          tweenScriptComponent.allTweens[i].pause(tweenName);
        }
      } else if (tweenScriptComponent.tween) {
        if (Array.isArray(tweenScriptComponent.tween)) {
          for (let j = 0; j < tweenScriptComponent.tween.length; j++) {
            tweenScriptComponent.tween[j].pause(tweenName);
          }
        } else {
          tweenScriptComponent.tween.pause(tweenName);
        }
      } else {
        this.debugPrint(
          "Tween Manager: Warning, trying to pause " + tweenName + ", which hasn't been initialized",
          true
        );
      }
    } else {
      this.debugPrint(
        "Tween Manager: Trying to pause " +
          _tweenName +
          ", which does not exist. Ensure that the Tween Type has been initialized and started.",
        true
      );
    }
  }

  private isPaused(tweenObject: SceneObject, tweenName: string): boolean | undefined {
    const tweenScriptComponent = this.findTween(tweenObject, tweenName);
    if (tweenScriptComponent) {
      if (tweenScriptComponent.tween) {
        if (Array.isArray(tweenScriptComponent.tween)) {
          return tweenScriptComponent.tween[tweenScriptComponent.tween.length - 1]._isPaused;
        }
        return tweenScriptComponent.tween._isPaused;
      }
      return false;
    }
    this.debugPrint(
      "TweenManager: You are trying to check if " +
        tweenName +
        " is currently paused, but a Tween of that type does not exist on " +
        tweenObject.name +
        ".",
      true
    );
    return undefined;
  }

  private isPlaying(tweenObject: SceneObject, tweenName: string): boolean | undefined {
    const tweenScriptComponent = this.findTween(tweenObject, tweenName);
    if (tweenScriptComponent) {
      if (tweenScriptComponent.tween) {
        if (Array.isArray(tweenScriptComponent.tween)) {
          return tweenScriptComponent.tween[tweenScriptComponent.tween.length - 1]._isPlaying;
        }
        return tweenScriptComponent.tween._isPlaying;
      }
      return false;
    }
    this.debugPrint(
      "TweenManager: You are trying to check if " +
        tweenName +
        " is currently playing, but a Tween of that type does not exist on " +
        tweenObject.name +
        ".",
      true
    );
    return undefined;
  }

  private startTween(
    tweenObject: SceneObject,
    tweenName: string,
    completeCallback?: () => void,
    startCallback?: () => void,
    stopCallback?: () => void
  ): void {
    const tweenScriptComponent = this.findTween(tweenObject, tweenName);
    if (tweenScriptComponent) {
      this.debugPrint("Tween Manager: Starting " + tweenName);

      if (tweenScriptComponent.tween) {
        if (Array.isArray(tweenScriptComponent.tween)) {
          for (const t of tweenScriptComponent.tween) {
            TWEEN.remove(t);
          }
        } else {
          TWEEN.remove(tweenScriptComponent.tween);
        }
      }

      tweenScriptComponent.startTween();

      if (tweenScriptComponent.tweenType === "chain") {
        if (completeCallback) {
          if (tweenScriptComponent.playAll) {
            tweenScriptComponent.longestTween.onComplete(completeCallback);
          } else {
            if (Array.isArray(tweenScriptComponent.lastTween)) {
              tweenScriptComponent.lastTween[
                tweenScriptComponent.lastTween.length - 1
              ].onComplete(completeCallback);
            } else {
              tweenScriptComponent.lastTween.onComplete(completeCallback);
            }
          }
        }
        if (startCallback) {
          if (Array.isArray(tweenScriptComponent.firstTween)) {
            tweenScriptComponent.firstTween[
              tweenScriptComponent.firstTween.length - 1
            ].onStart(startCallback);
          } else {
            tweenScriptComponent.firstTween.onStart(startCallback);
          }
        }
        if (stopCallback) {
          for (let k = 0; k < tweenScriptComponent.allTweens.length; k++) {
            const currentTween = tweenScriptComponent.allTweens[k];
            if (Array.isArray(currentTween)) {
              for (const t of currentTween) t.onStop(stopCallback);
            } else {
              currentTween.onStop(stopCallback);
            }
          }
        }
      } else {
        if (completeCallback) {
          if (Array.isArray(tweenScriptComponent.tween)) {
            tweenScriptComponent.tween[tweenScriptComponent.tween.length - 1].onComplete(
              completeCallback
            );
          } else {
            tweenScriptComponent.tween.onComplete(completeCallback);
          }
        }
        if (startCallback) {
          if (Array.isArray(tweenScriptComponent.tween)) {
            tweenScriptComponent.tween[tweenScriptComponent.tween.length - 1].onStart(
              startCallback
            );
          } else {
            tweenScriptComponent.tween.onStart(startCallback);
          }
        }
        if (stopCallback) {
          if (Array.isArray(tweenScriptComponent.tween)) {
            tweenScriptComponent.tween[tweenScriptComponent.tween.length - 1].onStop(
              stopCallback
            );
          } else {
            tweenScriptComponent.tween.onStop(stopCallback);
          }
        }
      }
    }
  }

  private stopTween(tweenObject: SceneObject, tweenName: string): void {
    const tweenScriptComponent = this.findTween(tweenObject, tweenName);
    if (tweenScriptComponent) {
      this.debugPrint("Tween Manager: Stopping " + tweenName);
      if (tweenScriptComponent.tweenType === "chain") {
        if (tweenScriptComponent.playAll && tweenScriptComponent.allTweens) {
          for (let i = 0; i < tweenScriptComponent.allTweens.length; i++) {
            tweenScriptComponent.allTweens[i].stop();
          }
          return;
        } else if (tweenScriptComponent.tween) {
          if (Array.isArray(tweenScriptComponent.tween)) {
            for (const t of tweenScriptComponent.tween) t.stop();
          } else {
            tweenScriptComponent.tween.stop();
          }
        } else {
          this.debugPrint(
            "Tween Manager: Warning, trying to stop " + tweenName + ", which hasn't been started"
          );
        }
        return;
      }

      if (tweenScriptComponent.tween) {
        if (Array.isArray(tweenScriptComponent.tween)) {
          for (const t of tweenScriptComponent.tween) t.stop();
        } else {
          tweenScriptComponent.tween.stop();
        }
      } else {
        this.debugPrint(
          "Tween Manager: Warning, trying to stop " + tweenName + ", which hasn't been started"
        );
      }
    }
  }

  private setStartValue(
    tweenObject: SceneObject,
    tweenName: string,
    startValue: any
  ): void {
    const tweenScriptComponent = this.findTween(tweenObject, tweenName);
    if (tweenScriptComponent) {
      if (tweenScriptComponent.setStart) {
        tweenScriptComponent.setStart(startValue);
      } else {
        this.debugPrint(
          "Tween Manager: You cannot manually set the start value of " + tweenName
        );
      }
    }
  }

  private setEndValue(
    tweenObject: SceneObject,
    tweenName: string,
    endValue: any
  ): void {
    const tweenScriptComponent = this.findTween(tweenObject, tweenName);
    if (tweenScriptComponent) {
      if (tweenScriptComponent.setEnd) {
        tweenScriptComponent.setEnd(endValue);
      } else {
        this.debugPrint(
          "Tween Manager: You cannot manually set the end value of " + tweenName
        );
      }
    }
  }

  private resetObject(tweenObject: SceneObject, tweenName: string): void {
    const tweenScriptComponent = this.findTween(tweenObject, tweenName);
    if (tweenScriptComponent) {
      this.debugPrint("Tween Manager: Resetting Object " + tweenName);
      tweenScriptComponent.resetObject();
    }
  }

  private resetTween(tweenObject: SceneObject, tweenName: string): void {
    const tweenScriptComponent = this.findTween(tweenObject, tweenName);
    this.resetTweenComponent(tweenScriptComponent);
  }

  private resetTweenComponent(tweenScriptComponent: any): void {
    if (tweenScriptComponent) {
      this.debugPrint(
        "Tween Manager: Resetting tween " + tweenScriptComponent.tweenName
      );

      if (tweenScriptComponent.tweenType === "chain") {
        tweenScriptComponent.backwards = false;
        this.debugPrint("Tween Manager: Chain Tween reset is not fully supported");
      }

      if (tweenScriptComponent.movementType && tweenScriptComponent.movementType > 0) {
        this.debugPrint(
          "Tween Manager: Reset for this tween movement type is not fully supported"
        );
      }

      if (tweenScriptComponent.tween) {
        if (Array.isArray(tweenScriptComponent.tween)) {
          for (const t of tweenScriptComponent.tween) {
            TWEEN.remove(t);
          }
        } else {
          TWEEN.remove(tweenScriptComponent.tween);
        }
      }
      tweenScriptComponent.resetObject();
    }
  }

  private resetTweens(): void {
    for (let i = 0; i < this.registry.length; i++) {
      this.resetTweenComponent(this.registry[i]);
    }
  }

  private restartAutoTweens(): void {
    for (let i = 0; i < this.registry.length; i++) {
      const tweenScriptComponent = this.registry[i];
      if (tweenScriptComponent && tweenScriptComponent.playAutomatically) {
        this.debugPrint("Restarting tween " + tweenScriptComponent.tweenName);
        tweenScriptComponent.startTween();
      }
    }
  }

  private addToRegistry(tweenScriptComponent: any): boolean {
    if (tweenScriptComponent) {
      this.debugPrint(
        "Adding tween " + tweenScriptComponent.tweenName + " to Tween Manager registry"
      );
      this.registry[this.registry.length++] = tweenScriptComponent;
      return true;
    }
    return false;
  }

  private cleanRegistry(): void {
    this.registry = [];
  }

  private getTweenEasingType(easingFunction: string, easingType: string): any {
    if (easingFunction === "Linear") {
      return TWEEN.Easing.Linear.None;
    }
    return TWEEN.Easing[easingFunction][easingType];
  }

  private setTweenLoopType(tween: any, loopType: number): void {
    switch (loopType) {
      case 0:
        break;
      case 1:
        tween.repeat(Infinity);
        break;
      case 2:
        tween.yoyo(true);
        tween.repeat(Infinity);
        break;
      case 3:
        tween.yoyo(true);
        tween.repeat(1);
        break;
    }
  }

  private findTween(tweenObject: SceneObject, tweenName: string): any {
    const scriptComponents = tweenObject.getComponents("Component.ScriptComponent");

    for (let i = 0; i < scriptComponents.length; i++) {
      const scriptComponent = scriptComponents[i] as any;
      if (scriptComponent) {
        if (scriptComponent.tweenName) {
          if (tweenName === scriptComponent.tweenName) {
            return scriptComponent;
          }
        }
      } else {
        this.debugPrint(
          "Tween Manager: Tween type hasn't initialized. Ensure that " +
            tweenName +
            ' is on "Lens Turn On" and that Tween Manager is at the top of the Objects Panel.',
          true
        );
        return undefined;
      }
    }

    this.debugPrint(
      "Tween Manager: Tween, " +
        tweenName +
        ", is not found. Ensure that " +
        tweenName +
        ' is on "Lens Turn On" and that Tween Manager is at the top of the Objects Panel.',
      true
    );
    return undefined;
  }

  private findTweenRecursive(tweenObject: SceneObject, tweenName: string): any {
    const scriptComponents = tweenObject.getComponents("Component.ScriptComponent");
    for (let i = 0; i < scriptComponents.length; i++) {
      const scriptComponent = scriptComponents[i] as any;
      if (scriptComponent) {
        if (scriptComponent.tweenName) {
          if (tweenName === scriptComponent.tweenName) {
            return scriptComponent;
          }
        }
      } else {
        this.debugPrint(
          "Tween Manager: Tween type hasn't initialized. Ensure that " +
            tweenName +
            ' is on "Lens Turn On" and that Tween Manager is at the top of the Objects Panel.',
          true
        );
        return undefined;
      }
    }

    for (let j = 0; j < tweenObject.getChildrenCount(); j++) {
      const result = this.findTweenRecursive(tweenObject.getChild(j), tweenName);
      if (result) return result;
    }
    return undefined;
  }

  private getGenericTweenValue(tweenObject: SceneObject, tweenName: string): any {
    const scriptComponents = tweenObject.getComponents("Component.ScriptComponent");

    for (let i = 0; i < scriptComponents.length; i++) {
      const scriptComponent = scriptComponents[i] as any;

      if (scriptComponent) {
        if (tweenName === scriptComponent.tweenName) {
          if (scriptComponent.tweenType === "value") {
            if (scriptComponent.tween) {
              if (!scriptComponent.tween._isPlaying) {
                this.debugPrint(
                  "Tween Manager: Tween Value, " +
                    tweenName +
                    ", is not currently playing. Ensure that it has been started.",
                  true
                );
              }
            } else {
              this.debugPrint(
                "Tween Manager: Tween Value, " +
                  tweenName +
                  ", has not been set up. Ensure ordering is correct.",
                true
              );
            }
            return scriptComponent.value;
          }
        }
      } else {
        this.debugPrint(
          "Tween Manager: Tween Value, " +
            tweenName +
            ", hasn't initialized. Likely an order of operations issue.",
          true
        );
        return undefined;
      }
    }

    this.debugPrint(
      "Tween Manager: Tween Value, " +
        tweenName +
        ", is not found. Ensure the Tween Name matches exactly.",
      true
    );
    return undefined;
  }

  private getSwitchedEasingType(initialType: string): string {
    switch (initialType) {
      case "In":
        return "Out";
      case "Out":
        return "In";
      default:
        return "InOut";
    }
  }

  private registerGlobalAPI(): void {
    (global as any).tweenManager = {
      getTweenEasingType: (easingFunction: string, easingType: string) =>
        this.getTweenEasingType(easingFunction, easingType),
      setTweenLoopType: (tween: any, loopType: number) =>
        this.setTweenLoopType(tween, loopType),
      startTween: (
        tweenObject: SceneObject,
        tweenName: string,
        completeCallback?: () => void,
        startCallback?: () => void,
        stopCallback?: () => void
      ) => this.startTween(tweenObject, tweenName, completeCallback, startCallback, stopCallback),
      stopTween: (tweenObject: SceneObject, tweenName: string) =>
        this.stopTween(tweenObject, tweenName),
      pauseTween: (tweenObject: SceneObject, tweenName: string) =>
        this.pauseTween(tweenObject, tweenName),
      resumeTween: (tweenObject: SceneObject, tweenName: string) =>
        this.resumeTween(tweenObject, tweenName),
      resetObject: (tweenObject: SceneObject, tweenName: string) =>
        this.resetObject(tweenObject, tweenName),
      findTween: (tweenObject: SceneObject, tweenName: string) =>
        this.findTween(tweenObject, tweenName),
      findTweenRecursive: (tweenObject: SceneObject, tweenName: string) =>
        this.findTweenRecursive(tweenObject, tweenName),
      getGenericTweenValue: (tweenObject: SceneObject, tweenName: string) =>
        this.getGenericTweenValue(tweenObject, tweenName),
      getSwitchedEasingType: (initialType: string) =>
        this.getSwitchedEasingType(initialType),
      setStartValue: (tweenObject: SceneObject, tweenName: string, startValue: any) =>
        this.setStartValue(tweenObject, tweenName, startValue),
      setEndValue: (tweenObject: SceneObject, tweenName: string, endValue: any) =>
        this.setEndValue(tweenObject, tweenName, endValue),
      isPlaying: (tweenObject: SceneObject, tweenName: string) =>
        this.isPlaying(tweenObject, tweenName),
      isPaused: (tweenObject: SceneObject, tweenName: string) =>
        this.isPaused(tweenObject, tweenName),
      addToRegistry: (tweenScriptComponent: any) =>
        this.addToRegistry(tweenScriptComponent),
      cleanRegistry: () => this.cleanRegistry(),
      resetTween: (tweenObject: SceneObject, tweenName: string) =>
        this.resetTween(tweenObject, tweenName),
      resetTweens: () => this.resetTweens(),
      restartAutoTweens: () => this.restartAutoTweens(),
    };
  }
}
