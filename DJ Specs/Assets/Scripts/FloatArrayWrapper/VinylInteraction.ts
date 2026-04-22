/**
 * Specs Inc. 2026
 * Vinyl Interaction component for the DJ Specs Spectacles lens.
 * Deck/stack behavior aligned with DJ Specs; showTrack keeps post-pop grab fixes for Redo.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators";

@component
export class VinylInteraction extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">VinylInteraction – vinyl drag, snap, and deck placement</span><br/><span style="color: #94A3B8; font-size: 11px;">Handles vinyl translation onto left/right decks with animation and color feedback.</span>'
  )
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Animation</span>')
  @input("Component.AnimationPlayer")
  @hint("Animation player for the vinyl show/hide animation")
  vinylShow: AnimationPlayer;

  @input("Asset.AnimationAsset")
  @hint("Animation asset containing vinyl show clips")
  vinylShowAsset: AnimationAsset;

  @input
  @hint("Name of the first animation clip (idle/base state)")
  firstClipName: string;

  @input
  @hint("Name of the second animation clip (pick-up/moving state)")
  secondClipName: string;

  @input
  @hint("Name of the third animation clip")
  thirdClipName: string;

  @ui.label('<span style="color: #60A5FA;">Scene Objects</span>')
  @input
  @hint("The movable vinyl disc scene object")
  movableVinyl: SceneObject;

  @input
  @hint("Default disc scene object used as the origin position reference")
  defaultDisk: SceneObject;

  @input
  @hint("Left deck scene object")
  deckLeft: SceneObject;

  @input
  @hint("Right deck scene object")
  deckRight: SceneObject;

  @ui.label('<span style="color: #60A5FA;">Script References</span>')
  @input("Component.ScriptComponent")
  @hint("InteractableManipulation script on the movable vinyl")
  vinylInteractable: ScriptComponent;

  @input("Component.ScriptComponent")
  @hint("VinylRotator script for the left deck")
  leftRotator: ScriptComponent;

  @input("Component.ScriptComponent")
  @hint("VinylRotator script for the right deck")
  rightRotator: ScriptComponent;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  private readonly BLUE_COLOR: vec4 = new vec4(165, 241, 255, 255).uniformScale(1 / 255);
  private readonly PINK_COLOR: vec4 = new vec4(186, 123, 255, 255).uniformScale(1 / 255);
  private readonly MANIPULATION_START_EVENT_NAME: string = "manipulation_start";

  private movableTransform: Transform;
  private deckLeftTransform: Transform;
  private deckRightTransform: Transform;
  private movablePass: any;
  private leftDeckPass: any;
  private rightDeckPass: any;
  private REFL_BLUE: any;
  private REFL_PINK: any;

  private DEFAULT_POSITION: vec3 | null = null;
  private DEFAULT_ROTATION: quat | null = null;
  private isMoving: boolean = false;
  private isOutOfBox: boolean = false;
  private popGrabUnlockTime: number = -1;

  onAwake(): void {
    this.logger = new Logger(
      "VinylInteraction",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    );
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    this.movableTransform = this.movableVinyl.getTransform();
    this.deckLeftTransform = this.deckLeft.getTransform();
    this.deckRightTransform = this.deckRight.getTransform();

    this.movablePass = (this.movableVinyl.getComponent("RenderMeshVisual") as any).mainMaterial
      .mainPass;
    this.leftDeckPass = (this.deckLeft.getComponent("RenderMeshVisual") as any).mainMaterial
      .mainPass;
    this.rightDeckPass = (this.deckRight.getComponent("RenderMeshVisual") as any).mainMaterial
      .mainPass;

    this.REFL_BLUE = this.movablePass.Tweak_N15;
    this.REFL_PINK = this.leftDeckPass.Tweak_N15;
  }

  @bindStartEvent
  onStart(): void {
    this.initialize();
  }

  private initialize(): void {
    this.setColor(this.movablePass, this.PINK_COLOR, this.REFL_PINK);
    (this.vinylInteractable as any).setCanTranslate(false);

    (this.vinylInteractable as any).onTranslationStart.add(() => {
      if (!this.isMoving) {
        const prevClip = (this.vinylShow as any).getClip(this.firstClipName);
        const clip = (this.vinylShow as any).getClip(this.secondClipName);
        prevClip.weight = 0.0;
        clip.weight = 1.0;
        (this.vinylShow as any).playClipAt(this.secondClipName, clip.begin);
        this.isMoving = true;
        this.isOutOfBox = true;
      }
    });

    const manip = this.vinylInteractable as any;
    const onEnd = manip.onTranslationEnd ?? manip.onTranslationEndEvent;
    if (onEnd && onEnd.add) {
      onEnd.add(() => {
        if (this.isOutOfBox) {
          this.isMoving = false;
        }
      });
    }

    (this.vinylShow as any).onEvent.add((eventData: any) => {
      if (eventData.eventName === this.MANIPULATION_START_EVENT_NAME) {
        this.popGrabUnlockTime = -1;
        (this.vinylInteractable as any).setCanTranslate(true);
      }
    });
  }

  setTrack(): void {
    if (this.movablePass.Tweak_N1.distance(this.BLUE_COLOR) < 0.1) {
      this.setColor(this.movablePass, this.PINK_COLOR, this.REFL_PINK);
    } else {
      this.setColor(this.movablePass, this.BLUE_COLOR, this.REFL_BLUE);
    }
    this.showTrack();
  }

  private showTrack(): void {
    this.isMoving = false;
    this.isOutOfBox = false;
    this.popGrabUnlockTime = -1;
    (this.vinylInteractable as any).setCanTranslate(false);

    if (this.DEFAULT_POSITION) {
      this.movableTransform.setWorldPosition(
        this.defaultDisk.getTransform().getWorldPosition()
      );
    } else {
      this.DEFAULT_POSITION = this.defaultDisk.getTransform().getWorldPosition();
    }

    if (this.DEFAULT_ROTATION) {
      this.movableTransform.setWorldRotation(
        this.defaultDisk.getTransform().getWorldRotation()
      );
    } else {
      this.DEFAULT_ROTATION = this.defaultDisk.getTransform().getWorldRotation();
    }

    if (this.vinylShow) {
      const prevClip = (this.vinylShow as any).getClip(this.secondClipName);
      const clip = (this.vinylShow as any).getClip(this.firstClipName);
      prevClip.weight = 0.0;
      clip.weight = 1.0;
      (this.vinylShow as any).playClipAt(this.firstClipName, clip.begin);
      const duration = (clip as any).duration as number;
      if (typeof duration === "number" && duration > 0) {
        this.popGrabUnlockTime = getTime() + duration;
      }
      (this.vinylShowAsset as any).createEvent(
        this.MANIPULATION_START_EVENT_NAME,
        clip.duration
      );
    } else {
      (this.vinylInteractable as any).setCanTranslate(true);
    }
  }

  @bindUpdateEvent
  onUpdate(): void {
    const leftRotator = this.leftRotator as any;
    const rightRotator = this.rightRotator as any;

    if (this.popGrabUnlockTime >= 0 && getTime() >= this.popGrabUnlockTime) {
      this.popGrabUnlockTime = -1;
      (this.vinylInteractable as any).setCanTranslate(true);
    }

    if (leftRotator.isOnDeckState() && rightRotator.isOnDeckState()) {
      (this.vinylInteractable as any).setCanTranslate(true);
    }

    const movablePosition = this.movableTransform.getWorldPosition();
    const movableRotation = this.movableTransform.getWorldRotation();
    const leftDeckPosition = leftRotator.getDeckPosition();
    const leftDeckRotation = leftRotator.getDeckRotation();
    const rightDeckPosition = rightRotator.getDeckPosition();
    const rightDeckRotation = rightRotator.getDeckRotation();

    if (this.isMoving) {
      if (leftDeckPosition.distance(movablePosition) < 50) {
        this.isOutOfBox = false;
        this.movableTransform.setWorldRotation(
          quat.slerp(movableRotation, leftDeckRotation, 0.3)
        );
        this.movableTransform.setWorldPosition(
          vec3.lerp(movablePosition, leftDeckPosition, 0.3)
        );

        if (leftDeckPosition.distance(movablePosition) < 0.2) {
          this.movableTransform.setWorldPosition(this.DEFAULT_POSITION!);
          this.movableTransform.setWorldRotation(this.DEFAULT_ROTATION!);
          if (this.movablePass.Tweak_N1.distance(this.BLUE_COLOR) < 0.1) {
            this.setColor(this.leftDeckPass, this.BLUE_COLOR, this.REFL_BLUE);
          } else {
            this.setColor(this.leftDeckPass, this.PINK_COLOR, this.REFL_PINK);
          }
          (this.vinylInteractable as any).setCanTranslate(false);
          this.isMoving = false;
        } else if (leftDeckPosition.distance(movablePosition) < 0.3) {
          if (!leftRotator.isOnDeckState()) {
            leftRotator.setOnDeck(true);
          }
        }
      } else if (rightDeckPosition.distance(movablePosition) < 50) {
        this.isOutOfBox = false;
        const currentMovableRotation = this.movableTransform.getWorldRotation();
        this.movableTransform.setWorldRotation(
          quat.slerp(currentMovableRotation, rightDeckRotation, 0.3)
        );
        this.movableTransform.setWorldPosition(
          vec3.lerp(movablePosition, rightDeckPosition, 0.3)
        );

        if (rightDeckPosition.distance(movablePosition) < 0.2) {
          if (!rightRotator.isOnDeckState()) {
            rightRotator.setOnDeck(true);
          }
          this.movableTransform.setWorldPosition(this.DEFAULT_POSITION!);
          this.movableTransform.setWorldRotation(this.DEFAULT_ROTATION!);
          if (this.movablePass.Tweak_N1.distance(this.BLUE_COLOR) < 0.3) {
            this.setColor(this.rightDeckPass, this.BLUE_COLOR, this.REFL_BLUE);
          } else {
            this.setColor(this.rightDeckPass, this.PINK_COLOR, this.REFL_PINK);
          }
          this.isMoving = false;
        } else if (rightDeckPosition.distance(movablePosition) < 0.1) {
          (this.vinylInteractable as any).setCanTranslate(false);
        }
      }
    } else {
      if (!this.isOutOfBox) {
        return;
      }
      if (this.DEFAULT_ROTATION) {
        this.movableTransform.setWorldRotation(
          quat.slerp(movableRotation, this.DEFAULT_ROTATION, 0.5)
        );
      }
      if (this.DEFAULT_POSITION) {
        this.movableTransform.setWorldPosition(
          vec3.lerp(movablePosition, this.DEFAULT_POSITION, 0.5)
        );
      }
      if (this.DEFAULT_POSITION && this.DEFAULT_POSITION.distance(movablePosition) < 0.1) {
        this.isOutOfBox = false;
      }
    }
  }

  private setColor(pass: any, color: vec4, refl: any): void {
    pass.Tweak_N1 = color;
    pass.Tweak_N15 = refl;
  }
}
