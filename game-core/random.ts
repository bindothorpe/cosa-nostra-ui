export interface Rng {
  state: number;
}

export function createSeed(): number {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    cryptoObject.getRandomValues(buffer);
    return buffer[0] >>> 0;
  }

  const clock = Date.now();
  return ((clock ^ (clock * 2654435761)) >>> 0) || 1;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

export function nextRandom(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let value = rng.state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

export function pickRandom<T>(rng: Rng, values: readonly T[]): T | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values[Math.floor(nextRandom(rng) * values.length)];
}

export function shuffle<T>(rng: Rng, values: readonly T[]): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom(rng) * (index + 1));
    const current = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = current;
  }

  return result;
}
