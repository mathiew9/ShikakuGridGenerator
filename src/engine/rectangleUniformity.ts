import type {
  RectangleGrid,
  RectangleGridStats,
  UniformityResult,
  RectangleRegion,
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

function getMaximumAllowedDominoRun(gridSize: number): number {
  switch (gridSize) {
    case 5:
      return 3;

    case 10:
      return 4;

    case 15:
      return 5;

    case 20:
      return 5;

    case 25:
      return 5;

    default:
      return 5;
  }
}

function isVerticalDomino(region: RectangleRegion): boolean {
  return region.width === 1 && region.height === 2;
}

function isHorizontalDomino(region: RectangleRegion): boolean {
  return region.width === 2 && region.height === 1;
}

function getMaximumHorizontalRunOfVerticalDominoes(
  grid: RectangleGrid,
): number {
  const dominoes = grid.regions
    .filter(isVerticalDomino)
    .sort((first, second) => {
      if (first.row !== second.row) {
        return first.row - second.row;
      }

      return first.col - second.col;
    });

  let maximumRun = 0;

  for (const startDomino of dominoes) {
    let currentRun = 1;
    let currentCol = startDomino.col;

    while (true) {
      const nextDomino = dominoes.find(
        (region) =>
          region.row === startDomino.row && region.col === currentCol + 1,
      );

      if (!nextDomino) {
        break;
      }

      currentRun++;
      currentCol = nextDomino.col;
    }

    maximumRun = Math.max(maximumRun, currentRun);
  }

  return maximumRun;
}

function getMaximumVerticalRunOfHorizontalDominoes(
  grid: RectangleGrid,
): number {
  const dominoes = grid.regions
    .filter(isHorizontalDomino)
    .sort((first, second) => {
      if (first.col !== second.col) {
        return first.col - second.col;
      }

      return first.row - second.row;
    });

  let maximumRun = 0;

  for (const startDomino of dominoes) {
    let currentRun = 1;
    let currentRow = startDomino.row;

    while (true) {
      const nextDomino = dominoes.find(
        (region) =>
          region.col === startDomino.col && region.row === currentRow + 1,
      );

      if (!nextDomino) {
        break;
      }

      currentRun++;
      currentRow = nextDomino.row;
    }

    maximumRun = Math.max(maximumRun, currentRun);
  }

  return maximumRun;
}

function validateDominoRepetition(grid: RectangleGrid): string | null {
  const maximumAllowedRun = getMaximumAllowedDominoRun(grid.rows);

  const verticalDominoRun = getMaximumHorizontalRunOfVerticalDominoes(grid);

  if (verticalDominoRun > maximumAllowedRun) {
    return (
      `${verticalDominoRun} rectangles 1×2 ` +
      `consécutifs détectés ` +
      `(maximum autorisé : ${maximumAllowedRun})`
    );
  }

  const horizontalDominoRun = getMaximumVerticalRunOfHorizontalDominoes(grid);

  if (horizontalDominoRun > maximumAllowedRun) {
    return (
      `${horizontalDominoRun} rectangles 2×1 ` +
      `consécutifs détectés ` +
      `(maximum autorisé : ${maximumAllowedRun})`
    );
  }

  return null;
}

export function analyzeRectangleGridUniformity(
  grid: RectangleGrid,
): UniformityResult {
  const { regions } = grid;

  const areas = regions.map((region) => region.width * region.height);

  const stats = calculateStats(grid, areas);

  const dominoRepetitionReason = validateDominoRepetition(grid);

  if (dominoRepetitionReason) {
    return {
      accepted: false,
      reason: dominoRepetitionReason,
      stats,
    };
  }

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
