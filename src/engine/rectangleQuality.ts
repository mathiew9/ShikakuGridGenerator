import { GRID_PRESETS } from "../config/gridPresets";
import type {
  GridSizePreset,
  RectangleQualityReport,
  RectangleRegion,
} from "../types/rectangleTypes";
import { getActiveAreaDistribution } from "./rectangleAreaDistribution";

function getArea(region: RectangleRegion): number {
  return region.width * region.height;
}

function buildAreaCounts(regions: RectangleRegion[]): Record<number, number> {
  const counts: Record<number, number> = {};

  for (const region of regions) {
    const area = getArea(region);
    counts[area] = (counts[area] ?? 0) + 1;
  }

  return counts;
}

function getDistributionDistance(
  areaCounts: Record<number, number>,
  regionCount: number,
  gridSize: GridSizePreset,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
): number {
  if (regionCount === 0) {
    return 1;
  }

  const targetDistribution = getActiveAreaDistribution(
    gridSize,
    maxRegionArea,
    allowSingleCellRegions,
  );

  const totalWeight = targetDistribution.reduce(
    (sum, item) => sum + item.weight,
    0,
  );

  if (totalWeight === 0) {
    return 0;
  }

  const targetAreas = new Set(targetDistribution.map((item) => item.area));

  const allAreas = new Set([
    ...targetAreas,
    ...Object.keys(areaCounts).map(Number),
  ]);

  let distance = 0;

  for (const area of allAreas) {
    const targetWeight =
      targetDistribution.find((item) => item.area === area)?.weight ?? 0;

    const targetRatio = targetWeight / totalWeight;
    const actualRatio = (areaCounts[area] ?? 0) / regionCount;

    distance += Math.abs(actualRatio - targetRatio);
  }

  return distance / 2;
}

export function analyzeRectangleQuality(
  regions: RectangleRegion[],
  gridSize: GridSizePreset,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
  generationDurationMs: number,
): RectangleQualityReport {
  const preset = GRID_PRESETS[gridSize];

  const hardFailures: string[] = [];
  const warnings: string[] = [];

  const areaCounts = buildAreaCounts(regions);
  const regionCount = regions.length;

  const bigRegionAreaStart = Math.max(4, Math.floor(maxRegionArea * 0.8));

  const bigRegionCount = regions.filter(
    (region) => getArea(region) >= bigRegionAreaStart,
  ).length;

  const veryLongRegionCount = regions.filter((region) => {
    const shortestSide = Math.min(region.width, region.height);
    const longestSide = Math.max(region.width, region.height);

    return longestSide >= 4 && longestSide / shortestSide >= 4;
  }).length;

  for (const region of regions) {
    const area = getArea(region);

    if (area > maxRegionArea) {
      hardFailures.push(
        `Rectangle d'aire ${area} supérieur au maximum actif (${maxRegionArea}).`,
      );
    }

    if (!allowSingleCellRegions && area === 1) {
      hardFailures.push(
        "Une région 1x1 est présente alors qu'elle est désactivée.",
      );
    }
  }

  if (regionCount < preset.minimumRegionCount) {
    warnings.push(
      `Seulement ${regionCount} régions, objectif minimum : ${preset.minimumRegionCount}.`,
    );
  }

  if (bigRegionCount > preset.maxBigRectangles) {
    warnings.push(
      `${bigRegionCount} gros rectangles, repère configuré : ${preset.maxBigRectangles}.`,
    );
  }

  const suggestedMaximumVeryLongRegions = Math.max(
    2,
    Math.ceil(regionCount * 0.2),
  );

  if (veryLongRegionCount > suggestedMaximumVeryLongRegions) {
    warnings.push(
      `${veryLongRegionCount} rectangles très allongés, repère conseillé : ${suggestedMaximumVeryLongRegions}.`,
    );
  }

  const distributionDistance = getDistributionDistance(
    areaCounts,
    regionCount,
    gridSize,
    maxRegionArea,
    allowSingleCellRegions,
  );

  if (distributionDistance > 0.45) {
    warnings.push("Répartition des aires éloignée de la distribution cible.");
  }

  const distributionScore = Math.max(0, 100 * (1 - distributionDistance));

  const countScore =
    regionCount >= preset.minimumRegionCount
      ? 100
      : Math.max(0, (regionCount / preset.minimumRegionCount) * 100);

  const bigRegionScore =
    bigRegionCount <= preset.maxBigRectangles
      ? 100
      : Math.max(
          0,
          100 -
            (bigRegionCount - preset.maxBigRectangles) *
              (100 / Math.max(1, preset.maxBigRectangles)),
        );

  const veryLongRegionScore =
    veryLongRegionCount <= suggestedMaximumVeryLongRegions
      ? 100
      : Math.max(
          0,
          100 - (veryLongRegionCount - suggestedMaximumVeryLongRegions) * 15,
        );

  const score = Math.round(
    distributionScore * 0.5 +
      countScore * 0.2 +
      bigRegionScore * 0.15 +
      veryLongRegionScore * 0.15,
  );

  return {
    accepted: hardFailures.length === 0,
    score,
    hardFailures,
    warnings,
    areaCounts,
    distributionDistance,
    regionCount,
    bigRegionCount,
    veryLongRegionCount,
    generationDurationMs,
  };
}
