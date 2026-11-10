export interface LiveComparison {
  agreed: string[];
  /** Seen in the live view but not read from the final photo. */
  onlyLive: string[];
  /** Read from the final photo but never confirmed live. */
  onlyFinal: string[];
  /** True when both passes saw exactly the same cards. */
  identical: boolean;
  summary: string;
}

/** Compares the cards trusted by the live preview with those read from the full-resolution photo. */
export function compareRecognition(liveCodes: string[], finalCodes: string[]): LiveComparison {
  const live = new Set(liveCodes);
  const final = new Set(finalCodes);
  const agreed = [...final].filter((code) => live.has(code));
  const onlyLive = [...live].filter((code) => !final.has(code));
  const onlyFinal = [...final].filter((code) => !live.has(code));
  const identical = !onlyLive.length && !onlyFinal.length;

  let summary: string;
  if (!live.size) {
    summary = 'No live preview results to compare with the photo.';
  } else if (identical) {
    summary = `Live preview and photo agree on all ${agreed.length} card${agreed.length === 1 ? '' : 's'}.`;
  } else {
    const parts: string[] = [];
    if (onlyFinal.length) parts.push(`photo also read ${onlyFinal.join(', ')}`);
    if (onlyLive.length) parts.push(`live preview saw ${onlyLive.join(', ')} but the photo did not`);
    summary = `${agreed.length} card${agreed.length === 1 ? '' : 's'} agree; ${parts.join('; ')}. Please check.`;
  }
  return { agreed, onlyLive, onlyFinal, identical, summary };
}
