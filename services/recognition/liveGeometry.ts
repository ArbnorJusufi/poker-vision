import { Region } from './yolo';

export interface CoverTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Maps source-frame pixels to view pixels for a video drawn with
 * `object-fit: cover` (the scaled frame fills the view and the overflow is cropped).
 */
export function coverTransform(sourceWidth: number, sourceHeight: number, viewWidth: number, viewHeight: number): CoverTransform {
  const scale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
  return {
    scale,
    offsetX: (viewWidth - sourceWidth * scale) / 2,
    offsetY: (viewHeight - sourceHeight * scale) / 2,
  };
}

export function mapBox(box: [number, number, number, number], t: CoverTransform): Region {
  return {
    x: box[0] * t.scale + t.offsetX,
    y: box[1] * t.scale + t.offsetY,
    width: (box[2] - box[0]) * t.scale,
    height: (box[3] - box[1]) * t.scale,
  };
}
