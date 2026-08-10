export type RandomSource = {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  pickWeighted: <T>(items: readonly T[], getWeight: (item: T) => number) => T;
};

export function createRandomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  const next = (): number => {
    state += 0x6d2b79f5;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    const lowerBound = Math.ceil(Math.min(min, max));
    const upperBound = Math.floor(Math.max(min, max));

    if (lowerBound > upperBound) {
      throw new Error("Invalid random integer range.");
    }

    return Math.floor(next() * (upperBound - lowerBound + 1)) + lowerBound;
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array.");
    }

    return items[int(0, items.length - 1)];
  };

  const pickWeighted = <T>(
    items: readonly T[],
    getWeight: (item: T) => number,
  ): T => {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array.");
    }

    const totalWeight = items.reduce(
      (sum, item) => sum + Math.max(0, getWeight(item)),
      0,
    );

    if (totalWeight <= 0) {
      return pick(items);
    }

    let roll = next() * totalWeight;

    for (const item of items) {
      roll -= Math.max(0, getWeight(item));

      if (roll <= 0) {
        return item;
      }
    }

    return items[items.length - 1];
  };

  return {
    next,
    int,
    pick,
    pickWeighted,
  };
}
