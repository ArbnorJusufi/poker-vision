import type { CardRecognitionAdapter, RecognitionStatusListener } from '@/services/CardRecognitionService';
import { RecognitionResult, TableDetection } from '@/types/poker';
import { createFrameRenderer } from './frameRenderer';
import { Variant } from './imageOps';
import { getInferenceBackend } from './inferenceBackend';
import { PassRunner, detectCards, detectTable } from './pipeline';
import { detectSplitIndexCards } from './splitIndexDetector';
import { Region, codeToCard, decodeOutput, letterboxFor, rgbaToTensor } from './yolo';

export const DETECTION_THRESHOLD = 0.12;
/** Table mode keeps weak detections; the pipeline filters them by size and position. */
const TABLE_THRESHOLD = 0.02;

const statusListeners = new Set<RecognitionStatusListener>();
const emit = (status: string) => statusListeners.forEach((listener) => listener(status));
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

async function loadBitmap(uri: string): Promise<ImageBitmap> {
  const response = await fetch(uri);
  return createImageBitmap(await response.blob());
}

export class OnnxWebRecognizer implements CardRecognitionAdapter {
  async warmUp(onStatus?: RecognitionStatusListener): Promise<void> {
    const backend = getInferenceBackend();
    if (backend.isReady()) return;
    await backend.load(onStatus);
  }

  async recognize(
    imageUri: string,
    expectedCount: number,
    onStatus?: RecognitionStatusListener,
  ): Promise<RecognitionResult> {
    if (onStatus) statusListeners.add(onStatus);
    const renderer = createFrameRenderer();
    try {
      const backend = getInferenceBackend();
      emit(backend.isReady() ? 'Reading photo…' : 'Loading card detector…');
      const [, bitmap] = await Promise.all([backend.load(emit), loadBitmap(imageUri)]);

      try {
        const seed = await this.splitIndexSeed(bitmap);
        const { detections } = await detectCards(
          this.passRunner(bitmap, renderer, DETECTION_THRESHOLD), bitmap.width, bitmap.height, expectedCount, emit, seed,
        );
        const cards = detections.map((detection) => codeToCard(detection.code));
        const confidences = detections.map((detection) => detection.confidence);
        const confidence = confidences.length ? Math.min(...confidences) : undefined;

        let message: string | undefined;
        if (!cards.length) {
          message = 'No cards were detected. Retake the photo with better light and the card corners visible.';
        } else if (cards.length < expectedCount) {
          message = `Detected ${cards.length} of ${expectedCount} cards. Add the missing cards manually or retake the photo.`;
        }
        return { cards, confidences, confidence, source: 'model', message };
      } finally {
        bitmap.close();
      }
    } finally {
      renderer.dispose();
      if (onStatus) statusListeners.delete(onStatus);
    }
  }

  async recognizeTable(imageUri: string, onStatus?: RecognitionStatusListener): Promise<TableDetection> {
    if (onStatus) statusListeners.add(onStatus);
    const renderer = createFrameRenderer();
    try {
      const backend = getInferenceBackend();
      emit(backend.isReady() ? 'Reading photo…' : 'Loading card detector…');
      const [, bitmap] = await Promise.all([backend.load(emit), loadBitmap(imageUri)]);
      try {
        const seed = await this.splitIndexSeed(bitmap);
        const { cards } = await detectTable(
          this.passRunner(bitmap, renderer, TABLE_THRESHOLD), bitmap.width, bitmap.height, emit, seed,
        );
        return { imageWidth: bitmap.width, imageHeight: bitmap.height, cards };
      } finally {
        bitmap.close();
      }
    } finally {
      renderer.dispose();
      if (onStatus) statusListeners.delete(onStatus);
    }
  }

  /** Cards with the rank and suit printed apart are read separately; the result votes with the normal passes. */
  private async splitIndexSeed(bitmap: ImageBitmap) {
    emit('Reading card layout…');
    await yieldToUi();
    try {
      return await detectSplitIndexCards(bitmap, bitmap.width, bitmap.height, (input) => getInferenceBackend().run(input));
    } catch {
      return [];
    }
  }

  private passRunner(
    bitmap: ImageBitmap, renderer: ReturnType<typeof createFrameRenderer>, threshold: number,
  ): PassRunner {
    const backend = getInferenceBackend();
    return async (region: Region, variant: Variant) => {
      if (variant === 'plain') emit(region.width < bitmap.width ? 'Looking closer…' : 'Detecting cards…');
      await yieldToUi();
      const input = rgbaToTensor(renderer.render(bitmap, region, variant));
      const output = await backend.run(input);
      return decodeOutput(output.data, output.dims[2], letterboxFor(region.width, region.height), region, threshold);
    };
  }
}
