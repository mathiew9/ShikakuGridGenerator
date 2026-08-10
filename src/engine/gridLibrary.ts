import type {
  GridSizePreset,
  RectangleClue,
  RectangleGrid,
  RectangleGridLibrary,
  RectangleRegion,
  StoredRectangleGrid,
} from "../types/rectangleTypes";

export const GRID_LIBRARY_FORMAT = "nin9hub-rectangle-library" as const;

export const GRID_LIBRARY_VERSION = 1 as const;

const VALID_GRID_SIZES = new Set<GridSizePreset>([5, 10, 15, 20, 25]);

export type GridLibraryParseResult =
  | {
      success: true;
      library: RectangleGridLibrary;
      error: null;
    }
  | {
      success: false;
      library: null;
      error: string;
    };

export type GridLibraryMergeResult = {
  success: boolean;
  library: RectangleGridLibrary;

  selectedCount: number;
  uniqueCount: number;
  addedCount: number;
  duplicateCount: number;
  ignoredNotUniqueCount: number;

  error: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isGridSizePreset(value: unknown): value is GridSizePreset {
  return isInteger(value) && VALID_GRID_SIZES.has(value as GridSizePreset);
}

function parseClue(rawValue: unknown): RectangleClue | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const row = rawValue.row;
  const col = rawValue.col;
  const clueValue = rawValue.value;

  if (!isInteger(row) || !isInteger(col) || !isInteger(clueValue)) {
    return null;
  }

  return {
    row,
    col,
    value: clueValue,
  };
}

function parseRegion(rawValue: unknown): RectangleRegion | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  const id = rawValue.id;
  const row = rawValue.row;
  const col = rawValue.col;
  const width = rawValue.width;
  const height = rawValue.height;

  if (
    !isInteger(id) ||
    !isInteger(row) ||
    !isInteger(col) ||
    !isInteger(width) ||
    !isInteger(height)
  ) {
    return null;
  }

  return {
    id,
    row,
    col,
    width,
    height,
  };
}

function parseStoredGrid(rawValue: unknown): StoredRectangleGrid | null {
  if (!isRecord(rawValue)) {
    return null;
  }

  if (typeof rawValue.id !== "string" || rawValue.id.trim().length === 0) {
    return null;
  }

  if (!Array.isArray(rawValue.clues) || !Array.isArray(rawValue.regions)) {
    return null;
  }

  const clues: RectangleClue[] = [];

  for (const rawClue of rawValue.clues) {
    const clue = parseClue(rawClue);

    if (!clue) {
      return null;
    }

    clues.push(clue);
  }

  const regions: RectangleRegion[] = [];

  for (const rawRegion of rawValue.regions) {
    const region = parseRegion(rawRegion);

    if (!region) {
      return null;
    }

    regions.push(region);
  }

  return {
    id: rawValue.id,
    clues,
    regions,
  };
}

/**
 * Signature d'un puzzle.
 *
 * L'id n'intervient jamais.
 * Deux puzzles ayant exactement les mêmes indices sont
 * considérés comme identiques.
 */
export function createStoredGridSignature(
  clues: readonly RectangleClue[],
): string {
  return [...clues]
    .sort((first, second) => {
      if (first.row !== second.row) {
        return first.row - second.row;
      }

      if (first.col !== second.col) {
        return first.col - second.col;
      }

      return first.value - second.value;
    })
    .map((clue) => `${clue.row},${clue.col},${clue.value}`)
    .join("|");
}

function validateStoredGrid(
  grid: StoredRectangleGrid,
  gridSize: GridSizePreset,
): string | null {
  if (grid.clues.length === 0) {
    return "La grille ne contient aucun indice.";
  }

  if (grid.regions.length === 0) {
    return "La grille ne contient aucune région.";
  }

  if (grid.clues.length !== grid.regions.length) {
    return (
      `Le nombre d'indices (${grid.clues.length}) ` +
      `ne correspond pas au nombre de régions ` +
      `(${grid.regions.length}).`
    );
  }

  const cluePositions = new Set<string>();

  let totalClueArea = 0;

  for (const clue of grid.clues) {
    if (
      clue.row < 0 ||
      clue.row >= gridSize ||
      clue.col < 0 ||
      clue.col >= gridSize
    ) {
      return "Un indice se trouve en dehors de la grille.";
    }

    if (clue.value <= 0) {
      return "Un indice possède une valeur invalide.";
    }

    const positionSignature = `${clue.row}:${clue.col}`;

    if (cluePositions.has(positionSignature)) {
      return "Plusieurs indices occupent la même case.";
    }

    cluePositions.add(positionSignature);

    totalClueArea += clue.value;
  }

  if (totalClueArea !== gridSize * gridSize) {
    return (
      `La somme des indices est ${totalClueArea} ` +
      `au lieu de ${gridSize * gridSize}.`
    );
  }

  const regionIds = new Set<number>();

  const coverage = new Int32Array(gridSize * gridSize);

  coverage.fill(-1);

  for (let regionIndex = 0; regionIndex < grid.regions.length; regionIndex++) {
    const region = grid.regions[regionIndex];

    if (regionIds.has(region.id)) {
      return (
        `L'identifiant de région ${region.id} ` + "est utilisé plusieurs fois."
      );
    }

    regionIds.add(region.id);

    if (region.width <= 0 || region.height <= 0) {
      return "Une région possède des dimensions invalides.";
    }

    if (
      region.row < 0 ||
      region.col < 0 ||
      region.row + region.height > gridSize ||
      region.col + region.width > gridSize
    ) {
      return "Une région dépasse de la grille.";
    }

    const cluesInside = grid.clues.filter(
      (clue) =>
        clue.row >= region.row &&
        clue.row < region.row + region.height &&
        clue.col >= region.col &&
        clue.col < region.col + region.width,
    );

    if (cluesInside.length !== 1) {
      return `La région ${region.id} doit contenir ` + "exactement un indice.";
    }

    const expectedArea = region.width * region.height;

    if (cluesInside[0].value !== expectedArea) {
      return (
        `La région ${region.id} a une aire de ` +
        `${expectedArea}, mais son indice vaut ` +
        `${cluesInside[0].value}.`
      );
    }

    for (let row = region.row; row < region.row + region.height; row++) {
      for (let col = region.col; col < region.col + region.width; col++) {
        const cellIndex = row * gridSize + col;

        if (coverage[cellIndex] !== -1) {
          return "Certaines régions se chevauchent.";
        }

        coverage[cellIndex] = regionIndex;
      }
    }
  }

  for (let cellIndex = 0; cellIndex < coverage.length; cellIndex++) {
    if (coverage[cellIndex] === -1) {
      return "Les régions ne couvrent pas toute la grille.";
    }
  }

  return null;
}

export function createEmptyGridLibrary(
  gridSize: GridSizePreset,
): RectangleGridLibrary {
  return {
    format: GRID_LIBRARY_FORMAT,
    version: GRID_LIBRARY_VERSION,
    uniquenessVerified: true,
    gridSize,
    grids: [],
  };
}

export function parseGridLibraryText(text: string): GridLibraryParseResult {
  let rawValue: unknown;

  try {
    rawValue = JSON.parse(text);
  } catch {
    return {
      success: false,
      library: null,
      error: "Le fichier n'est pas un JSON valide.",
    };
  }

  if (!isRecord(rawValue)) {
    return {
      success: false,
      library: null,
      error: "Le contenu du fichier est invalide.",
    };
  }

  if (rawValue.format !== GRID_LIBRARY_FORMAT) {
    return {
      success: false,
      library: null,
      error: "Ce fichier n'est pas une bibliothèque Nin9Hub Rectangle.",
    };
  }

  if (rawValue.version !== GRID_LIBRARY_VERSION) {
    return {
      success: false,
      library: null,
      error:
        `Version de fichier incompatible. ` +
        `Version attendue : ${GRID_LIBRARY_VERSION}.`,
    };
  }

  /*
   * Important :
   * on refuse les bibliothèques qui ne déclarent pas
   * contenir exclusivement des puzzles vérifiés uniques.
   */
  if (rawValue.uniquenessVerified !== true) {
    return {
      success: false,
      library: null,
      error:
        "Ce fichier n'est pas certifié comme contenant uniquement des grilles à solution unique.",
    };
  }

  if (!isGridSizePreset(rawValue.gridSize)) {
    return {
      success: false,
      library: null,
      error: "La taille de grille du fichier est invalide.",
    };
  }

  if (!Array.isArray(rawValue.grids)) {
    return {
      success: false,
      library: null,
      error: "La liste des grilles est invalide.",
    };
  }

  const gridSize = rawValue.gridSize;

  const grids: StoredRectangleGrid[] = [];

  const signatures = new Set<string>();
  const ids = new Set<string>();

  for (let index = 0; index < rawValue.grids.length; index++) {
    const parsedGrid = parseStoredGrid(rawValue.grids[index]);

    if (!parsedGrid) {
      return {
        success: false,
        library: null,
        error: `La grille ${index + 1} possède ` + "un format invalide.",
      };
    }

    const validationError = validateStoredGrid(parsedGrid, gridSize);

    if (validationError) {
      return {
        success: false,
        library: null,
        error: `Grille ${index + 1} invalide : ` + validationError,
      };
    }

    if (ids.has(parsedGrid.id)) {
      return {
        success: false,
        library: null,
        error:
          `L'identifiant "${parsedGrid.id}" ` + "est utilisé plusieurs fois.",
      };
    }

    ids.add(parsedGrid.id);

    const signature = createStoredGridSignature(parsedGrid.clues);

    if (signatures.has(signature)) {
      return {
        success: false,
        library: null,
        error: `Le fichier contient un doublon ` + `à la grille ${index + 1}.`,
      };
    }

    signatures.add(signature);

    grids.push(parsedGrid);
  }

  return {
    success: true,
    error: null,
    library: {
      format: GRID_LIBRARY_FORMAT,
      version: GRID_LIBRARY_VERSION,
      uniquenessVerified: true,
      gridSize,
      grids,
    },
  };
}

function createAvailableGridId(
  requestedId: string,
  existingIds: Set<string>,
): string {
  if (!existingIds.has(requestedId)) {
    return requestedId;
  }

  let nextId: string;

  do {
    nextId = `${requestedId}-` + crypto.randomUUID().slice(0, 8);
  } while (existingIds.has(nextId));

  return nextId;
}

function convertGridForStorage(
  grid: RectangleGrid,
  existingIds: Set<string>,
): StoredRectangleGrid {
  const id = createAvailableGridId(grid.id, existingIds);

  return {
    id,

    clues: grid.clues.map((clue) => ({
      row: clue.row,
      col: clue.col,
      value: clue.value,
    })),

    regions: grid.regions.map((region) => ({
      id: region.id,
      row: region.row,
      col: region.col,
      width: region.width,
      height: region.height,
    })),
  };
}

export function mergeUniqueGridsIntoLibrary(
  library: RectangleGridLibrary,
  selectedGrids: readonly RectangleGrid[],
): GridLibraryMergeResult {
  const selectedCount = selectedGrids.length;

  const uniqueGrids = selectedGrids.filter(
    (grid) => grid.uniquenessStatus === "unique",
  );

  const ignoredNotUniqueCount = selectedCount - uniqueGrids.length;

  for (const grid of uniqueGrids) {
    if (grid.rows !== library.gridSize || grid.cols !== library.gridSize) {
      return {
        success: false,
        library,
        selectedCount,
        uniqueCount: uniqueGrids.length,
        addedCount: 0,
        duplicateCount: 0,
        ignoredNotUniqueCount,
        error:
          `Une grille ${grid.rows}×${grid.cols} ` +
          `ne peut pas être ajoutée à une bibliothèque ` +
          `${library.gridSize}×${library.gridSize}.`,
      };
    }
  }

  const existingSignatures = new Set<string>(
    library.grids.map((grid) => createStoredGridSignature(grid.clues)),
  );

  const existingIds = new Set<string>(library.grids.map((grid) => grid.id));

  const addedGrids: StoredRectangleGrid[] = [];

  let duplicateCount = 0;

  for (const grid of uniqueGrids) {
    const signature = createStoredGridSignature(grid.clues);

    if (existingSignatures.has(signature)) {
      duplicateCount++;
      continue;
    }

    const storedGrid = convertGridForStorage(grid, existingIds);

    const validationError = validateStoredGrid(storedGrid, library.gridSize);

    if (validationError) {
      return {
        success: false,
        library,
        selectedCount,
        uniqueCount: uniqueGrids.length,
        addedCount: 0,
        duplicateCount,
        ignoredNotUniqueCount,
        error: `La grille "${grid.id}" est invalide : ` + validationError,
      };
    }

    existingSignatures.add(signature);
    existingIds.add(storedGrid.id);

    addedGrids.push(storedGrid);
  }

  return {
    success: true,

    library: {
      ...library,
      grids: [...library.grids, ...addedGrids],
    },

    selectedCount,
    uniqueCount: uniqueGrids.length,
    addedCount: addedGrids.length,
    duplicateCount,
    ignoredNotUniqueCount,
    error: null,
  };
}

export function getDefaultGridLibraryFileName(
  gridSize: GridSizePreset,
): string {
  return `grids-${gridSize}x${gridSize}.json`;
}

export function serializeGridLibrary(library: RectangleGridLibrary): string {
  return JSON.stringify(library, null, 2) + "\n";
}

export function downloadGridLibrary(
  library: RectangleGridLibrary,
  fileName?: string,
): void {
  const json = serializeGridLibrary(library);

  const blob = new Blob([json], {
    type: "application/json;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;

  link.download = fileName ?? getDefaultGridLibraryFileName(library.gridSize);

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}
