import { AiImage } from './types';

const MAX_SIDE = 1600;

/** Downscales a photo and returns it as base64 JPEG, which keeps uploads small and fast. Web only. */
export async function prepareImage(uri: string, maxSide = MAX_SIDE): Promise<AiImage> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    throw new Error('AI checking runs in the web app.');
  }
  const blob = await (await fetch(uri)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the photo.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  return { mime: 'image/jpeg', base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}
