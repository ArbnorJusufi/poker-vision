import { AiConnection, PROVIDERS } from './types';

const VERIFIER_KEY = 'poker-vision.openrouter-verifier';
const AUTH_URL = 'https://openrouter.ai/auth';
const EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function authorizeUrl(callbackUrl: string, challenge: string): string {
  const query = new URLSearchParams({ callback_url: callbackUrl, code_challenge: challenge, code_challenge_method: 'S256' });
  return `${AUTH_URL}?${query.toString()}`;
}

/** The page OpenRouter sends the user back to. The home page always exists, whatever the host's routing. */
export function callbackUrl(): string {
  return `${window.location.origin}/`;
}

export async function startOpenRouterSignIn(): Promise<void> {
  const { verifier, challenge } = await createPkcePair();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  window.location.assign(authorizeUrl(callbackUrl(), challenge));
}

/** The sign-in code in the address bar, only when this tab started a sign-in. */
export function pendingSignInCode(search: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  if (!sessionStorage.getItem(VERIFIER_KEY)) return null;
  return new URLSearchParams(search).get('code');
}

let exchange: Promise<AiConnection> | null = null;

/** Trades the code for the user's own API key. Safe to call twice for the same code. */
export function completeOpenRouterSignIn(code: string): Promise<AiConnection> {
  if (exchange) return exchange;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return Promise.reject(new Error('The sign-in was not started in this browser tab.'));
  exchange = (async () => {
    try {
      const response = await fetch(EXCHANGE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
      });
      const body = (await response.json().catch(() => null)) as { key?: string } | null;
      if (!response.ok || !body?.key) throw new Error('OpenRouter did not accept the sign-in. Please try again.');
      return {
        provider: 'openrouter',
        apiKey: body.key,
        model: PROVIDERS.openrouter.defaultModel,
        method: 'signin',
      } satisfies AiConnection;
    } finally {
      sessionStorage.removeItem(VERIFIER_KEY);
      exchange = null;
    }
  })();
  return exchange;
}
