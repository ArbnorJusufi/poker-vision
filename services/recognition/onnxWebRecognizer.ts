import type { CardRecognitionAdapter } from '@/services/CardRecognitionService';
import { RecognitionResult } from '@/types/poker';
import { detectCards } from './detectCards';
import { INPUT_SIZE, Region, codeToCard, decodeOutput, letterboxFor, rgbaToTensor } from './yolo';

const MODEL_URL = '/models/cards.onnx';
const ORT_BASE = '/ort/';
const DETECTION_THRESHOLD = 0.3;

interface OrtTensor {
  data: Float32Array;
  dims: readonly number[];
}
interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
}
interface OrtRuntime {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(url: string, options: object): Promise<OrtSession> };
}

let sessionPromise: Promise<OrtSession> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

async function getSession(): Promise<OrtSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const w = window as unknown as { ort?: OrtRuntime };
      if (!w.ort) await loadScript(`${ORT_BASE}ort.wasm.min.js`);
      const ort = w.ort;
      if (!ort) throw new Error('ONNX runtime failed to initialise.');
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      return ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function loadBitmap(uri: string): Promise<ImageBitmap> {
  const response = await fetch(uri);
  return createImageBitmap(await response.blob());
}

function renderRegion(bitmap: ImageBitmap, region: Region): { rgba: Uint8ClampedArray; region: Region } {
  const letterbox = letterboxFor(region.width, region.height);
  const canvas = document.createElement('canvas');
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is not available.');
  context.fillStyle = 'rgb(114,114,114)';
  context.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap, region.x, region.y, region.width, region.height,
    letterbox.padX, letterbox.padY, letterbox.width, letterbox.height,
  );
  return { rgba: context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data, region };
}

export class OnnxWebRecognizer implements CardRecognitionAdapter {
  async recognize(imageUri: string, expectedCount: number): Promise<RecognitionResult> {
    const [session, bitmap] = await Promise.all([getSession(), loadBitmap(imageUri)]);
    const ort = (window as unknown as { ort: OrtRuntime }).ort;

    try {
      const runRegion = async (region: Region) => {
        const { rgba } = renderRegion(bitmap, region);
        const input = new ort.Tensor('float32', rgbaToTensor(rgba), [1, 3, INPUT_SIZE, INPUT_SIZE]);
        const outputs = await session.run({ [session.inputNames[0]]: input });
        const output = outputs[session.outputNames[0]];
        return decodeOutput(
          output.data, output.dims[2], letterboxFor(region.width, region.height), region, DETECTION_THRESHOLD,
        );
      };

      const { detections } = await detectCards(runRegion, bitmap.width, bitmap.height, expectedCount);
      const cards = detections.map((detection) => codeToCard(detection.code));
      const confidences = detections.map((detection) => detection.confidence);
      const confidence = confidences.length ? Math.min(...confidences) : undefined;

      let message: string | undefined;
      if (!cards.length) message = 'No cards were detected. Retake the photo with better light and the card corners visible.';
      else if (cards.length < expectedCount) {
        message = `Detected ${cards.length} of ${expectedCount} cards. Add the missing cards manually or retake the photo.`;
      }
      return { cards, confidences, confidence, source: 'model', message };
    } finally {
      bitmap.close();
    }
  }
}
