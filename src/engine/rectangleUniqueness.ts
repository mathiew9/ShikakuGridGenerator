import type {
  GridUniquenessStatus,
  RectangleClue,
  RectangleGrid,
} from "../types/rectangleTypes";
import {
  countGeometricCluePlacements,
  findAlternativeRectangleSolution,
} from "./rectangleSolver";
import type {
  AlternativeRectangleSolverResult,
  RectanglePlacement,
  RectangleSolverOptions,
} from "./rectangleSolver";

type CluePositionOption = {
  row: number;
  col: number;
  blockedMask: number;
  moved: boolean;
  geometricPlacementCount: number;
  distanceFromOriginal: number;
};

type LayoutState = {
  mask: number;
  movedClueCount: number;
  geometricPlacementScore: number;
  distanceScore: number;
  parent: LayoutState | null;
  clueIndex: number;
  option: CluePositionOption | null;
};

export type RectangleUniquenessOptions = {
  /*
   * Correspond maintenant au nombre maximal
   * de dispositions ciblées testées.
   */
  maxRepairAttempts?: number;

  /*
   * 0 ou undefined = toutes les cases possibles.
   */
  maxPositionsPerClue?: number;

  /*
   * Nombre maximal d'états conservés par la recherche
   * de positions d'indices.
   */
  maxLayoutStates?: number;

  verificationSolverOptions?: RectangleSolverOptions;
  repairSolverOptions?: RectangleSolverOptions;
};

export type RectangleUniquenessResult = {
  grid: RectangleGrid;
  status: GridUniquenessStatus;
  changed: boolean;
  repairAttempts: number;
  solutionCount: 0 | 1 | 2;
  reason: string | null;
};

const DEFAULT_MAX_REPAIR_ATTEMPTS = 24;
const DEFAULT_MAX_LAYOUT_STATES = 50_000;

/*
 * Le masque utilise les 30 premiers bits d'un number.
 */
const MAX_TRACKED_ALTERNATIVES = 30;

function cloneClues(clues: RectangleClue[]): RectangleClue[] {
  return clues.map((clue) => ({ ...clue }));
}

function createCluePositionSignature(clues: RectangleClue[]): string {
  return clues.map((clue) => `${clue.row},${clue.col}`).join("|");
}

function createPlacementKey(placement: RectanglePlacement): string {
  return [placement.row, placement.col, placement.width, placement.height].join(
    ":",
  );
}

function createAlternativeSignature(solution: RectanglePlacement[]): string {
  return solution.map(createPlacementKey).join("|");
}

function placementContainsPosition(
  placement: RectanglePlacement,
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

function countMaskBits(mask: number): number {
  let remainingMask = mask >>> 0;
  let count = 0;

  while (remainingMask !== 0) {
    remainingMask &= remainingMask - 1;
    count++;
  }

  return count;
}

function comparePositionOptions(
  first: CluePositionOption,
  second: CluePositionOption,
): number {
  if (first.moved !== second.moved) {
    return first.moved ? 1 : -1;
  }

  if (first.geometricPlacementCount !== second.geometricPlacementCount) {
    return first.geometricPlacementCount - second.geometricPlacementCount;
  }

  return first.distanceFromOriginal - second.distanceFromOriginal;
}

function compareLayoutCosts(first: LayoutState, second: LayoutState): number {
  if (first.movedClueCount !== second.movedClueCount) {
    return first.movedClueCount - second.movedClueCount;
  }

  if (first.geometricPlacementScore !== second.geometricPlacementScore) {
    return first.geometricPlacementScore - second.geometricPlacementScore;
  }

  return first.distanceScore - second.distanceScore;
}

function compareLayoutPriority(
  first: LayoutState,
  second: LayoutState,
): number {
  const firstCoverage = countMaskBits(first.mask);

  const secondCoverage = countMaskBits(second.mask);

  if (firstCoverage !== secondCoverage) {
    return secondCoverage - firstCoverage;
  }

  return compareLayoutCosts(first, second);
}

function createPositionOptionsForClue(
  grid: RectangleGrid,
  clueIndex: number,
  targetPlacement: RectanglePlacement,
  alternatives: RectanglePlacement[][],
  maximumPositions: number | undefined,
): CluePositionOption[] {
  const originalClue = grid.clues[clueIndex];

  const bestOptionByMask = new Map<number, CluePositionOption>();

  for (
    let row = targetPlacement.row;
    row < targetPlacement.row + targetPlacement.height;
    row++
  ) {
    for (
      let col = targetPlacement.col;
      col < targetPlacement.col + targetPlacement.width;
      col++
    ) {
      let blockedMask = 0;

      for (
        let alternativeIndex = 0;
        alternativeIndex < alternatives.length;
        alternativeIndex++
      ) {
        const alternativePlacement = alternatives[alternativeIndex][clueIndex];

        /*
         * Si l'indice est déplacé hors du rectangle
         * de cette solution alternative, cette solution
         * devient impossible.
         */
        if (!placementContainsPosition(alternativePlacement, row, col)) {
          blockedMask |= 1 << alternativeIndex;
        }
      }

      const moved = row !== originalClue.row || col !== originalClue.col;

      const positionOption: CluePositionOption = {
        row,
        col,
        blockedMask,
        moved,
        geometricPlacementCount: countGeometricCluePlacements(
          grid.rows,
          grid.cols,
          {
            ...originalClue,
            row,
            col,
          },
        ),
        distanceFromOriginal:
          Math.abs(row - originalClue.row) + Math.abs(col - originalClue.col),
      };

      const currentBest = bestOptionByMask.get(blockedMask);

      if (
        !currentBest ||
        comparePositionOptions(positionOption, currentBest) < 0
      ) {
        bestOptionByMask.set(blockedMask, positionOption);
      }
    }
  }

  let options = [...bestOptionByMask.values()];

  /*
   * On garde d'abord les positions qui bloquent
   * le plus de solutions connues.
   */
  options.sort((first, second) => {
    const coverageDifference =
      countMaskBits(second.blockedMask) - countMaskBits(first.blockedMask);

    if (coverageDifference !== 0) {
      return coverageDifference;
    }

    return comparePositionOptions(first, second);
  });

  if (
    maximumPositions &&
    maximumPositions > 0 &&
    options.length > maximumPositions
  ) {
    const originalOption = options.find((option) => !option.moved);

    options = options.slice(0, maximumPositions);

    if (originalOption && !options.includes(originalOption)) {
      options[options.length - 1] = originalOption;
    }
  }

  return options;
}

function reconstructCluesFromState(
  originalClues: RectangleClue[],
  finalState: LayoutState,
): RectangleClue[] {
  const clues = cloneClues(originalClues);

  let currentState: LayoutState | null = finalState;

  while (currentState && currentState.parent !== null) {
    if (currentState.clueIndex >= 0 && currentState.option) {
      clues[currentState.clueIndex] = {
        ...clues[currentState.clueIndex],
        row: currentState.option.row,
        col: currentState.option.col,
      };
    }

    currentState = currentState.parent;
  }

  return clues;
}

function createBlockingClueLayout(
  grid: RectangleGrid,
  targetSolution: RectanglePlacement[],
  alternatives: RectanglePlacement[][],
  maximumPositionsPerClue: number | undefined,
  maximumLayoutStates: number,
): RectangleClue[] | null {
  if (alternatives.length === 0) {
    return cloneClues(grid.clues);
  }

  const fullMask = 2 ** alternatives.length - 1;

  const clueOptions = targetSolution.map((targetPlacement, clueIndex) =>
    createPositionOptionsForClue(
      grid,
      clueIndex,
      targetPlacement,
      alternatives,
      maximumPositionsPerClue,
    ),
  );

  /*
   * Un indice est utile à la réparation lorsqu'au moins
   * une de ses positions peut bloquer une alternative.
   */
  const relevantClueIndexes = clueOptions
    .map((options, clueIndex) => ({
      clueIndex,
      maximumCoverage: Math.max(
        ...options.map((option) => countMaskBits(option.blockedMask)),
      ),
    }))
    .filter(({ maximumCoverage }) => maximumCoverage > 0)
    .sort((first, second) => second.maximumCoverage - first.maximumCoverage)
    .map(({ clueIndex }) => clueIndex);

  if (relevantClueIndexes.length === 0) {
    return null;
  }

  const initialState: LayoutState = {
    mask: 0,
    movedClueCount: 0,
    geometricPlacementScore: 0,
    distanceScore: 0,
    parent: null,
    clueIndex: -1,
    option: null,
  };

  let states = new Map<number, LayoutState>();

  states.set(0, initialState);

  /*
   * Recherche dynamique :
   *
   * pour chaque masque de solutions déjà bloquées,
   * on ne conserve que la disposition la moins coûteuse.
   *
   * Priorités :
   * 1. déplacer le moins d'indices possible ;
   * 2. réduire le nombre de rectangles possibles ;
   * 3. limiter la distance des déplacements.
   */
  for (const clueIndex of relevantClueIndexes) {
    const nextStates = new Map<number, LayoutState>();

    for (const state of states.values()) {
      for (const option of clueOptions[clueIndex]) {
        const nextMask = state.mask | option.blockedMask;

        const nextState: LayoutState = {
          mask: nextMask,
          movedClueCount: state.movedClueCount + (option.moved ? 1 : 0),
          geometricPlacementScore:
            state.geometricPlacementScore + option.geometricPlacementCount,
          distanceScore: state.distanceScore + option.distanceFromOriginal,
          parent: state,
          clueIndex,
          option,
        };

        const existingState = nextStates.get(nextMask);

        if (
          !existingState ||
          compareLayoutCosts(nextState, existingState) < 0
        ) {
          nextStates.set(nextMask, nextState);
        }
      }
    }

    if (nextStates.size > maximumLayoutStates) {
      const preferredStates = [...nextStates.values()]
        .sort(compareLayoutPriority)
        .slice(0, maximumLayoutStates);

      states = new Map(preferredStates.map((state) => [state.mask, state]));
    } else {
      states = nextStates;
    }
  }

  const finalState = states.get(fullMask);

  if (!finalState) {
    return null;
  }

  return reconstructCluesFromState(grid.clues, finalState);
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function createSolverFailureResult(
  grid: RectangleGrid,
  solverResult: AlternativeRectangleSolverResult,
  repairAttempts: number,
): RectangleUniquenessResult | null {
  if (solverResult.invalidReason) {
    return {
      grid: {
        ...grid,
        uniquenessStatus: "error",
      },
      status: "error",
      changed: false,
      repairAttempts,
      solutionCount: 0,
      reason: solverResult.invalidReason,
    };
  }

  if (solverResult.limitReached) {
    return {
      grid: {
        ...grid,
        uniquenessStatus: "error",
      },
      status: "error",
      changed: false,
      repairAttempts,
      solutionCount: solverResult.alternativeSolution ? 2 : 1,
      reason: "La limite du solveur a été atteinte avant de pouvoir conclure",
    };
  }

  return null;
}

export async function makeRectangleGridUnique(
  grid: RectangleGrid,
  options: RectangleUniquenessOptions = {},
): Promise<RectangleUniquenessResult> {
  const maximumRepairAttempts = Math.min(
    options.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS,
    MAX_TRACKED_ALTERNATIVES,
  );

  const maximumLayoutStates =
    options.maxLayoutStates ?? DEFAULT_MAX_LAYOUT_STATES;

  const verificationSolverOptions: RectangleSolverOptions = {
    maxNodes: 500_000,
    timeLimitMs: 3_000,
    ...options.verificationSolverOptions,
  };

  const repairSolverOptions: RectangleSolverOptions = {
    maxNodes: 300_000,
    timeLimitMs: 1_500,
    ...options.repairSolverOptions,
  };

  /*
   * 1. Recherche d'une solution différente
   *    de la partition générée.
   */
  const initialSolverResult = findAlternativeRectangleSolution(
    grid,
    verificationSolverOptions,
  );

  const initialFailure = createSolverFailureResult(
    grid,
    initialSolverResult,
    0,
  );

  if (initialFailure) {
    return initialFailure;
  }

  if (
    initialSolverResult.isUnique ||
    !initialSolverResult.alternativeSolution
  ) {
    return {
      grid: {
        ...grid,
        uniquenessStatus: "unique",
      },
      status: "unique",
      changed: false,
      repairAttempts: 0,
      solutionCount: 1,
      reason: null,
    };
  }

  const targetSolution = initialSolverResult.targetSolution;

  if (!targetSolution) {
    return {
      grid: {
        ...grid,
        uniquenessStatus: "error",
      },
      status: "error",
      changed: false,
      repairAttempts: 0,
      solutionCount: 0,
      reason: "Impossible de récupérer la solution de référence",
    };
  }

  /*
   * Liste des solutions alternatives que les positions
   * d'indices devront toutes éliminer.
   */
  const knownAlternatives: RectanglePlacement[][] = [
    initialSolverResult.alternativeSolution,
  ];

  const knownAlternativeSignatures = new Set<string>([
    createAlternativeSignature(initialSolverResult.alternativeSolution),
  ]);

  const testedClueLayouts = new Set<string>();

  testedClueLayouts.add(createCluePositionSignature(grid.clues));

  let repairAttempts = 0;

  /*
   * 2. Boucle de contre-exemples :
   *
   * - on place les indices pour bloquer toutes les
   *   solutions alternatives actuellement connues ;
   * - le solveur cherche une nouvelle alternative ;
   * - s'il en trouve une, elle est ajoutée aux contraintes ;
   * - sinon la grille est unique.
   */
  while (repairAttempts < maximumRepairAttempts) {
    const variantClues = createBlockingClueLayout(
      grid,
      targetSolution,
      knownAlternatives,
      options.maxPositionsPerClue,
      maximumLayoutStates,
    );

    if (!variantClues) {
      return {
        grid: {
          ...grid,
          uniquenessStatus: "multiple",
        },
        status: "multiple",
        changed: false,
        repairAttempts,
        solutionCount: 2,
        reason:
          "Aucune disposition d’indices ne permet de bloquer toutes les solutions alternatives connues",
      };
    }

    const clueLayoutSignature = createCluePositionSignature(variantClues);

    if (testedClueLayouts.has(clueLayoutSignature)) {
      return {
        grid: {
          ...grid,
          uniquenessStatus: "multiple",
        },
        status: "multiple",
        changed: false,
        repairAttempts,
        solutionCount: 2,
        reason:
          "La recherche est revenue sur une disposition d’indices déjà testée",
      };
    }

    testedClueLayouts.add(clueLayoutSignature);

    repairAttempts++;

    const variantGrid: RectangleGrid = {
      ...grid,
      clues: variantClues,
    };

    const solverResult = findAlternativeRectangleSolution(
      variantGrid,
      repairSolverOptions,
    );

    const solverFailure = createSolverFailureResult(
      grid,
      solverResult,
      repairAttempts,
    );

    if (solverFailure) {
      return solverFailure;
    }

    /*
     * Aucune solution différente de grid.regions :
     * la disposition est réellement unique.
     */
    if (solverResult.isUnique || !solverResult.alternativeSolution) {
      return {
        grid: {
          ...variantGrid,
          uniquenessStatus: "unique",
        },
        status: "unique",
        changed:
          clueLayoutSignature !== createCluePositionSignature(grid.clues),
        repairAttempts,
        solutionCount: 1,
        reason: null,
      };
    }

    const alternativeSignature = createAlternativeSignature(
      solverResult.alternativeSolution,
    );

    /*
     * Cette alternative devait être bloquée par la
     * disposition actuelle. Si elle est déjà connue,
     * cela révèle une incohérence dans le calcul.
     */
    if (knownAlternativeSignatures.has(alternativeSignature)) {
      return {
        grid: {
          ...grid,
          uniquenessStatus: "error",
        },
        status: "error",
        changed: false,
        repairAttempts,
        solutionCount: 2,
        reason:
          "Le solveur a retrouvé une solution alternative qui devait déjà être bloquée",
      };
    }

    knownAlternativeSignatures.add(alternativeSignature);

    knownAlternatives.push(solverResult.alternativeSolution);

    await yieldToBrowser();
  }

  return {
    grid: {
      ...grid,
      uniquenessStatus: "multiple",
    },
    status: "multiple",
    changed: false,
    repairAttempts,
    solutionCount: 2,
    reason:
      `La grille possède encore plusieurs solutions après ` +
      `${repairAttempts} correction${repairAttempts > 1 ? "s" : ""} ciblée${
        repairAttempts > 1 ? "s" : ""
      }`,
  };
}
