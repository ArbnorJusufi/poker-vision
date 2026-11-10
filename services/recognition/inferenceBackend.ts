/**
 * Runs the card detector's neural network. On the web it lives in a Web Worker
 * so camera frames can be analysed continuously without blocking the UI; if
 * workers are unavailable it falls back to the main thread.
 * Everything above this file only sees `InferenceBackend`.
 */
export interface InferenceOutput {
  data: Float32Array;
  dims: readonly number[];
}

export interface InferenceBackend {
  isReady(): boolean;
  /** Loads the model (once). Progress is reported through the listener. */
  load(onStatus?: (status: string) => void): Promise<void>;
  /** Runs one 1x3x640x640 float input. */
  run(input: Float32Array): Promise<InferenceOutput>;
}

export const MODEL_URL = '/models/cards.onnx';
export const ORT_BASE = '/ort/';
const WORKER_URL = '/workers/inference.worker.js';

type StatusListener = (status: string) => void;

class WorkerBackend implements InferenceBackend {
  private worker: Worker;
  private ready = false;
  private loading: Promise<void> | null = null;
  private listeners = new Set<StatusListener>();
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: InferenceOutput) => void; reject: (error: Error) => void }>();
  private settleLoad: { resolve: () => void; reject: (error: Error) => void } | null = null;

  constructor() {
    this.worker = new Worker(WORKER_URL);
    this.worker.onmessage = (event: MessageEvent) => this.handle(event.data);
    this.worker.onerror = (event) => this.fail(new Error(event.message || 'The detector worker crashed.'));
  }

  isReady() {
    return this.ready;
  }

  load(onStatus?: StatusListener): Promise<void> {
    if (onStatus) this.listeners.add(onStatus);
    if (!this.loading) {
      this.loading = new Promise<void>((resolve, reject) => {
        this.settleLoad = { resolve, reject };
        this.worker.postMessage({ type: 'init', modelUrl: MODEL_URL, ortBase: ORT_BASE });
      });
    }
    const done = this.loading.finally(() => {
      if (onStatus) this.listeners.delete(onStatus);
    });
    done.catch(() => undefined);
    return done;
  }

  run(input: Float32Array): Promise<InferenceOutput> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'run', id, input }, [input.buffer]);
    });
  }

  private handle(message: {
    type: string; id?: number; text?: string; message?: string; data?: Float32Array; dims?: number[];
  }) {
    if (message.type === 'status') {
      this.listeners.forEach((listener) => listener(message.text ?? ''));
    } else if (message.type === 'ready') {
      this.ready = true;
      this.settleLoad?.resolve();
    } else if (message.type === 'result' && message.id !== undefined) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      entry?.resolve({ data: message.data as Float32Array, dims: message.dims as number[] });
    } else if (message.type === 'error') {
      const error = new Error(message.message ?? 'Detection failed.');
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        entry?.reject(error);
      } else {
        this.fail(error);
      }
    }
  }

  private fail(error: Error) {
    this.settleLoad?.reject(error);
    this.pending.forEach((entry) => entry.reject(error));
    this.pending.clear();
  }
}

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

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

/** Fallback for browsers without module-capable workers: same model, UI thread. */
class MainThreadBackend implements InferenceBackend {
  private session: OrtSession | null = null;
  private loading: Promise<void> | null = null;

  isReady() {
    return this.session !== null;
  }

  load(onStatus?: StatusListener): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        onStatus?.('Loading card detector…');
        const w = window as unknown as { ort?: OrtRuntime };
        if (!w.ort) await loadScript(`${ORT_BASE}ort.wasm.min.js`);
        const ort = w.ort;
        if (!ort) throw new Error('ONNX runtime failed to initialise.');
        ort.env.wasm.wasmPaths = ORT_BASE;
        ort.env.wasm.numThreads = 1;
        const response = await fetch(MODEL_URL);
        if (!response.ok) throw new Error(`Could not download the card model (${response.status}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        onStatus?.('Preparing card detector…');
        this.session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      })().catch((error) => {
        this.loading = null;
        throw error;
      });
    }
    return this.loading;
  }

  async run(input: Float32Array): Promise<InferenceOutput> {
    const session = this.session;
    const ort = (window as unknown as { ort: OrtRuntime }).ort;
    if (!session) throw new Error('Detector is not loaded yet.');
    const tensor = new ort.Tensor('float32', input, [1, 3, 640, 640]);
    const outputs = await session.run({ [session.inputNames[0]]: tensor });
    const output = outputs[session.outputNames[0]];
    return { data: output.data, dims: output.dims };
  }
}

let backend: InferenceBackend | null = null;

export function getInferenceBackend(): InferenceBackend {
  if (!backend) {
    try {
      backend = typeof Worker !== 'undefined' ? new WorkerBackend() : new MainThreadBackend();
    } catch {
      backend = new MainThreadBackend();
    }
  }
  return backend;
}
