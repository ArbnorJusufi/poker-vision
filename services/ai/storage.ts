import { AiConnection, PROVIDERS } from './types';

const STORAGE_KEY = 'poker-vision.ai-connection';

type Listener = () => void;

const listeners = new Set<Listener>();
let memory: string | null = null;
let cachedRaw: string | null | undefined;
let cachedValue: AiConnection | null = null;

function readRaw(): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode); fall back to memory for this session.
  }
  return memory;
}

function writeRaw(value: string | null) {
  memory = value;
  try {
    if (typeof localStorage !== 'undefined') {
      if (value === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // Kept in memory only.
  }
  listeners.forEach((listener) => listener());
}

export function parseConnection(raw: string | null): AiConnection | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AiConnection>;
    if (!value.provider || !(value.provider in PROVIDERS) || !value.apiKey) return null;
    return {
      provider: value.provider,
      apiKey: value.apiKey,
      model: value.model || PROVIDERS[value.provider].defaultModel,
      method: value.method === 'signin' ? 'signin' : 'key',
    };
  } catch {
    return null;
  }
}

/** Returns the same object until the stored value changes, so it can feed useSyncExternalStore. */
export function getConnection(): AiConnection | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parseConnection(raw);
  }
  return cachedValue;
}

export function saveConnection(connection: AiConnection) {
  writeRaw(JSON.stringify(connection));
}

export function clearConnection() {
  writeRaw(null);
}

export function subscribeConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
