import { RecognitionResult } from '@/types/poker';

export type RecognitionStatusListener = (status: string) => void;

/**
 * Boundary between the UI and whatever turns a photo into cards. Screens only
 * depend on this interface, so the detector can be swapped without UI changes.
 */
export interface CardRecognitionAdapter {
  recognize(
    imageUri: string,
    expectedCount: number,
    onStatus?: RecognitionStatusListener,
  ): Promise<RecognitionResult>;
  /** Optionally load heavy resources ahead of the first photo. */
  warmUp?(onStatus?: RecognitionStatusListener): Promise<void>;
}

class ManualFallbackRecognition implements CardRecognitionAdapter {
  async recognize(): Promise<RecognitionResult> {
    return {
      cards: [],
      source: 'manual',
      message:
        'Automatic detection runs in the web app (including the home-screen install on iPhone). ' +
        'In this native build, select the photographed cards manually.',
    };
  }
}

let adapter: CardRecognitionAdapter | null = null;

function currentAdapter(): CardRecognitionAdapter {
  if (!adapter) {
    if (typeof document !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OnnxWebRecognizer } = require('./recognition/onnxWebRecognizer');
      adapter = new OnnxWebRecognizer() as CardRecognitionAdapter;
    } else {
      adapter = new ManualFallbackRecognition();
    }
  }
  return adapter;
}

export const CardRecognitionService = {
  setAdapter(nextAdapter: CardRecognitionAdapter) {
    adapter = nextAdapter;
  },
  recognize(imageUri: string, expectedCount: number, onStatus?: RecognitionStatusListener) {
    return currentAdapter().recognize(imageUri, expectedCount, onStatus);
  },
  warmUp(onStatus?: RecognitionStatusListener): Promise<void> {
    return currentAdapter().warmUp?.(onStatus) ?? Promise.resolve();
  },
};
