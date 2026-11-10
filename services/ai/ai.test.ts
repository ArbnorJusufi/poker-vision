import { describe, expect, it } from 'vitest';
import { compareGroup, compareTable, usableTable } from './agreement';
import { buildPrompt, parseAiReading, parseCardText } from './cards';
import { buildRequest, callAi, describeFailure, extractText } from './http';
import { parseConnection } from './storage';
import { authorizeUrl, createPkcePair } from './openRouterAuth';
import { AiConnection } from './types';

const connection = (provider: AiConnection['provider'], method: AiConnection['method'] = 'key'): AiConnection => ({
  provider, apiKey: 'secret-key', model: 'model-x', method,
});
const image = { mime: 'image/jpeg', base64: 'AAAA' };

describe('parseCardText', () => {
  it('reads the common spellings of a card', () => {
    expect(parseCardText('AS')).toEqual({ rank: 'A', suit: 'spades' });
    expect(parseCardText('10h')).toEqual({ rank: '10', suit: 'hearts' });
    expect(parseCardText('Td')).toEqual({ rank: '10', suit: 'diamonds' });
    expect(parseCardText('K♣')).toEqual({ rank: 'K', suit: 'clubs' });
    expect(parseCardText('ten of Hearts')).toEqual({ rank: '10', suit: 'hearts' });
    expect(parseCardText(' 9 s ')).toEqual({ rank: '9', suit: 'spades' });
  });

  it('rejects anything that is not a card', () => {
    expect(parseCardText(null)).toBeNull();
    expect(parseCardText('1S')).toBeNull();
    expect(parseCardText('AX')).toBeNull();
    expect(parseCardText(7)).toBeNull();
  });
});

describe('parseAiReading', () => {
  it('reads a hand even when the model wraps the JSON in prose or fences', () => {
    const text = 'Sure!\n```json\n{"cards": ["AS", "10H"]}\n```';
    const reading = parseAiReading(text, { kind: 'cards', expected: 2 });
    expect(reading.cards).toHaveLength(2);
    expect(reading.unreadable).toBe(0);
  });

  it('counts unreadable cards instead of inventing them', () => {
    const reading = parseAiReading('{"cards": ["AS", null, "zz"]}', { kind: 'cards', expected: 3 });
    expect(reading.cards).toEqual([{ rank: 'A', suit: 'spades' }]);
    expect(reading.unreadable).toBe(2);
  });

  it('reads a whole table', () => {
    const text = '{"board":["AC","10H","5S","9H","9S"],"players":[["10C","9C"],["5H","5D"],["AH","KS"]]}';
    const reading = parseAiReading(text, { kind: 'table' });
    expect(reading.cards).toHaveLength(5);
    expect(reading.players).toHaveLength(3);
    expect(reading.players[2]).toEqual([{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'spades' }]);
  });

  it('fails clearly when there is no JSON', () => {
    expect(() => parseAiReading('I cannot see any cards', { kind: 'table' })).toThrow('did not return a card list');
  });

  it('asks for the right shape', () => {
    expect(buildPrompt({ kind: 'cards', expected: 2 })).toContain('2 playing cards');
    expect(buildPrompt({ kind: 'table' })).toContain('clockwise');
  });
});

describe('buildRequest', () => {
  it('sends Claude the image and key in Anthropic format', () => {
    const request = buildRequest(connection('anthropic'), 'read', image);
    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.init.headers['x-api-key']).toBe('secret-key');
    expect(request.init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(request.init.body);
    expect(body.model).toBe('model-x');
    expect(body.messages[0].content[0]).toEqual({
      type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' },
    });
  });

  it('sends Gemini the key in a header, never in the URL', () => {
    const request = buildRequest(connection('gemini'), 'read', image);
    expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/model-x:generateContent');
    expect(request.url).not.toContain('secret-key');
    expect(request.init.headers['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(request.init.body).contents[0].parts[1]).toEqual({ inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } });
  });

  it('uses chat completions for OpenAI and OpenRouter', () => {
    const openai = buildRequest(connection('openai'), 'read', image);
    expect(openai.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(openai.init.headers.authorization).toBe('Bearer secret-key');
    expect(JSON.parse(openai.init.body).messages[0].content[1].image_url.url).toBe('data:image/jpeg;base64,AAAA');
    expect(buildRequest(connection('openrouter'), 'read', null).url).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('omits the image for a connection test', () => {
    const body = JSON.parse(buildRequest(connection('openai'), 'ping', null).init.body);
    expect(body.messages[0].content).toHaveLength(1);
  });
});

describe('extractText', () => {
  it('reads each provider response shape', () => {
    expect(extractText(connection('anthropic'), { content: [{ type: 'text', text: 'hi' }] })).toBe('hi');
    expect(extractText(connection('gemini'), { candidates: [{ content: { parts: [{ text: 'hi' }] } }] })).toBe('hi');
    expect(extractText(connection('openai'), { choices: [{ message: { content: 'hi' } }] })).toBe('hi');
    expect(extractText(connection('openrouter'), { choices: [{ message: { content: [{ type: 'text', text: 'hi' }] } }] })).toBe('hi');
    expect(extractText(connection('openai'), {})).toBe('');
  });
});

describe('callAi', () => {
  const reply = (status: number, body: unknown) => async () => ({ ok: status < 400, status, json: async () => body });

  it('returns the model text', async () => {
    const text = await callAi(connection('openai'), 'p', image, {
      fetchImpl: reply(200, { choices: [{ message: { content: '{"cards":[]}' } }] }),
    });
    expect(text).toBe('{"cards":[]}');
  });

  it('explains common failures without exposing the key', async () => {
    await expect(callAi(connection('anthropic'), 'p', image, { fetchImpl: reply(401, { error: { message: 'bad' } }) }))
      .rejects.toThrow('API key was rejected');
    await expect(callAi(connection('openrouter', 'signin'), 'p', image, { fetchImpl: reply(402, {}) }))
      .rejects.toThrow('out of credits');
    await expect(callAi(connection('gemini'), 'p', image, { fetchImpl: reply(404, {}) }))
      .rejects.toThrow('"model-x" was not found');
    await expect(callAi(connection('openai'), 'p', image, { fetchImpl: reply(429, {}) })).rejects.toThrow('rate limiting');
    const failure = describeFailure(connection('openai'), 401, { error: { message: 'x' } });
    expect(failure).not.toContain('secret-key');
  });

  it('reports a network failure and an empty answer', async () => {
    const offline = async () => { throw new TypeError('Failed to fetch'); };
    await expect(callAi(connection('openai'), 'p', image, { fetchImpl: offline })).rejects.toThrow('Could not reach');
    await expect(callAi(connection('openai'), 'p', image, { fetchImpl: reply(200, { choices: [] }) })).rejects.toThrow('empty');
  });

  it('lets an abort through unchanged', async () => {
    const aborted = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    await expect(callAi(connection('openai'), 'p', image, { fetchImpl: aborted })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('agreement', () => {
  const c = (code: string) => parseCardText(code)!;

  it('ignores card order within a group', () => {
    expect(compareGroup([c('AS'), c('KD')], [c('KD'), c('AS')]).agree).toBe(true);
    expect(compareGroup([c('AS'), c('KD')], [c('AS'), c('QD')]).summary).toContain('Q♦');
  });

  it('counts agreeing groups and handles different player counts', () => {
    const mine = [[c('AS')], [c('2C'), c('3C')]];
    expect(compareTable(mine, [[c('AS')], [c('2C'), c('3C')]]).agree).toBe(true);
    const result = compareTable(mine, [[c('AS')], [c('2C'), c('4C')], [c('5D'), c('6D')]]);
    expect(result).toMatchObject({ agreeing: 1, total: 3, agree: false });
  });

  it('matches hands whatever order the players are listed in', () => {
    const mine = [[c('AS')], [c('2C'), c('3C')], [c('KD'), c('KH')]];
    const ai = [[c('AS')], [c('KH'), c('KD')], [c('3C'), c('2C')]];
    expect(compareTable(mine, ai)).toMatchObject({ agreeing: 3, total: 3, agree: true });
  });

  it('only accepts a complete table without repeated cards', () => {
    const board = ['AS', 'KS', 'QS', 'JS', '9S'].map(c);
    expect(usableTable([board, [c('2C'), c('3C')]])).toBe(true);
    expect(usableTable([board, [c('2C')]])).toBe(false);
    expect(usableTable([board, [c('AS'), c('3C')]])).toBe(false);
    expect(usableTable([board])).toBe(false);
  });
});

describe('connection storage and sign-in', () => {
  it('ignores a corrupt or incomplete stored connection', () => {
    expect(parseConnection(null)).toBeNull();
    expect(parseConnection('not json')).toBeNull();
    expect(parseConnection('{"provider":"nope","apiKey":"k"}')).toBeNull();
    expect(parseConnection('{"provider":"gemini"}')).toBeNull();
  });

  it('fills in the default model', () => {
    expect(parseConnection('{"provider":"gemini","apiKey":"k"}')).toEqual({
      provider: 'gemini', apiKey: 'k', model: 'gemini-4-carbon', method: 'key',
    });
  });

  it('builds a PKCE authorize link', async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).not.toBe(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    const url = new URL(authorizeUrl('https://app.example/', challenge));
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth');
    expect(url.searchParams.get('callback_url')).toBe('https://app.example/');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
