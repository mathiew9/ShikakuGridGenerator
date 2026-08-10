import type { GridSizePreset } from "../types/rectangleTypes";

export type AreaDistributionItem = {
  area: number;
  weight: number;
};

export type DistributionConfig = {
  minArea: number;

  sweetSpotStart: number;
  sweetSpotEnd: number;

  mediumEnd: number;
  rareEnd: number;

  singleCellWeight: number;
  sweetWeight: number;
  mediumWeight: number;
  rareWeight: number;
  veryRareWeight: number;
};

export type GridPreset = {
  size: GridSizePreset;
  label: string;

  defaultMinimumRegionCount: number;
  defaultMaximumRegionCount: number;

  sliderMaxTargetRegionCount: number;
  defaultMaxRegionArea: number;
  sliderMaxRegionArea: number;
  targetAreaDistribution: AreaDistributionItem[];
  minimumRegionCount: number;
  maxBigRectangles: number;
};

function buildAreaDistribution(
  maxArea: number,
  config: DistributionConfig,
): AreaDistributionItem[] {
  const distribution: AreaDistributionItem[] = [];

  for (let area = config.minArea; area <= maxArea; area++) {
    let weight = config.veryRareWeight;

    if (area === 1) {
      weight = config.singleCellWeight;
    } else if (area >= config.sweetSpotStart && area <= config.sweetSpotEnd) {
      weight = config.sweetWeight;
    } else if (area <= config.mediumEnd) {
      weight = config.mediumWeight;
    } else if (area <= config.rareEnd) {
      weight = config.rareWeight;
    }

    distribution.push({ area, weight });
  }

  return distribution;
}

export const GRID_PRESETS: Record<GridSizePreset, GridPreset> = {
  5: {
    size: 5,
    label: "5x5",
    defaultMinimumRegionCount: 9,
    defaultMaximumRegionCount: 10,
    sliderMaxTargetRegionCount: 14,
    defaultMaxRegionArea: 6,
    sliderMaxRegionArea: 8,
    targetAreaDistribution: buildAreaDistribution(6, {
      minArea: 1,
      sweetSpotStart: 2,
      sweetSpotEnd: 3,
      mediumEnd: 4,
      rareEnd: 5,
      singleCellWeight: 1,
      sweetWeight: 60,
      mediumWeight: 30,
      rareWeight: 3,
      veryRareWeight: 1,
    }),
    minimumRegionCount: 7,
    maxBigRectangles: 1,
  },

  10: {
    size: 10,
    label: "10x10",
    defaultMinimumRegionCount: 20,
    defaultMaximumRegionCount: 25,
    sliderMaxTargetRegionCount: 28,
    defaultMaxRegionArea: 18,
    sliderMaxRegionArea: 25,
    targetAreaDistribution: buildAreaDistribution(18, {
      minArea: 1,
      sweetSpotStart: 3,
      sweetSpotEnd: 6,
      mediumEnd: 10,
      rareEnd: 15,
      singleCellWeight: 1,
      sweetWeight: 35,
      mediumWeight: 18,
      rareWeight: 7,
      veryRareWeight: 3,
    }),
    minimumRegionCount: 12,
    maxBigRectangles: 2,
  },

  15: {
    size: 15,
    label: "15x15",
    defaultMinimumRegionCount: 30,
    defaultMaximumRegionCount: 44,
    sliderMaxTargetRegionCount: 50,
    defaultMaxRegionArea: 36,
    sliderMaxRegionArea: 48,
    targetAreaDistribution: buildAreaDistribution(36, {
      minArea: 1,
      sweetSpotStart: 4,
      sweetSpotEnd: 8,
      mediumEnd: 16,
      rareEnd: 24,
      singleCellWeight: 1,
      sweetWeight: 32,
      mediumWeight: 18,
      rareWeight: 7,
      veryRareWeight: 3,
    }),
    minimumRegionCount: 22,
    maxBigRectangles: 3,
  },

  20: {
    size: 20,
    label: "20x20",
    defaultMinimumRegionCount: 44,
    defaultMaximumRegionCount: 56,
    sliderMaxTargetRegionCount: 78,
    defaultMaxRegionArea: 60,
    sliderMaxRegionArea: 72,
    targetAreaDistribution: buildAreaDistribution(60, {
      minArea: 1,
      sweetSpotStart: 4,
      sweetSpotEnd: 10,
      mediumEnd: 22,
      rareEnd: 36,
      singleCellWeight: 1,
      sweetWeight: 30,
      mediumWeight: 18,
      rareWeight: 8,
      veryRareWeight: 3,
    }),
    minimumRegionCount: 35,
    maxBigRectangles: 4,
  },

  25: {
    size: 25,
    label: "25x25",
    defaultMinimumRegionCount: 80,
    defaultMaximumRegionCount: 85,
    sliderMaxTargetRegionCount: 110,
    defaultMaxRegionArea: 84,
    sliderMaxRegionArea: 100,
    targetAreaDistribution: buildAreaDistribution(84, {
      minArea: 1,
      sweetSpotStart: 5,
      sweetSpotEnd: 12,
      mediumEnd: 28,
      rareEnd: 50,
      singleCellWeight: 1,
      sweetWeight: 28,
      mediumWeight: 18,
      rareWeight: 8,
      veryRareWeight: 4,
    }),
    minimumRegionCount: 50,
    maxBigRectangles: 5,
  },
};
export const GRID_SIZE_OPTIONS = Object.values(GRID_PRESETS);
