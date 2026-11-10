export type AiProvider = 'openrouter' | 'anthropic' | 'openai' | 'gemini';

export interface AiConnection {
  provider: AiProvider;
  apiKey: string;
  model: string;
  /** `signin` keys are issued by an OAuth sign-in, `key` ones are pasted by the user. */
  method: 'signin' | 'key';
}

export interface ProviderInfo {
  label: string;
  /** Where the user creates a key. */
  keyUrl: string;
  keyPlaceholder: string;
  defaultModel: string;
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  openrouter: {
    label: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
    defaultModel: 'anthropic/claude-sonnet-5.5',
  },
  anthropic: {
    label: 'Claude',
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    defaultModel: 'claude-sonnet-5-5',
  },
  openai: {
    label: 'ChatGPT / OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    defaultModel: 'gpt-6.1-sol',
  },
  gemini: {
    label: 'Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    defaultModel: 'gemini-4-carbon',
  },
};

export const KEY_PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini'];

export type AiRequest = { kind: 'cards'; expected: number } | { kind: 'table' };

export interface AiImage {
  mime: string;
  base64: string;
}
