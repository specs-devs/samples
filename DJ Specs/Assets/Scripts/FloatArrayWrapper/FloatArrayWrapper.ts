/**
 * Specs Inc. 2026
 * Float Array Wrapper utility class for the DJ Specs Spectacles lens.
 * Pure module — imported by other scripts. Not a ScriptComponent.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";

export class FloatArrayWrapper {
  private dataList: Float32Array[] = [];
  private currentElementCount: number = 0;
  private readonly _innerArraySize: number = 4096;

  push(floatArray: Float32Array, arrayRealSize: number): void {
    let availableElementsInCurrentArray =
      this._innerArraySize - (this.currentElementCount % this._innerArraySize);
    if (this.currentElementCount % this._innerArraySize === 0) {
      availableElementsInCurrentArray = 0;
    }

    const additionalElementsCount = arrayRealSize - availableElementsInCurrentArray;
    const arraysToAddCount = Math.ceil(additionalElementsCount / this._innerArraySize);

    this.createAdditionalInnerArrays(arraysToAddCount);
    let currentCopiedElementIndex = 0;

    while (currentCopiedElementIndex < arrayRealSize) {
      const dataArrayIndex = Math.floor(this.currentElementCount / this._innerArraySize);
      const innerArrayIndex = this.currentElementCount % this._innerArraySize;
      if (this.dataList[dataArrayIndex]) {
        this.dataList[dataArrayIndex][innerArrayIndex] = floatArray[currentCopiedElementIndex];
      }
      this.currentElementCount += 1;
      currentCopiedElementIndex += 1;
    }
  }

  shift(): Float32Array | undefined {
    return this.dataList.shift();
  }

  private createAdditionalInnerArrays(arraysCount: number): void {
    for (let i = 0; i < arraysCount; i++) {
      this.dataList.push(new Float32Array(this._innerArraySize));
    }
  }

  getElement(idx: number): number {
    const arrayIndex = Math.floor(idx / this._innerArraySize);
    const elementInArrayIdx = idx % this._innerArraySize;
    if (this.dataList[arrayIndex]) {
      return this.dataList[arrayIndex][elementInArrayIdx];
    }
    return 0;
  }

  getSize(): number {
    return this.currentElementCount;
  }

  clear(): void {
    this.currentElementCount = 0;
    this.dataList = [];
  }

  validate(logger: Logger): void {
    logger.debug("DEBUG LENGTH = " + this.dataList.length);
  }

  getSizeInBytes(): number {
    if (this.dataList[0]) {
      return this.currentElementCount * this.dataList[0].BYTES_PER_ELEMENT;
    }
    return 0;
  }
}

// Match FloatArrayWrapper.js: library scripts on disabled scene objects never run, so importers
// must not rely on global registration from a SceneObject alone.
(globalThis as unknown as { FloatArrayWrapper?: typeof FloatArrayWrapper }).FloatArrayWrapper =
  FloatArrayWrapper;
