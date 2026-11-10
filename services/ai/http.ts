import { AiConnection, AiImage } from './types';

export interface AiHttpRequest {
  url: string;
  init: { method: 'POST'; headers: Record<string, string>; body: string };
}

const MAX_TOKENS = 800;

export function buildRequest(connection: AiConnection, prompt: string, image: AiImage | null): AiHttpRequest {
  const { provider, apiKey, model } = connection;
  const dataUrl = image ? `data:${image.mime};base64,${image.base64}` : null;

  if (provider === 'anthropic') {
    const content: unknown[] = [];
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } });
    content.push({ type: 'text', text: prompt });
    return {
      url: 'https://api.anthropic.com/v1/messages',
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content }] }),
      },
    };
  }

  if (provider === 'gemini') {
    const parts: unknown[] = [{ text: prompt }];
    if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.base64 } });
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_TOKENS * 4 },
        }),
      },
    };
  }

  const content: unknown[] = [{ type: 'text', text: prompt }];
  if (dataUrl) content.push({ type: 'image_url', image_url: { url: dataUrl } });
  const openRouter = provider === 'openrouter';
  return {
    url: openRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...(openRouter ? { 'x-title': 'Poker Vision' } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        ...(openRouter ? { max_tokens: MAX_TOKENS * 4 } : { max_completion_tokens: MAX_TOKENS * 4 }),
      }),
    },
  };
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => (part && typeof part === 'object' && 'text' in part ? String((part as { text: unknown }).text) : ''))
      .join('');
  }
  return '';
}

export function extractText(connection: AiConnection, body: unknown): string {
  const data = body as Record<string, any>;
  if (connection.provider === 'anthropic') return textOf(data?.content);
  if (connection.provider === 'gemini') {
    return (data?.candidates?.[0]?.content?.parts ?? [])
      .map((part: { text?: string }) => part.text ?? '')
      .join('');
  }
  return textOf(data?.choices?.[0]?.message?.content);
}

function providerMessage(body: unknown): string {
  const data = body as Record<string, any> | null;
  const message = data?.error?.message ?? data?.message;
  return typeof message === 'string' ? message : '';
}

export function describeFailure(connection: AiConnection, status: number, body: unknown): string {
  const detail = providerMessage(body);
  const suffix = detail ? ` (${detail.slice(0, 160)})` : '';
  if (status === 401 || status === 403) {
    return connection.method === 'signin'
      ? `The sign-in was rejected. Sign in again in AI settings.${suffix}`
      : `The API key was rejected. Check it in AI settings.${suffix}`;
  }
  if (status === 402) return `The account is out of credits.${suffix}`;
  if (status === 404) return `The model "${connection.model}" was not found. Choose another in AI settings.${suffix}`;
  if (status === 429) return `The AI service is rate limiting this account. Try again shortly.${suffix}`;
  if (status >= 500) return `The AI service is having trouble (${status}). Try again shortly.`;
  return `The AI service refused the request (${status}).${suffix}`;
}

type Fetch = (url: string, init: AiHttpRequest['init'] & { signal?: AbortSignal }) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export async function callAi(
  connection: AiConnection,
  prompt: string,
  image: AiImage | null,
  options: { signal?: AbortSignal; fetchImpl?: Fetch } = {},
): Promise<string> {
  const request = buildRequest(connection, prompt, image);
  const send = options.fetchImpl ?? (fetch as unknown as Fetch);
  let response: Awaited<ReturnType<Fetch>>;
  try {
    response = await send(request.url, { ...request.init, signal: options.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Could not reach the AI service. Check your connection and try again.');
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new Error(describeFailure(connection, response.status, body));
  const text = extractText(connection, body);
  if (!text.trim()) throw new Error('The AI returned an empty answer.');
  return text;
}
