export type Variant = 'plain' | 'sharp1' | 'sharp3' | 'sharp5' | 'sharpH' | 'sharpV';

function gaussianKernel(sigma: number): { kernel: Float32Array; radius: number } {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const value = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = value;
    sum += value;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;
  return { kernel, radius };
}

function convolve1d(
  src: Float32Array, size: number, kernel: Float32Array, radius: number, horizontal: boolean,
): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const px = horizontal ? Math.min(size - 1, Math.max(0, x + k)) : x;
        const py = horizontal ? y : Math.min(size - 1, Math.max(0, y + k));
        acc += src[py * size + px] * kernel[k + radius];
      }
      out[y * size + x] = acc;
    }
  }
  return out;
}

function splitPlanes(rgba: Uint8ClampedArray, size: number): Float32Array[] {
  const planes = [0, 1, 2].map(() => new Float32Array(size * size));
  for (let i = 0; i < size * size; i += 1) {
    planes[0][i] = rgba[i * 4];
    planes[1][i] = rgba[i * 4 + 1];
    planes[2][i] = rgba[i * 4 + 2];
  }
  return planes;
}

function joinPlanes(planes: Float32Array[], source: Uint8ClampedArray, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(source.length);
  for (let i = 0; i < size * size; i += 1) {
    out[i * 4] = planes[0][i];
    out[i * 4 + 1] = planes[1][i];
    out[i * 4 + 2] = planes[2][i];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** out = original + amount * (original - gaussianBlur(original, sigma)) */
export function unsharpMask(rgba: Uint8ClampedArray, size: number, sigma: number, amount: number): Uint8ClampedArray {
  const { kernel, radius } = gaussianKernel(sigma);
  const planes = splitPlanes(rgba, size).map((plane) => {
    const blurred = convolve1d(convolve1d(plane, size, kernel, radius, true), size, kernel, radius, false);
    const out = new Float32Array(plane.length);
    for (let i = 0; i < plane.length; i += 1) out[i] = plane[i] + amount * (plane[i] - blurred[i]);
    return out;
  });
  return joinPlanes(planes, rgba, size);
}

/** Sharpens along one axis only, which helps with motion blur. */
export function directionalSharpen(
  rgba: Uint8ClampedArray, size: number, horizontal: boolean, length: number, amount: number,
): Uint8ClampedArray {
  const kernel = new Float32Array(length).fill(1 / length);
  const radius = Math.floor(length / 2);
  const planes = splitPlanes(rgba, size).map((plane) => {
    const blurred = convolve1d(plane, size, kernel, radius, horizontal);
    const out = new Float32Array(plane.length);
    for (let i = 0; i < plane.length; i += 1) out[i] = plane[i] + amount * (plane[i] - blurred[i]);
    return out;
  });
  return joinPlanes(planes, rgba, size);
}

/** Per-channel histogram stretch that ignores the brightest and darkest `cutoff` fraction. */
export function autoContrast(rgba: Uint8ClampedArray, size: number, cutoff = 0.01): Uint8ClampedArray {
  const pixels = size * size;
  const out = new Uint8ClampedArray(rgba.length);
  for (let c = 0; c < 4; c += 1) {
    if (c === 3) {
      for (let i = 0; i < pixels; i += 1) out[i * 4 + 3] = 255;
      continue;
    }
    const histogram = new Uint32Array(256);
    for (let i = 0; i < pixels; i += 1) histogram[rgba[i * 4 + c]] += 1;
    const limit = pixels * cutoff;
    let low = 0;
    let acc = 0;
    while (low < 255 && acc + histogram[low] <= limit) acc += histogram[low++];
    let high = 255;
    acc = 0;
    while (high > low && acc + histogram[high] <= limit) acc += histogram[high--];
    const scale = high > low ? 255 / (high - low) : 1;
    for (let i = 0; i < pixels; i += 1) out[i * 4 + c] = (rgba[i * 4 + c] - low) * scale;
  }
  return out;
}

export function applyVariant(rgba: Uint8ClampedArray, size: number, variant: Variant): Uint8ClampedArray {
  switch (variant) {
    case 'plain':
      return rgba;
    case 'sharp1':
      return autoContrast(unsharpMask(rgba, size, 1.5, 3), size);
    case 'sharp3':
      return autoContrast(unsharpMask(rgba, size, 3, 5), size);
    case 'sharp5':
      return autoContrast(unsharpMask(rgba, size, 5, 7), size);
    case 'sharpH':
      return directionalSharpen(rgba, size, true, 7, 2);
    case 'sharpV':
      return directionalSharpen(rgba, size, false, 7, 2);
  }
}
