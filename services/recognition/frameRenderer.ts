import { Variant, applyVariant } from './imageOps';
import { INPUT_SIZE, Region, letterboxFor } from './yolo';

export interface FrameRenderer {
  /** Draws a region of the source into the model's 640 px letterboxed input and returns its pixels. */
  render(source: CanvasImageSource, region: Region, variant?: Variant): Uint8ClampedArray;
  dispose(): void;
}

/** Reuses one canvas so continuous scanning does not allocate a canvas per frame. */
export function createFrameRenderer(): FrameRenderer {
  let canvas: HTMLCanvasElement | null = document.createElement('canvas');
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  return {
    render(source, region, variant = 'plain') {
      if (!context) throw new Error('Canvas is not available.');
      const letterbox = letterboxFor(region.width, region.height);
      context.fillStyle = 'rgb(114,114,114)';
      context.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        source, region.x, region.y, region.width, region.height,
        letterbox.padX, letterbox.padY, letterbox.width, letterbox.height,
      );
      return applyVariant(context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data, INPUT_SIZE, variant);
    },
    dispose() {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
        canvas = null;
      }
    },
  };
}
