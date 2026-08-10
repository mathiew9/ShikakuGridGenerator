import type {
  RectangleClue,
  RectangleGrid,
  RectangleRegion,
} from "../types/rectangleTypes";

export type RectanglePlacement = {
  clueIndex: number;
  row: number;
  col: number;
  width: number;
  height: number;
  cells: number[];
};

export type RectangleSolverOptions = {
  maxSolutions?: 1 | 2;
  maxNodes?: number;
  timeLimitMs?: number;
};

export type RectangleSolverResult = {
  solutionCount: 0 | 1 | 2;
  isUnique: boolean;
  isUnsolvable: boolean;
  limitReached: boolean;
  visitedNodes: number;
  invalidReason: string | null;
};

export type AlternativeRectangleSolverResult = {
  targetSolution: RectanglePlacement[] | null;
  alternativeSolution: RectanglePlacement[] | null;
  isUnique: boolean;
  limitReached: boolean;
  visitedNodes: number;
  invalidReason: string | null;
};

type BacktrackingResult = {
  visitedNodes: number;
  limitReached: boolean;
};

const DEFAULT_MAX_SOLUTIONS = 2;
const DEFAULT_MAX_NODES = 500_000;
const DEFAULT_TIME_LIMIT_MS = 3_000;

function createPlacementKey(
  placement: Pick<RectanglePlacement, "row" | "col" | "width" | "height">,
): string {
  return [placement.row, placement.col, placement.width, placement.height].join(
    ":",
  );
}

function getRectangleDimensions(
  area: number,
): Array<{ width: number; height: number }> {
  const dimensions: Array<{
    width: number;
    height: number;
  }> = [];

  const seenDimensions = new Set<string>();

  for (let divisor = 1; divisor * divisor <= area; divisor++) {
    if (area % divisor !== 0) {
      continue;
    }

    const otherDivisor = area / divisor;

    const possibilities = [
      {
        width: divisor,
        height: otherDivisor,
      },
      {
        width: otherDivisor,
        height: divisor,
      },
    ];

    for (const possibility of possibilities) {
      const key = `${possibility.width}x${possibility.height}`;

      if (seenDimensions.has(key)) {
        continue;
      }

      seenDimensions.add(key);
      dimensions.push(possibility);
    }
  }

  return dimensions;
}

function createPlacementCells(
  row: number,
  col: number,
  width: number,
  height: number,
  cols: number,
): number[] {
  const cells: number[] = [];

  for (let currentRow = row; currentRow < row + height; currentRow++) {
    for (let currentCol = col; currentCol < col + width; currentCol++) {
      cells.push(currentRow * cols + currentCol);
    }
  }

  return cells;
}

function placementContainsPosition(
  placement: Pick<RectanglePlacement, "row" | "col" | "width" | "height">,
  row: number,
  col: number,
): boolean {
  return (
    row >= placement.row &&
    row < placement.row + placement.height &&
    col >= placement.col &&
    col < placement.col + placement.width
  );
}

function containsAnotherClue(
  clues: RectangleClue[],
  currentClueIndex: number,
  row: number,
  col: number,
  width: number,
  height: number,
): boolean {
  const placement = {
    row,
    col,
    width,
    height,
  };

  for (let clueIndex = 0; clueIndex < clues.length; clueIndex++) {
    if (clueIndex === currentClueIndex) {
      continue;
    }

    const clue = clues[clueIndex];

    if (placementContainsPosition(placement, clue.row, clue.col)) {
      return true;
    }
  }

  return false;
}

function validateSolverInput(grid: RectangleGrid): string | null {
  const { rows, cols, clues } = grid;

  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows <= 0 ||
    cols <= 0
  ) {
    return "Dimensions de grille invalides";
  }

  if (!Array.isArray(clues) || clues.length === 0) {
    return "La grille ne contient aucun indice";
  }

  const occupiedClueCells = new Set<string>();
  let clueAreaTotal = 0;

  for (const clue of clues) {
    if (
      !Number.isInteger(clue.row) ||
      !Number.isInteger(clue.col) ||
      clue.row < 0 ||
      clue.row >= rows ||
      clue.col < 0 ||
      clue.col >= cols
    ) {
      return "Un indice possède des coordonnées invalides";
    }

    if (!Number.isInteger(clue.value) || clue.value <= 0) {
      return "Un indice possède une valeur invalide";
    }

    const positionKey = `${clue.row}:${clue.col}`;

    if (occupiedClueCells.has(positionKey)) {
      return "Plusieurs indices occupent la même case";
    }

    occupiedClueCells.add(positionKey);
    clueAreaTotal += clue.value;
  }

  if (clueAreaTotal !== rows * cols) {
    return (
      `La somme des indices est incorrecte : ` +
      `${clueAreaTotal}/${rows * cols}`
    );
  }

  return null;
}

function createCandidatesForClue(
  rows: number,
  cols: number,
  clues: RectangleClue[],
  clueIndex: number,
): RectanglePlacement[] {
  const clue = clues[clueIndex];
  const candidates: RectanglePlacement[] = [];
  const candidateKeys = new Set<string>();

  const dimensions = getRectangleDimensions(clue.value);

  for (const { width, height } of dimensions) {
    if (width > cols || height > rows) {
      continue;
    }

    const minimumRow = Math.max(0, clue.row - height + 1);

    const maximumRow = Math.min(clue.row, rows - height);

    const minimumCol = Math.max(0, clue.col - width + 1);

    const maximumCol = Math.min(clue.col, cols - width);

    for (let row = minimumRow; row <= maximumRow; row++) {
      for (let col = minimumCol; col <= maximumCol; col++) {
        if (containsAnotherClue(clues, clueIndex, row, col, width, height)) {
          continue;
        }

        const candidateKey = [row, col, width, height].join(":");

        if (candidateKeys.has(candidateKey)) {
          continue;
        }

        candidateKeys.add(candidateKey);

        candidates.push({
          clueIndex,
          row,
          col,
          width,
          height,
          cells: createPlacementCells(row, col, width, height, cols),
        });
      }
    }
  }

  return candidates;
}

function createCandidatesByClue(grid: RectangleGrid): RectanglePlacement[][] {
  return grid.clues.map((_, clueIndex) =>
    createCandidatesForClue(grid.rows, grid.cols, grid.clues, clueIndex),
  );
}

function createTargetSolution(grid: RectangleGrid):
  | {
      targetSolution: RectanglePlacement[];
      invalidReason: null;
    }
  | {
      targetSolution: null;
      invalidReason: string;
    } {
  if (!Array.isArray(grid.regions) || grid.regions.length === 0) {
    return {
      targetSolution: null,
      invalidReason: "La grille ne possède aucune région de référence",
    };
  }

  const coverage = new Int32Array(grid.rows * grid.cols);

  coverage.fill(-1);

  const targetSolution: Array<RectanglePlacement | undefined> = new Array(
    grid.clues.length,
  );

  const assignedClues = new Set<number>();

  for (let regionIndex = 0; regionIndex < grid.regions.length; regionIndex++) {
    const region: RectangleRegion = grid.regions[regionIndex];

    if (
      !Number.isInteger(region.row) ||
      !Number.isInteger(region.col) ||
      !Number.isInteger(region.width) ||
      !Number.isInteger(region.height) ||
      region.width <= 0 ||
      region.height <= 0
    ) {
      return {
        targetSolution: null,
        invalidReason: "Une région de référence est invalide",
      };
    }

    if (
      region.row < 0 ||
      region.col < 0 ||
      region.row + region.height > grid.rows ||
      region.col + region.width > grid.cols
    ) {
      return {
        targetSolution: null,
        invalidReason: "Une région de référence dépasse de la grille",
      };
    }

    const regionArea = region.width * region.height;

    const cluesInside: number[] = [];

    for (let clueIndex = 0; clueIndex < grid.clues.length; clueIndex++) {
      const clue = grid.clues[clueIndex];

      if (
        clue.row >= region.row &&
        clue.row < region.row + region.height &&
        clue.col >= region.col &&
        clue.col < region.col + region.width
      ) {
        cluesInside.push(clueIndex);
      }
    }

    if (cluesInside.length !== 1) {
      return {
        targetSolution: null,
        invalidReason:
          "Chaque région de référence doit contenir exactement un indice",
      };
    }

    const clueIndex = cluesInside[0];
    const clue = grid.clues[clueIndex];

    if (assignedClues.has(clueIndex)) {
      return {
        targetSolution: null,
        invalidReason: "Un indice appartient à plusieurs régions de référence",
      };
    }

    if (clue.value !== regionArea) {
      return {
        targetSolution: null,
        invalidReason:
          `La valeur ${clue.value} ne correspond pas ` +
          `à l’aire ${regionArea} de sa région`,
      };
    }

    assignedClues.add(clueIndex);

    const cells = createPlacementCells(
      region.row,
      region.col,
      region.width,
      region.height,
      grid.cols,
    );

    for (const cell of cells) {
      if (coverage[cell] !== -1) {
        return {
          targetSolution: null,
          invalidReason: "Les régions de référence se chevauchent",
        };
      }

      coverage[cell] = regionIndex;
    }

    targetSolution[clueIndex] = {
      clueIndex,
      row: region.row,
      col: region.col,
      width: region.width,
      height: region.height,
      cells,
    };
  }

  for (let cell = 0; cell < coverage.length; cell++) {
    if (coverage[cell] === -1) {
      return {
        targetSolution: null,
        invalidReason:
          "Les régions de référence ne couvrent pas toute la grille",
      };
    }
  }

  if (targetSolution.some((placement) => placement === undefined)) {
    return {
      targetSolution: null,
      invalidReason: "Un indice ne possède pas de région de référence",
    };
  }

  return {
    targetSolution: targetSolution as RectanglePlacement[],
    invalidReason: null,
  };
}

function runBacktrackingSearch(
  grid: RectangleGrid,
  candidatesByClue: RectanglePlacement[][],
  options: RectangleSolverOptions,
  onSolution: (solution: RectanglePlacement[]) => boolean,
): BacktrackingResult {
  const maximumNodes = options.maxNodes ?? DEFAULT_MAX_NODES;

  const timeLimitMs = options.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;

  const coverage = new Int32Array(grid.rows * grid.cols);

  coverage.fill(-1);

  const assignedClues = new Uint8Array(grid.clues.length);

  const selectedPlacements: Array<RectanglePlacement | null> = new Array(
    grid.clues.length,
  ).fill(null);

  const deadline = Date.now() + timeLimitMs;

  let visitedNodes = 0;
  let limitReached = false;
  let stopRequested = false;

  const placementFits = (placement: RectanglePlacement): boolean => {
    for (const cell of placement.cells) {
      if (coverage[cell] !== -1) {
        return false;
      }
    }

    return true;
  };

  const placeRectangle = (placement: RectanglePlacement): void => {
    for (const cell of placement.cells) {
      coverage[cell] = placement.clueIndex;
    }

    selectedPlacements[placement.clueIndex] = placement;
  };

  const removeRectangle = (placement: RectanglePlacement): void => {
    for (const cell of placement.cells) {
      coverage[cell] = -1;
    }

    selectedPlacements[placement.clueIndex] = null;
  };

  const search = (assignedCount: number): void => {
    if (stopRequested || limitReached) {
      return;
    }

    visitedNodes++;

    if (visitedNodes >= maximumNodes) {
      limitReached = true;
      return;
    }

    if (visitedNodes % 256 === 0 && Date.now() >= deadline) {
      limitReached = true;
      return;
    }

    if (assignedCount === grid.clues.length) {
      const solution = selectedPlacements.map((placement) => placement!);

      stopRequested = onSolution(solution);
      return;
    }

    let selectedClueIndex = -1;
    let selectedCompatiblePlacements: RectanglePlacement[] | null = null;

    /*
     * MRV :
     * on commence par l'indice qui possède le moins
     * de rectangles encore compatibles.
     */
    for (let clueIndex = 0; clueIndex < grid.clues.length; clueIndex++) {
      if (assignedClues[clueIndex] === 1) {
        continue;
      }

      const compatiblePlacements =
        candidatesByClue[clueIndex].filter(placementFits);

      if (compatiblePlacements.length === 0) {
        return;
      }

      if (
        selectedCompatiblePlacements === null ||
        compatiblePlacements.length < selectedCompatiblePlacements.length
      ) {
        selectedClueIndex = clueIndex;
        selectedCompatiblePlacements = compatiblePlacements;
      }
    }

    if (selectedClueIndex === -1 || selectedCompatiblePlacements === null) {
      return;
    }

    assignedClues[selectedClueIndex] = 1;

    for (const placement of selectedCompatiblePlacements) {
      placeRectangle(placement);

      search(assignedCount + 1);

      removeRectangle(placement);

      if (stopRequested || limitReached) {
        break;
      }
    }

    assignedClues[selectedClueIndex] = 0;
  };

  search(0);

  return {
    visitedNodes,
    limitReached,
  };
}

export function countGeometricCluePlacements(
  rows: number,
  cols: number,
  clue: RectangleClue,
): number {
  let placementCount = 0;

  const dimensions = getRectangleDimensions(clue.value);

  for (const { width, height } of dimensions) {
    if (width > cols || height > rows) {
      continue;
    }

    const minimumRow = Math.max(0, clue.row - height + 1);

    const maximumRow = Math.min(clue.row, rows - height);

    const minimumCol = Math.max(0, clue.col - width + 1);

    const maximumCol = Math.min(clue.col, cols - width);

    const rowCount = Math.max(0, maximumRow - minimumRow + 1);

    const colCount = Math.max(0, maximumCol - minimumCol + 1);

    placementCount += rowCount * colCount;
  }

  return placementCount;
}

export function solveRectangleGrid(
  grid: RectangleGrid,
  options: RectangleSolverOptions = {},
): RectangleSolverResult {
  const invalidReason = validateSolverInput(grid);

  if (invalidReason) {
    return {
      solutionCount: 0,
      isUnique: false,
      isUnsolvable: false,
      limitReached: false,
      visitedNodes: 0,
      invalidReason,
    };
  }

  const candidatesByClue = createCandidatesByClue(grid);

  if (candidatesByClue.some((candidates) => candidates.length === 0)) {
    return {
      solutionCount: 0,
      isUnique: false,
      isUnsolvable: true,
      limitReached: false,
      visitedNodes: 0,
      invalidReason: null,
    };
  }

  const maximumSolutions = options.maxSolutions ?? DEFAULT_MAX_SOLUTIONS;

  let solutionCount = 0;

  const searchResult = runBacktrackingSearch(
    grid,
    candidatesByClue,
    options,
    () => {
      solutionCount++;

      return solutionCount >= maximumSolutions;
    },
  );

  const normalizedSolutionCount = Math.min(solutionCount, 2) as 0 | 1 | 2;

  return {
    solutionCount: normalizedSolutionCount,
    isUnique: normalizedSolutionCount === 1 && !searchResult.limitReached,
    isUnsolvable: normalizedSolutionCount === 0 && !searchResult.limitReached,
    limitReached: searchResult.limitReached,
    visitedNodes: searchResult.visitedNodes,
    invalidReason: null,
  };
}

export function findAlternativeRectangleSolution(
  grid: RectangleGrid,
  options: RectangleSolverOptions = {},
): AlternativeRectangleSolverResult {
  const invalidReason = validateSolverInput(grid);

  if (invalidReason) {
    return {
      targetSolution: null,
      alternativeSolution: null,
      isUnique: false,
      limitReached: false,
      visitedNodes: 0,
      invalidReason,
    };
  }

  const targetResult = createTargetSolution(grid);

  if (!targetResult.targetSolution) {
    return {
      targetSolution: null,
      alternativeSolution: null,
      isUnique: false,
      limitReached: false,
      visitedNodes: 0,
      invalidReason:
        targetResult.invalidReason ??
        "Impossible de récupérer la solution de référence",
    };
  }

  const targetSolution = targetResult.targetSolution;

  const targetKeys = targetSolution.map(createPlacementKey);

  const candidatesByClue = createCandidatesByClue(grid);

  if (candidatesByClue.some((candidates) => candidates.length === 0)) {
    return {
      targetSolution,
      alternativeSolution: null,
      isUnique: false,
      limitReached: false,
      visitedNodes: 0,
      invalidReason:
        "La solution de référence n’est plus compatible avec les indices",
    };
  }

  /*
   * Pour trouver plus rapidement une alternative,
   * on teste le rectangle cible en dernier.
   */
  candidatesByClue.forEach((candidates, clueIndex) => {
    const targetKey = targetKeys[clueIndex];

    candidates.sort((first, second) => {
      const firstIsTarget = createPlacementKey(first) === targetKey;

      const secondIsTarget = createPlacementKey(second) === targetKey;

      if (firstIsTarget === secondIsTarget) {
        return 0;
      }

      return firstIsTarget ? 1 : -1;
    });
  });

  let alternativeSolution: RectanglePlacement[] | null = null;

  const searchResult = runBacktrackingSearch(
    grid,
    candidatesByClue,
    options,
    (solution) => {
      const isTargetSolution = solution.every(
        (placement, clueIndex) =>
          createPlacementKey(placement) === targetKeys[clueIndex],
      );

      if (isTargetSolution) {
        return false;
      }

      alternativeSolution = solution.map((placement) => ({
        ...placement,
        cells: [...placement.cells],
      }));

      return true;
    },
  );

  return {
    targetSolution,
    alternativeSolution,
    isUnique: alternativeSolution === null && !searchResult.limitReached,
    limitReached: searchResult.limitReached,
    visitedNodes: searchResult.visitedNodes,
    invalidReason: null,
  };
}
