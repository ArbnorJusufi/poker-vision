import { Detection, Region, mergeByCode, nonMaxSuppression, selectCards, tileRegions } from './yolo';

export type RegionRunner = (region: Region) => Promise<Detection[]>;

export interface DetectionOutcome {
  detections: Detection[];
  usedTiles: boolean;
}

/**
 * Runs the detector on the whole image first. When fewer cards than expected
 * are found it also scans overlapping tiles, which helps when the photo was
 * taken from far away and the card indices are only a few pixels wide.
 */
export async function detectCards(
  run: RegionRunner,
  width: number,
  height: number,
  expected: number,
): Promise<DetectionOutcome> {
  let all = nonMaxSuppression(await run({ x: 0, y: 0, width, height }));
  let merged = mergeByCode(all);
  let usedTiles = false;

  if (merged.length < expected) {
    usedTiles = true;
    for (const tile of tileRegions(width, height)) {
      all = all.concat(nonMaxSuppression(await run(tile)));
    }
    merged = mergeByCode(all);
  }
  return { detections: selectCards(merged, expected), usedTiles };
}
