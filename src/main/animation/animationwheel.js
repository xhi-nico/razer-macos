import { RazerDeviceAnimation } from './animation';
import tinycolor from 'tinycolor2';

export class RazerAnimationWheel extends RazerDeviceAnimation {

constructor(device, featureConfiguration, speed) {
    super();
    this.wheelEffectInterval = null;

    this.device = device;

    this.nRows = featureConfiguration.rows;
    this.nCols = featureConfiguration.cols;
    this.speed = speed; // seconds per cycle
  }

  start() {
    const frameMs = 50;
    const midRow = Math.floor(this.nRows / 2);
    const midCol = Math.floor(this.nCols / 2);
    const cycleMs = this.speed * 1000;

    this.wheelEffectInterval = setInterval(() => {
      const turn = (Date.now() % cycleMs) / cycleMs * 360;
      const matrix = Array.from({ length: this.nRows }, (_, i) => Array.from({ length: this.nCols }, (_, j) => {
        let angle = Math.atan((midRow - i) / (j - midCol)) / Math.PI * 180;
        if (j < midCol) angle += 180;
        if (i === midRow && j === midCol) angle = 0;
        angle = (angle + turn + 360) % 360;
        return Object.values(tinycolor(`hsv(${360 - angle}, 100%, 100%)`).toRgb()).slice(0, 3);
      }));
      try {
        this.device.setCustomFrames(matrix);
      } catch (error) {
        console.warn(`Wheel: ${this.device.name} stopped answering, so the wheel stops:`, error?.message ?? error);
        this.stop();
      }
    }, frameMs);
  }

  stop() {
    clearInterval(this.wheelEffectInterval);
    this.wheelEffectInterval = null;
  }

  destroy() {
    this.stop();
  }
}
