import type { CardRecognitionAdapter, RecognitionStatusListener } from '@/services/CardRecognitionService';
import { RecognitionResult, TableDetection } from '@/types/poker';
import { Variant, applyVariant } from './imageOps';
import { PassRunner, detectCards, detectTable } from './pipeline';
import { INPUT_SIZE, Region, codeToCard, decodeOutput, letterboxFor, rgbaToTensor } from './yolo';

const MODEL_URL = '/models/cards.onnx';
const ORT_BASE = '/ort/';
const DETECTION_THRESHOLD = 0.12;
/** Table mode keeps weak detections; the pipeline filters them by size and position. */
const TABLE_THRESHOLD = 0.02;

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
  InferenceSession: { create(model: Uint8Array, options: object): Promise<OrtSession> };
}

let sessionPromise: Promise<OrtSession> | null = null;
let sessionReady = false;
const statusListeners = new Set<RecognitionStatusListener>();

const emit = (status: string) => statusListeners.forEach((listener) => listener(status));
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

async function downloadModel(): Promise<Uint8Array> {
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Could not download the card model (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    emit(
      total
        ? `Loading card detector… ${Math.min(99, Math.round((received / total) * 100))}%`
        : `Loading card detector… ${(received / 1048576).toFixed(0)} MB`,
    );
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function getSession(): Promise<OrtSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      emit('Loading card detector…');
      const w = window as unknown as { ort?: OrtRuntime };
      if (!w.ort) await loadScript(`${ORT_BASE}ort.wasm.min.js`);
      const ort = w.ort;
      if (!ort) throw new Error('ONNX runtime failed to initialise.');
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.numThreads = 1;
      const bytes = await downloadModel();
      emit('Preparing card detector…');
      await yieldToUi();
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      sessionReady = true;
      return session;
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

function renderRegion(bitmap: ImageBitmap, region: Region, variant: Variant): Uint8ClampedArray {
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
  const rgba = context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  return applyVariant(rgba, INPUT_SIZE, variant);
}

export class OnnxWebRecognizer implements CardRecognitionAdapter {
  async warmUp(onStatus?: RecognitionStatusListener): Promise<void> {
    if (sessionReady) return;
    if (onStatus) statusListeners.add(onStatus);
    try {
      await getSession();
    } finally {
      if (onStatus) statusListeners.delete(onStatus);
    }
  }

  async recognize(
    imageUri: string,
    expectedCount: number,
    onStatus?: RecognitionStatusListener,
  ): Promise<RecognitionResult> {
    if (onStatus) statusListeners.add(onStatus);
    try {
      onStatus?.(sessionReady ? 'Reading photo…' : 'Loading card detector…');
      const [session, bitmap] = await Promise.all([getSession(), loadBitmap(imageUri)]);
      const ort = (window as unknown as { ort: OrtRuntime }).ort;

      try {
        const runRegion = this.passRunner(session, ort, bitmap);

        const { detections } = await detectCards(
          runRegion, bitmap.width, bitmap.height, expectedCount, emit,
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
      if (onStatus) statusListeners.delete(onStatus);
    }
  }

  private passRunner(
    session: OrtSession, ort: OrtRuntime, bitmap: ImageBitmap, threshold = DETECTION_THRESHOLD,
  ): PassRunner {
    return async (region: Region, variant: Variant) => {
      if (variant === 'plain') emit(region.width < bitmap.width ? 'Looking closer…' : 'Detecting cards…');
      await yieldToUi();
      const rgba = renderRegion(bitmap, region, variant);
      const input = new ort.Tensor('float32', rgbaToTensor(rgba), [1, 3, INPUT_SIZE, INPUT_SIZE]);
      const outputs = await session.run({ [session.inputNames[0]]: input });
      const output = outputs[session.outputNames[0]];
      return decodeOutput(
        output.data, output.dims[2], letterboxFor(region.width, region.height), region, threshold,
      );
    };
  }

  async recognizeTable(imageUri: string, onStatus?: RecognitionStatusListener): Promise<TableDetection> {
    if (onStatus) statusListeners.add(onStatus);
    try {
      emit(sessionReady ? 'Reading photo…' : 'Loading card detector…');
      const [session, bitmap] = await Promise.all([getSession(), loadBitmap(imageUri)]);
      const ort = (window as unknown as { ort: OrtRuntime }).ort;
      try {
        const { cards } = await detectTable(
          this.passRunner(session, ort, bitmap, TABLE_THRESHOLD), bitmap.width, bitmap.height, emit,
        );
        return { imageWidth: bitmap.width, imageHeight: bitmap.height, cards };
      } finally {
        bitmap.close();
      }
    } finally {
      if (onStatus) statusListeners.delete(onStatus);
    }
  }
}
