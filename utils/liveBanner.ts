import { LiveMode, LiveSnapshot } from '@/services/recognition/liveScanner';

export type BannerTone = 'neutral' | 'good' | 'warn' | 'bad';

export interface LiveBanner {
  tone: BannerTone;
  text: string;
}

interface Input {
  supported: boolean;
  loading: string | null;
  error: string | null;
  snapshot: LiveSnapshot | null;
  mode: LiveMode;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Counter shown on the camera, e.g. "3/5 cards" or "7 cards · 2 players". */
export function counterLabel(snapshot: LiveSnapshot | null, mode: LiveMode): string {
  if (mode.kind === 'cards') {
    return `${snapshot?.status ? Math.min(snapshot.status.detected, mode.expected) : 0}/${mode.expected} cards`;
  }
  const recognised = snapshot?.recognised ?? 0;
  return snapshot?.table
    ? `${plural(recognised, 'card')} · ${plural(snapshot.table.players, 'player')}`
    : plural(recognised, 'card');
}

/** What to tell the user about the live scan right now. */
export function describeLive({ supported, loading, error, snapshot, mode }: Input): LiveBanner | null {
  if (!supported) {
    return { tone: 'neutral', text: 'Live detection runs in the web app. Take a photo to read the cards.' };
  }
  if (error) return { tone: 'bad', text: `Live detection unavailable. You can still take a photo.` };
  if (!snapshot) return { tone: 'neutral', text: loading ?? 'Starting live detection…' };

  const status = snapshot.status;
  if (snapshot.stable) {
    return {
      tone: 'good',
      text: mode.kind === 'cards'
        ? `All ${mode.expected} cards detected. Tap capture.`
        : `Table recognised: ${plural(snapshot.recognised, 'card')}. Tap capture.`,
    };
  }
  if (status && status.unreadable > 0 && status.detected < status.expected) {
    return { tone: 'bad', text: `${plural(status.unreadable, 'card')} can't be read. Adjust the angle, focus or light.` };
  }
  if (!snapshot.cards.length && snapshot.emptyForMs > 3000) {
    return { tone: 'bad', text: 'No cards recognised. Move closer, add light and hold steady.' };
  }
  if (status && status.extra > 0) {
    return { tone: 'warn', text: `${plural(status.detected, 'card')} visible but ${status.expected} needed.` };
  }
  if (mode.kind === 'table') {
    return {
      tone: 'warn',
      text: snapshot.recognised
        ? `Scanning the table: ${plural(snapshot.recognised, 'card')} so far…`
        : 'Scanning the table…',
    };
  }
  return { tone: 'warn', text: `Scanning… ${counterLabel(snapshot, mode)} detected.` };
}

/** Message for the "capture anyway" warning, or null when capture needs no warning. */
export function captureWarning(snapshot: LiveSnapshot | null, mode: LiveMode): string | null {
  if (!snapshot || snapshot.stable) return null;
  return mode.kind === 'cards'
    ? `Only ${counterLabel(snapshot, mode)} detected live. The photo may miss cards you can correct on the next screen.`
    : `The live view has recognised ${plural(snapshot.recognised, 'card')} and no complete table yet. The photo may miss cards.`;
}
