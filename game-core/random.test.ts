import { describe, expect, it } from "vitest";
import { createRng, createSeed, nextRandom, pickRandom, shuffle } from "./index";

function sequence(seed: number, length: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length }, () => nextRandom(rng));
}

describe("seeded RNG", () => {
  it("produces the same sequence for the same seed", () => {
    expect(sequence(12345, 20)).toEqual(sequence(12345, 20));
  });

  it("produces a different sequence for a different seed", () => {
    expect(sequence(12345, 20)).not.toEqual(sequence(54321, 20));
  });

  it("returns values in the half-open range [0, 1)", () => {
    const rng = createRng(7);
    for (let index = 0; index < 200; index += 1) {
      const value = nextRandom(rng);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("advances the stored state deterministically", () => {
    const first = createRng(99);
    const second = createRng(99);
    nextRandom(first);
    nextRandom(second);
    expect(first.state).toBe(second.state);
  });

  it("picks deterministically from a list", () => {
    const values = ["a", "b", "c", "d", "e"];
    const first = createRng(2024);
    const second = createRng(2024);
    expect(pickRandom(first, values)).toBe(pickRandom(second, values));
    expect(pickRandom(createRng(1), [])).toBeUndefined();
  });

  it("shuffles deterministically and preserves the items", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const first = shuffle(createRng(555), values);
    const second = shuffle(createRng(555), values);

    expect(first).toEqual(second);
    expect([...first].sort((a, b) => a - b)).toEqual(values);
    expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("creates a usable 32-bit seed", () => {
    const seed = createSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});
