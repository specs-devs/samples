/**
 * Specs Inc. 2026
 * Tween.ts — TypeScript port of Tween.js (MIT license) https://github.com/tweenjs/tween.js
 * Registers global.TWEEN for use by TweenManager and other scripts.
 * TweenComponent is the ScriptComponent entry point for the Tween scene object.
 */

@component
export class TweenComponent extends BaseScriptComponent {
  onAwake(): void {}
}

type EasingFunction = (k: number) => number;
type InterpolationFunction = (v: number[], k: number) => number;
type TweenCallback = (object: any) => void;

class TweenGroup {
  _tweens: { [id: number]: TweenItem } = {};
  _tweensAddedDuringUpdate: { [id: number]: TweenItem } = {};

  getAll(): TweenItem[] {
    return Object.keys(this._tweens).map((tweenId) => this._tweens[Number(tweenId)]);
  }

  removeAll(): void {
    this._tweens = {};
  }

  add(tween: TweenItem): void {
    this._tweens[tween.getId()] = tween;
    this._tweensAddedDuringUpdate[tween.getId()] = tween;
  }

  remove(tween: TweenItem): void {
    delete this._tweens[tween.getId()];
    delete this._tweensAddedDuringUpdate[tween.getId()];
  }

  update(time?: number, preserve?: boolean): boolean {
    let tweenIds = Object.keys(this._tweens).map(Number);

    if (tweenIds.length === 0) {
      return false;
    }

    time = time !== undefined ? time : TweenLib.now();

    while (tweenIds.length > 0) {
      this._tweensAddedDuringUpdate = {};

      for (let i = 0; i < tweenIds.length; i++) {
        const tween = this._tweens[tweenIds[i]];

        if (tween && tween.update(time) === false) {
          tween._isPlaying = false;

          if (!preserve) {
            delete this._tweens[tweenIds[i]];
          }
        }
      }

      tweenIds = Object.keys(this._tweensAddedDuringUpdate).map(Number);
    }

    return true;
  }
}

class TweenItem {
  _object: any;
  _valuesStart: { [key: string]: any } = {};
  _valuesEnd: { [key: string]: any } = {};
  _valuesStartRepeat: { [key: string]: any } = {};
  _duration: number = 1000;
  _repeat: number = 0;
  _repeatDelayTime: number | undefined = undefined;
  _yoyo: boolean = false;
  _isPlaying: boolean = false;
  _isPaused: boolean = false;
  _pauseTime: number | null = null;
  _reversed: boolean = false;
  _delayTime: number = 0;
  _startTime: number | null = null;
  _easingFunction: EasingFunction = TweenEasing.Linear.None;
  _interpolationFunction: InterpolationFunction = TweenInterpolation.Linear;
  _chainedTweens: TweenItem[] = [];
  _onStartCallback: TweenCallback | null = null;
  _onStartCallbackFired: boolean = false;
  _onUpdateCallback: TweenCallback | null = null;
  _onCompleteCallback: TweenCallback | null = null;
  _onStopCallback: TweenCallback | null = null;
  _group: TweenGroup;
  _id: number;

  constructor(object: any, group?: TweenGroup) {
    this._object = object;
    this._group = group || TweenLib;
    this._id = TweenLib.nextId();
  }

  getId(): number {
    return this._id;
  }

  isPlaying(): boolean {
    return this._isPlaying;
  }

  to(properties: { [key: string]: any }, duration?: number): this {
    this._valuesEnd = properties;
    if (duration !== undefined) {
      this._duration = duration;
    }
    return this;
  }

  start(time?: number | string): this {
    this._group.add(this);
    this._isPlaying = true;
    this._onStartCallbackFired = false;

    const now = TweenLib.now();
    if (time !== undefined) {
      this._startTime =
        typeof time === "string" ? now + parseFloat(time) : (time as number);
    } else {
      this._startTime = now;
    }
    this._startTime += this._delayTime;

    for (const property in this._valuesEnd) {
      if (this._valuesEnd[property] instanceof Array) {
        if (this._valuesEnd[property].length === 0) {
          continue;
        }
        this._valuesEnd[property] = [this._object[property]].concat(
          this._valuesEnd[property]
        );
      }

      if (this._object[property] === undefined) {
        continue;
      }

      this._valuesStart[property] = this._object[property];

      if (!(this._valuesStart[property] instanceof Array)) {
        this._valuesStart[property] *= 1.0;
      }

      this._valuesStartRepeat[property] = this._valuesStart[property] || 0;
    }

    return this;
  }

  stop(): this {
    if (!this._isPlaying) {
      return this;
    }

    this._group.remove(this);
    this._isPlaying = false;

    if (this._onStopCallback !== null) {
      this._onStopCallback(this._object);
    }

    this.stopChainedTweens();
    return this;
  }

  end(): this {
    this.update(this._startTime! + this._duration);
    return this;
  }

  stopChainedTweens(): void {
    for (let i = 0; i < this._chainedTweens.length; i++) {
      this._chainedTweens[i].stop();
    }
  }

  delay(amount: number): this {
    this._delayTime = amount;
    return this;
  }

  repeat(times: number): this {
    this._repeat = times;
    return this;
  }

  repeatDelay(amount: number): this {
    this._repeatDelayTime = amount;
    return this;
  }

  yoyo(yoyo: boolean): this {
    this._yoyo = yoyo;
    return this;
  }

  easing(easingFunction: EasingFunction): this {
    this._easingFunction = easingFunction;
    return this;
  }

  interpolation(interpolationFunction: InterpolationFunction): this {
    this._interpolationFunction = interpolationFunction;
    return this;
  }

  chain(...tweens: TweenItem[]): this {
    this._chainedTweens = tweens;
    return this;
  }

  onStart(callback: TweenCallback): this {
    this._onStartCallback = callback;
    return this;
  }

  onUpdate(callback: TweenCallback): this {
    this._onUpdateCallback = callback;
    return this;
  }

  onComplete(callback: TweenCallback): this {
    this._onCompleteCallback = callback;
    return this;
  }

  onStop(callback: TweenCallback): this {
    this._onStopCallback = callback;
    return this;
  }

  resume(tweenName?: string): void {
    if (!this._isPaused) {
      return;
    }
    this._isPaused = !this._isPaused;
    this._startTime! += TweenLib.now() - this._pauseTime!;
    this._group.add(this);
  }

  pause(tweenName?: string): void {
    if (this._isPaused) {
      return;
    }
    this._isPaused = !this._isPaused;
    this._pauseTime = TweenLib.now();
    this._group.remove(this);
  }

  update(time: number): boolean {
    if (time < this._startTime!) {
      return true;
    }

    if (this._onStartCallbackFired === false) {
      if (this._onStartCallback !== null) {
        this._onStartCallback(this._object);
      }
      this._onStartCallbackFired = true;
    }

    let elapsed = (time - this._startTime!) / this._duration;
    elapsed = elapsed > 1 ? 1 : elapsed;

    const value = this._easingFunction(elapsed);

    for (const property in this._valuesEnd) {
      if (this._valuesStart[property] === undefined) {
        continue;
      }

      const start: any = this._valuesStart[property] || 0;
      let end: any = this._valuesEnd[property];

      if (end instanceof Array) {
        this._object[property] = this._interpolationFunction(end, value);
      } else {
        if (typeof end === "string") {
          if (end.charAt(0) === "+" || end.charAt(0) === "-") {
            end = start + parseFloat(end);
          } else {
            end = parseFloat(end);
          }
        }

        if (typeof end === "number") {
          this._object[property] = start + (end - start) * value;
        }
      }
    }

    if (this._onUpdateCallback !== null) {
      this._onUpdateCallback(this._object);
    }

    if (elapsed === 1) {
      if (this._repeat > 0) {
        if (isFinite(this._repeat)) {
          this._repeat--;
        }

        for (const property in this._valuesStartRepeat) {
          if (typeof this._valuesEnd[property] === "string") {
            this._valuesStartRepeat[property] =
              this._valuesStartRepeat[property] + parseFloat(this._valuesEnd[property]);
          }

          if (this._yoyo) {
            const tmp = this._valuesStartRepeat[property];
            this._valuesStartRepeat[property] = this._valuesEnd[property];
            this._valuesEnd[property] = tmp;
          }

          this._valuesStart[property] = this._valuesStartRepeat[property];
        }

        if (this._yoyo) {
          this._reversed = !this._reversed;
        }

        if (this._repeatDelayTime !== undefined) {
          this._startTime = time + this._repeatDelayTime;
        } else {
          this._startTime = time + this._delayTime;
        }

        return true;
      } else {
        if (this._onCompleteCallback !== null) {
          this._onCompleteCallback(this._object);
        }

        for (let i = 0; i < this._chainedTweens.length; i++) {
          this._chainedTweens[i].start(this._startTime! + this._duration);
        }

        return false;
      }
    }

    return true;
  }
}

const TweenEasing = {
  Linear: {
    None: (k: number): number => k,
  },
  Quadratic: {
    In: (k: number): number => k * k,
    Out: (k: number): number => k * (2 - k),
    InOut: (k: number): number => {
      if ((k *= 2) < 1) return 0.5 * k * k;
      return -0.5 * (--k * (k - 2) - 1);
    },
  },
  Cubic: {
    In: (k: number): number => k * k * k,
    Out: (k: number): number => --k * k * k + 1,
    InOut: (k: number): number => {
      if ((k *= 2) < 1) return 0.5 * k * k * k;
      return 0.5 * ((k -= 2) * k * k + 2);
    },
  },
  Quartic: {
    In: (k: number): number => k * k * k * k,
    Out: (k: number): number => 1 - --k * k * k * k,
    InOut: (k: number): number => {
      if ((k *= 2) < 1) return 0.5 * k * k * k * k;
      return -0.5 * ((k -= 2) * k * k * k - 2);
    },
  },
  Quintic: {
    In: (k: number): number => k * k * k * k * k,
    Out: (k: number): number => --k * k * k * k * k + 1,
    InOut: (k: number): number => {
      if ((k *= 2) < 1) return 0.5 * k * k * k * k * k;
      return 0.5 * ((k -= 2) * k * k * k * k + 2);
    },
  },
  Sinusoidal: {
    In: (k: number): number => 1 - Math.cos((k * Math.PI) / 2),
    Out: (k: number): number => Math.sin((k * Math.PI) / 2),
    InOut: (k: number): number => 0.5 * (1 - Math.cos(Math.PI * k)),
  },
  Exponential: {
    In: (k: number): number => (k === 0 ? 0 : Math.pow(1024, k - 1)),
    Out: (k: number): number => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    InOut: (k: number): number => {
      if (k === 0) return 0;
      if (k === 1) return 1;
      if ((k *= 2) < 1) return 0.5 * Math.pow(1024, k - 1);
      return 0.5 * (-Math.pow(2, -10 * (k - 1)) + 2);
    },
  },
  Circular: {
    In: (k: number): number => 1 - Math.sqrt(1 - k * k),
    Out: (k: number): number => Math.sqrt(1 - --k * k),
    InOut: (k: number): number => {
      if ((k *= 2) < 1) return -0.5 * (Math.sqrt(1 - k * k) - 1);
      return 0.5 * (Math.sqrt(1 - (k -= 2) * k) + 1);
    },
  },
  Elastic: {
    In: (k: number): number => {
      if (k === 0) return 0;
      if (k === 1) return 1;
      return -Math.pow(2, 10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI);
    },
    Out: (k: number): number => {
      if (k === 0) return 0;
      if (k === 1) return 1;
      return Math.pow(2, -10 * k) * Math.sin((k - 0.1) * 5 * Math.PI) + 1;
    },
    InOut: (k: number): number => {
      if (k === 0) return 0;
      if (k === 1) return 1;
      k *= 2;
      if (k < 1) return -0.5 * Math.pow(2, 10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI);
      return 0.5 * Math.pow(2, -10 * (k - 1)) * Math.sin((k - 1.1) * 5 * Math.PI) + 1;
    },
  },
  Back: {
    In: (k: number): number => {
      const s = 1.70158;
      return k * k * ((s + 1) * k - s);
    },
    Out: (k: number): number => {
      const s = 1.70158;
      return --k * k * ((s + 1) * k + s) + 1;
    },
    InOut: (k: number): number => {
      const s = 1.70158 * 1.525;
      if ((k *= 2) < 1) return 0.5 * (k * k * ((s + 1) * k - s));
      return 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2);
    },
  },
  Bounce: {
    In: (k: number): number => 1 - TweenEasing.Bounce.Out(1 - k),
    Out: (k: number): number => {
      if (k < 1 / 2.75) return 7.5625 * k * k;
      else if (k < 2 / 2.75) return 7.5625 * (k -= 1.5 / 2.75) * k + 0.75;
      else if (k < 2.5 / 2.75) return 7.5625 * (k -= 2.25 / 2.75) * k + 0.9375;
      else return 7.5625 * (k -= 2.625 / 2.75) * k + 0.984375;
    },
    InOut: (k: number): number => {
      if (k < 0.5) return TweenEasing.Bounce.In(k * 2) * 0.5;
      return TweenEasing.Bounce.Out(k * 2 - 1) * 0.5 + 0.5;
    },
  },
};

const TweenInterpolation = {
  Linear: (v: number[], k: number): number => {
    const m = v.length - 1;
    const f = m * k;
    const i = Math.floor(f);
    const fn = TweenInterpolation.Utils.Linear;

    if (k < 0) return fn(v[0], v[1], f);
    if (k > 1) return fn(v[m], v[m - 1], m - f);
    return fn(v[i], v[i + 1 > m ? m : i + 1], f - i);
  },

  Bezier: (v: number[], k: number): number => {
    let b = 0;
    const n = v.length - 1;
    const pw = Math.pow;
    const bn = TweenInterpolation.Utils.Bernstein;

    for (let i = 0; i <= n; i++) {
      b += pw(1 - k, n - i) * pw(k, i) * v[i] * bn(n, i);
    }

    return b;
  },

  CatmullRom: (v: number[], k: number): number => {
    const m = v.length - 1;
    let f = m * k;
    let i = Math.floor(f);
    const fn = TweenInterpolation.Utils.CatmullRom;

    if (v[0] === v[m]) {
      if (k < 0) {
        i = Math.floor((f = m * (1 + k)));
      }
      return fn(v[(i - 1 + m) % m], v[i], v[(i + 1) % m], v[(i + 2) % m], f - i);
    } else {
      if (k < 0) return v[0] - (fn(v[0], v[0], v[1], v[1], -f) - v[0]);
      if (k > 1) return v[m] - (fn(v[m], v[m], v[m - 1], v[m - 1], f - m) - v[m]);
      return fn(
        v[i ? i - 1 : 0],
        v[i],
        v[m < i + 1 ? m : i + 1],
        v[m < i + 2 ? m : i + 2],
        f - i
      );
    }
  },

  Utils: {
    Linear: (p0: number, p1: number, t: number): number => (p1 - p0) * t + p0,

    Bernstein: (n: number, i: number): number => {
      const fc = TweenInterpolation.Utils.Factorial;
      return fc(n) / fc(i) / fc(n - i);
    },

    Factorial: (() => {
      const a: number[] = [1];
      return (n: number): number => {
        let s = 1;
        if (a[n]) return a[n];
        for (let i = n; i > 1; i--) s *= i;
        a[n] = s;
        return s;
      };
    })(),

    CatmullRom: (
      p0: number,
      p1: number,
      p2: number,
      p3: number,
      t: number
    ): number => {
      const v0 = (p2 - p0) * 0.5;
      const v1 = (p3 - p1) * 0.5;
      const t2 = t * t;
      const t3 = t * t2;
      return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
    },
  },
};

const TweenLib = Object.assign(new TweenGroup(), {
  Group: TweenGroup,
  Tween: TweenItem,
  Easing: TweenEasing,
  Interpolation: TweenInterpolation,
  _nextId: 0,
  nextId(): number {
    return TweenLib._nextId++;
  },
  now(): number {
    return getTime() * 1000;
  },
});

(global as any).TWEEN = TweenLib;
