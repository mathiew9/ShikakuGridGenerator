import { GRID_PRESETS } from "../config/gridPresets";
import type { GridSizePreset } from "../types/rectangleTypes";
import type { RandomSource } from "./seededRandom";

type AreaDistributionItem = {
  area: number;
  weight: number;
};

export function getActiveAreaDistribution(
  gridSize: GridSizePreset,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
): AreaDistributionItem[] {
  return GRID_PRESETS[gridSize].targetAreaDistribution.filter(
    (item) =>
      item.weight > 0 &&
      item.area <= maxRegionArea &&
      (allowSingleCellRegions || item.area !== 1),
  );
}

export function getAreaWeight(
  gridSize: GridSizePreset,
  area: number,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
): number {
  const item = getActiveAreaDistribution(
    gridSize,
    maxRegionArea,
    allowSingleCellRegions,
  ).find((distributionItem) => distributionItem.area === area);

  return item?.weight ?? 0.25;
}

export function getMaximumAreaWeight(
  gridSize: GridSizePreset,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
): number {
  const distribution = getActiveAreaDistribution(
    gridSize,
    maxRegionArea,
    allowSingleCellRegions,
  );

  return Math.max(1, ...distribution.map((item) => item.weight));
}

export function getWeightedAverageArea(
  gridSize: GridSizePreset,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
): number {
  const distribution = getActiveAreaDistribution(
    gridSize,
    maxRegionArea,
    allowSingleCellRegions,
  );

  const totalWeight = distribution.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight === 0) {
    return allowSingleCellRegions ? 1 : 2;
  }

  return (
    distribution.reduce((sum, item) => sum + item.area * item.weight, 0) /
    totalWeight
  );
}

export function pickTargetArea(
  random: RandomSource,
  gridSize: GridSizePreset,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
): number | null {
  const distribution = getActiveAreaDistribution(
    gridSize,
    maxRegionArea,
    allowSingleCellRegions,
  );

  if (distribution.length === 0) {
    return null;
  }

  return random.pickWeighted(distribution, (item) => item.weight).area;
}
