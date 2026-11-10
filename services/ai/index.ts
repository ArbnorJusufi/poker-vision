import { AiReading, buildPrompt, parseAiReading } from './cards';
import { callAi } from './http';
import { prepareImage } from './image';
import { AiConnection, AiRequest } from './types';

export type { AiReading } from './cards';

/** Asks the connected AI to read the cards in a photo. */
export async function readCardsWithAi(
  connection: AiConnection,
  photoUri: string,
  request: AiRequest,
  signal?: AbortSignal,
): Promise<AiReading> {
  const image = await prepareImage(photoUri);
  const text = await callAi(connection, buildPrompt(request), image, { signal });
  return parseAiReading(text, request);
}

/** Cheap request used by "Test connection": no photo, only checks the key and model. */
export async function testConnection(connection: AiConnection): Promise<void> {
  await callAi(connection, 'Reply with the single word: ready', null);
}
