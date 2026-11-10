import { RecognitionResult } from '@/types/poker';

/**
 * Boundary for a future bundled TFLite/CoreML card detector. Expo Camera returns
 * the image URI; a production model adapter should implement recognize().
 */
export interface CardRecognitionAdapter {
  recognize(imageUri: string, expectedCount: number): Promise<RecognitionResult>;
}

class ManualFallbackRecognition implements CardRecognitionAdapter {
  async recognize(_imageUri: string, _expectedCount: number): Promise<RecognitionResult> {
    return {
      cards: [],
      source: 'manual',
      message: 'No trained recognition model is bundled. Select the photographed cards manually.',
    };
  }
}

let adapter: CardRecognitionAdapter = new ManualFallbackRecognition();

export const CardRecognitionService = {
  setAdapter(nextAdapter: CardRecognitionAdapter) {
    adapter = nextAdapter;
  },
  recognize(imageUri: string, expectedCount: number) {
    return adapter.recognize(imageUri, expectedCount);
  },
};
