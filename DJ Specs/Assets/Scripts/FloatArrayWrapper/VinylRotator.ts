/**
 * Specs Inc. 2026
 * Defines Vinyl Rotator, Vinyl Inertia, Exponent Average Filter for the DJ Specs lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators";

declare const TWEEN: any;

class VinylInertia {
  // Simulates vinyl resistance with exponential decay.
  // Transient response: m*dv(t)/dt = -k*v(t) → v(t) = c1 * exp(-k*t/m)
  // Discrete approximation: y[n] = a * y[n-1] → c2 * a^(n-1)
  private decayTimeConstSec: number;
  private decay: number;
  private playbackRate: number = 0.0;
  private timePassed: number = 100.0;

  constructor(decayTimeConstSec: number) {
    this.decayTimeConstSec = decayTimeConstSec;
    this.decay = -2.30258 / decayTimeConstSec; // -ln(0.1)
  }

  getPlaybackRate(currentTime: number): number {
    if (this.timePassed > 3 * this.decayTimeConstSec) {
      return 0.0;
    }
    this.timePassed += currentTime;
    return this.playbackRate * Math.exp(this.decay * this.timePassed);
  }

  setPlaybackRate(playbackRate: number): void {
    this.timePassed = 0.0;
    this.playbackRate = playbackRate;
  }
}

class ExponentAverageFilter {
  // y[n] = (1 - alpha) * x[n] + alpha * y[n-1]
  private alpha: number;
  private prevRes: number = 0.0;

  constructor(alpha: number) {
    this.alpha = alpha;
  }

  process(inSample: number): number {
    const res = inSample * (1.0 - this.alpha) + this.alpha * this.prevRes;
    this.prevRes = res;
    return res;
  }
}

class DerivativeFilter {
  // y'(t) ≈ (y[n] - y[n-2]) / (2*T), second-order approximation O(h^2)
  private prevSample0: number = 0.0;
  private prevSample1: number = 0.0;
  private prevSample2: number = 0.0;
  private prevDeltaTime0: number = 0.0;
  private prevDeltaTime1: number = 0.0;

  push(sample: number, deltaTime: number): void {
    this.prevSample2 = this.prevSample1;
    this.prevSample1 = this.prevSample0;
    this.prevSample0 = sample;
    this.prevDeltaTime1 = this.prevDeltaTime0;
    this.prevDeltaTime0 = deltaTime;
  }

  get(): number {
    return (
      (this.prevSample0 - this.prevSample2) / (this.prevDeltaTime0 + this.prevDeltaTime1)
    );
  }
}

@component
export class VinylRotator extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">VinylRotator – physics-based vinyl rotation</span><br/><span style="color: #94A3B8; font-size: 11px;">Controls vinyl spin with inertia, hand tracking, and pause/resume tweening.</span>'
  )
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Vinyl record scene object to rotate")
  vinyl: SceneObject;

  @input("Component.ScriptComponent[]")
  @hint("Array of AudioController script components (one per deck)")
  audioControllers: ScriptComponent[];

  @input("Component.ScriptComponent")
  @hint("HandController script providing isTracking, angle, and speed")
  handController: ScriptComponent;

  @ui.label('<span style="color: #60A5FA;">Property Names</span>')
  @input
  @hint("Property name on AudioController to set playback rate (e.g. rate or rate2)")
  propertyName: string;

  @input
  @hint("Method name on AudioController to call for track assignment (e.g. setNextTrack or setNextTrack2)")
  trackPropertyName: string;

  @input
  @hint("Method name on AudioController to call for deck state (e.g. setOnDeck or setOnDeck2)")
  onDeckPropertyName: string;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  private transform: Transform;
  private DEFAULT_POSITION: vec3;
  private DEFAULT_ROTATION: quat;

  private playIndex: number = 0;
  private rotation: vec3;
  private readonly MEDIAN_COUNT: number = 100;
  private prevSpeeds: number[] = [];

  private numPerMin: number = 33;
  private T: number;
  private w0: number;
  private AnglePrev: number;
  private isPaused: boolean = false;
  private pauseTween: any = null;
  private speed: number = 1.0;
  private currentSpeed: number = 1.0;
  private isOnDeck: boolean = false;

  private vinylInertial: VinylInertia;
  private smoothingFilter: ExponentAverageFilter;
  private derivativeFilter: DerivativeFilter;

  onAwake(): void {
    this.logger = new Logger(
      "VinylRotator",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    );
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    this.transform = this.vinyl.getTransform();
    this.DEFAULT_POSITION = this.transform.getWorldPosition();
    this.DEFAULT_ROTATION = this.transform.getWorldRotation();

    this.rotation = this.transform.getLocalRotation().toEulerAngles();
    this.rotation.z = 0.0;

    for (let i = 0; i < this.MEDIAN_COUNT; i++) {
      this.prevSpeeds[i] = 1.0;
    }

    this.T = this.numPerMin / 60;
    this.w0 = 2.0 * Math.PI * this.T;
    this.AnglePrev = this.rotation.z;

    this.vinyl.enabled = false;

    this.vinylInertial = new VinylInertia(0.75);
    this.smoothingFilter = new ExponentAverageFilter(0.4);
    this.derivativeFilter = new DerivativeFilter();
  }

  setOnDeck(state: boolean): void {
    this.audioControllers.forEach((controller) => {
      (controller as any)[this.trackPropertyName]();
    });
    this.isOnDeck = state;
  }

  isOnDeckState(): boolean {
    return this.isOnDeck;
  }

  getDeckPosition(): vec3 {
    return this.DEFAULT_POSITION;
  }

  getDeckRotation(): quat {
    return this.DEFAULT_ROTATION;
  }

  setSpeed(inputSpeed: number): void {
    this.currentSpeed = inputSpeed;
    this.speed = inputSpeed;
  }

  pause(): void {
    this.isPaused = !this.isPaused;
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (this.vinyl.enabled && this.transform.getWorldPosition().distance(this.DEFAULT_POSITION) > 30) {
      this.vinyl.enabled = false;
      this.isOnDeck = false;
      this.audioControllers.forEach((controller) => {
        (controller as any)[this.onDeckPropertyName](false);
      });
    }

    if (!this.isOnDeck) {
      this.audioControllers.forEach((controller) => {
        (controller as any)[this.propertyName] = 0.0;
      });
      return;
    }

    this.transform.setWorldPosition(this.DEFAULT_POSITION);
    this.vinyl.enabled = true;

    const deltaTime = getDeltaTime();
    let w1 = 0.0;
    let rate = 1.0;

    const handCtrl = this.handController as any;

    if (this.isPaused) {
      if (this.pauseTween === null) {
        this.pauseTween = new TWEEN.Tween({ x: this.currentSpeed })
          .to({ x: 0.0 }, 500)
          .onUpdate((value: { x: number }) => {
            this.speed = value.x;
            rate = rate + this.vinylInertial.getPlaybackRate(deltaTime);
            this.rotation.y = this.rotation.y - rate * this.w0 * deltaTime;
            this.derivativeFilter.push(this.rotation.y, deltaTime);
          })
          .start();
      }
    } else if (!handCtrl.isTracking) {
      if (this.pauseTween) {
        this.pauseTween = new TWEEN.Tween({ x: 0.0 })
          .to({ x: this.currentSpeed }, 500)
          .onUpdate((value: { x: number }) => {
            this.speed = value.x;
          })
          .onComplete(() => {
            this.pauseTween = null;
          })
          .start();
      }
      rate = rate + this.vinylInertial.getPlaybackRate(deltaTime);
      this.rotation.y = this.rotation.y - rate * this.w0 * deltaTime;
      this.derivativeFilter.push(this.rotation.y, deltaTime);
    } else {
      if (this.pauseTween) {
        this.pauseTween = new TWEEN.Tween({ x: 0.0 })
          .to({ x: this.currentSpeed }, 500)
          .onUpdate((value: { x: number }) => {
            this.speed = value.x;
          })
          .onComplete(() => {
            this.pauseTween = null;
          })
          .start();
      }

      let sign = 1.0;
      if (handCtrl.angle > 0) {
        sign = -1.0;
      }

      this.rotation.y = this.rotation.y - sign * Math.sqrt(handCtrl.speed);
      this.derivativeFilter.push(this.rotation.y, deltaTime);
      w1 = -this.derivativeFilter.get();
      w1 = this.smoothingFilter.process(w1);
      rate = w1 / this.w0;

      this.vinylInertial.setPlaybackRate(rate * this.speed);
    }

    this.audioControllers.forEach((controller) => {
      (controller as any)[this.propertyName] = rate * this.speed;
    });

    this.transform.setLocalRotation(quat.fromEulerVec(this.rotation));
  }
}
