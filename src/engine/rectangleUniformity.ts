import type {
  RectangleGrid,
  RectangleGridStats,
  UniformityResult,
} from "../types/rectangleTypes";

const MIN_REGIONS_FOR_DIVERSITY_CHECK = 6;
const MAX_DOMINANT_AREA_RATIO = 0.7;

const MIN_ELONGATED_ASPECT_RATIO = 4;
const MAX_ELONGATED_RECTANGLE_RATIO = 0.3;

function calculateStats(
  grid: RectangleGrid,
  areas: number[],
): RectangleGridStats {
  const { regions } = grid;

  if (regions.length === 0) {
    return {
      regionCount: 0,
      minArea: 0,
      maxArea: 0,
      averageArea: 0,
      singleCellCount: 0,
      horizontalCount: 0,
      verticalCount: 0,
    };
  }

  const regionCount = regions.length;
  const totalArea = areas.reduce((sum, area) => sum + area, 0);

  let singleCellCount = 0;
  let horizontalCount = 0;
  let verticalCount = 0;

  for (const region of regions) {
    if (region.width === 1 && region.height === 1) {
      singleCellCount++;
    }

    if (region.width > region.height) {
      horizontalCount++;
    }

    if (region.height > region.width) {
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

export function analyzeRectangleGridUniformity(
  grid: RectangleGrid,
): UniformityResult {
  const { regions } = grid;

  const areas = regions.map((region) => region.width * region.height);

  const stats = calculateStats(grid, areas);

  if (regions.length === 0) {
    return {
      accepted: false,
      reason: "Aucun rectangle à analyser",
      stats,
    };
  }

  const areaOccurrences = new Map<number, number>();

  let elongatedRectangleCount = 0;

  for (let index = 0; index < regions.length; index++) {
    const region = regions[index];
    const area = areas[index];

    areaOccurrences.set(area, (areaOccurrences.get(area) ?? 0) + 1);

    const longestSide = Math.max(region.width, region.height);

    const shortestSide = Math.min(region.width, region.height);

    const aspectRatio =
      shortestSide > 0 ? longestSide / shortestSide : Number.POSITIVE_INFINITY;

    if (aspectRatio >= MIN_ELONGATED_ASPECT_RATIO) {
      elongatedRectangleCount++;
    }
  }

  /*
   * Vérifie qu'une même surface ne représente pas
   * une trop grande majorité des rectangles.
   */
  if (regions.length >= MIN_REGIONS_FOR_DIVERSITY_CHECK) {
    let dominantArea = 0;
    let dominantAreaCount = 0;

    for (const [area, count] of areaOccurrences) {
      if (count > dominantAreaCount) {
        dominantArea = area;
        dominantAreaCount = count;
      }
    }

    const dominantAreaRatio = dominantAreaCount / regions.length;

    if (dominantAreaRatio > MAX_DOMINANT_AREA_RATIO) {
      const dominantPercentage = Math.round(dominantAreaRatio * 100);

      return {
        accepted: false,
        reason:
          `Surface ${dominantArea} trop dominante : ` +
          `${dominantAreaCount}/${regions.length} rectangles ` +
          `(${dominantPercentage} %)`,
        stats,
      };
    }
  }

  /*
   * Un rectangle est considéré comme très allongé
   * lorsque son côté le plus long est au moins
   * quatre fois plus grand que son côté le plus court.
   */
  const elongatedRectangleRatio = elongatedRectangleCount / regions.length;

  if (elongatedRectangleRatio > MAX_ELONGATED_RECTANGLE_RATIO) {
    const elongatedPercentage = Math.round(elongatedRectangleRatio * 100);

    return {
      accepted: false,
      reason:
        `Trop de rectangles très allongés : ` +
        `${elongatedRectangleCount}/${regions.length} ` +
        `(${elongatedPercentage} %)`,
      stats,
    };
  }

  return {
    accepted: true,
    reason: null,
    stats,
  };
}
