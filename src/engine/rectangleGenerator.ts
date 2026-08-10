import type {
  GridSizePreset,
  RectangleClue,
  RectangleGrid,
  RectangleGridStats,
  RectangleRegion,
} from "../types/rectangleTypes";
import { generatePartitionRegions } from "./rectanglePartitionGenerator";
import { analyzeRectangleQuality } from "./rectangleQuality";
import { createRandomSeed, createSeededRandom } from "./seededRandom";

function isGridSizePreset(value: number): value is GridSizePreset {
  return (
    value === 5 || value === 10 || value === 15 || value === 20 || value === 25
  );
}

function getRegionCells(
  region: RectangleRegion,
): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];

  for (let row = region.row; row < region.row + region.height; row++) {
    for (let col = region.col; col < region.col + region.width; col++) {
      cells.push({ row, col });
    }
  }

  return cells;
}

function buildCluesFromRegions(
  regions: RectangleRegion[],
  random: ReturnType<typeof createSeededRandom>,
): RectangleClue[] {
  return regions.map((region) => {
    const cells = getRegionCells(region);
    const clueCell = random.pick(cells);

    return {
      row: clueCell.row,
      col: clueCell.col,
      value: region.width * region.height,
    };
  });
}

function buildStats(regions: RectangleRegion[]): RectangleGridStats {
  const areas = regions.map((region) => region.width * region.height);
  const regionCount = regions.length;
  const totalArea = areas.reduce((sum, area) => sum + area, 0);

  let singleCellCount = 0;
  let horizontalCount = 0;
  let verticalCount = 0;

  for (const region of regions) {
    const isSingleCell = region.width === 1 && region.height === 1;
    const isHorizontal = region.width > region.height;
    const isVertical = region.height > region.width;

    if (isSingleCell) {
      singleCellCount++;
    }

    if (isHorizontal) {
      horizontalCount++;
    }

    if (isVertical) {
      verticalCount++;
    }
  }

  return {
    regionCount,
    minArea: Math.min(...areas),
    maxArea: Math.max(...areas),
    averageArea: totalArea / regionCount,
    singleCellCount,
    horizontalCount,
    verticalCount,
  };
}

function generateGridId(rows: number, cols: number, seed: number): string {
  return `${rows}x${cols}-${seed.toString(36)}`;
}

function normalizeRegionIds(regions: RectangleRegion[]): RectangleRegion[] {
  return regions.map((region, index) => ({
    ...region,
    id: index,
  }));
}

export function generateRectangleGrid(
  rows: number,
  cols: number,
  maxRegionArea: number,
  allowSingleCellRegions: boolean,
  minimumTargetRegionCount: number,
  maximumTargetRegionCount: number,
  seed = createRandomSeed(),
): RectangleGrid | null {
  if (rows !== cols || !isGridSizePreset(rows)) {
    return null;
  }

  const minimumAllowedArea = allowSingleCellRegions ? 1 : 2;

  if (maxRegionArea < minimumAllowedArea) {
    return null;
  }

  if (
    !Number.isInteger(minimumTargetRegionCount) ||
    !Number.isInteger(maximumTargetRegionCount) ||
    minimumTargetRegionCount < 1 ||
    maximumTargetRegionCount < minimumTargetRegionCount
  ) {
    return null;
  }

  const gridSize = rows;
  const random = createSeededRandom(seed);
  const startedAt = Date.now();

  const generatedRegions = generatePartitionRegions(
    rows,
    cols,
    gridSize,
    maxRegionArea,
    allowSingleCellRegions,
    random,
    minimumTargetRegionCount,
    maximumTargetRegionCount,
  );

  if (!generatedRegions || generatedRegions.length === 0) {
    return null;
  }

  const regions = normalizeRegionIds(generatedRegions);
  const actualRegionCount = regions.length;

  const generationDurationMs = Date.now() - startedAt;

  const quality = analyzeRectangleQuality(
    regions,
    gridSize,
    maxRegionArea,
    allowSingleCellRegions,
    generationDurationMs,
  );

  if (!quality.accepted) {
    return null;
  }

  return {
    id: generateGridId(rows, cols, seed),
    rows,
    cols,
    seed,
    targetRegionCount: actualRegionCount,
    clues: buildCluesFromRegions(regions, random),
    regions,
    stats: buildStats(regions),
    quality,
  };
}
