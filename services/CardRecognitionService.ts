import { RecognitionResult } from '@/types/poker';

/**
 * Boundary between the UI and whatever turns a photo into cards. Screens only
 * depend on this interface, so the detector can be swapped without UI changes.
 */
export interface CardRecognitionAdapter {
  recognize(imageUri: string, expectedCount: number): Promise<RecognitionResult>;
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

function defaultAdapter(): CardRecognitionAdapter {
  if (typeof document !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OnnxWebRecognizer } = require('./recognition/onnxWebRecognizer');
    return new OnnxWebRecognizer();
  }
  return new ManualFallbackRecognition();
}

export const CardRecognitionService = {
  setAdapter(nextAdapter: CardRecognitionAdapter) {
    adapter = nextAdapter;
  },
  recognize(imageUri: string, expectedCount: number) {
    if (!adapter) adapter = defaultAdapter();
    return adapter.recognize(imageUri, expectedCount);
  },
};
