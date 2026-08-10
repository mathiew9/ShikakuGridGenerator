import type {
  GeneratorSettings,
  RectangleGrid,
  RectangleRegion,
  ValidationResult,
} from "../types/rectangleTypes";

type CoverageGrid = Array<Array<number | null>>;

function createEmptyCoverageGrid(rows: number, cols: number): CoverageGrid {
  return Array.from({ length: rows }, () =>
    Array<number | null>(cols).fill(null),
  );
}

function createInvalidResult(reason: string): ValidationResult {
  return {
    isValid: false,
    reason,
  };
}

function createValidResult(): ValidationResult {
  return {
    isValid: true,
    reason: null,
  };
}

function validateGridDimensions(grid: RectangleGrid): ValidationResult {
  const { rows, cols } = grid;

  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows <= 0 ||
    cols <= 0
  ) {
    return createInvalidResult(
      `Dimensions de grille invalides : ${rows}x${cols}`,
    );
  }

  return createValidResult();
}

function validateRegionDefinition(region: RectangleRegion): ValidationResult {
  if (!Number.isInteger(region.id)) {
    return createInvalidResult("Identifiant de rectangle invalide");
  }

  if (!Number.isInteger(region.row) || !Number.isInteger(region.col)) {
    return createInvalidResult(
      `Position invalide pour le rectangle ${region.id}`,
    );
  }

  if (
    !Number.isInteger(region.width) ||
    !Number.isInteger(region.height) ||
    region.width <= 0 ||
    region.height <= 0
  ) {
    return createInvalidResult(
      `Dimensions invalides pour le rectangle ${region.id}`,
    );
  }

  return createValidResult();
}

function validateRectangleGridStructure(grid: RectangleGrid): ValidationResult {
  const { rows, cols, regions, clues } = grid;

  const dimensionsValidation = validateGridDimensions(grid);

  if (!dimensionsValidation.isValid) {
    return dimensionsValidation;
  }

  if (!regions || regions.length === 0) {
    return createInvalidResult("Aucun rectangle");
  }

  if (!clues || clues.length === 0) {
    return createInvalidResult("Aucun clue");
  }

  if (regions.length !== clues.length) {
    return createInvalidResult(
      `Nombre de clues différent du nombre de rectangles : ` +
        `${clues.length} clues pour ${regions.length} rectangles`,
    );
  }

  const coverage = createEmptyCoverageGrid(rows, cols);
  const regionsById = new Map<number, RectangleRegion>();

  /*
   * Vérification des rectangles :
   * - identifiants uniques ;
   * - dimensions valides ;
   * - limites de la grille ;
   * - absence de chevauchement.
   */
  for (const region of regions) {
    const regionValidation = validateRegionDefinition(region);

    if (!regionValidation.isValid) {
      return regionValidation;
    }

    if (regionsById.has(region.id)) {
      return createInvalidResult(
        `Identifiant de rectangle dupliqué : ${region.id}`,
      );
    }

    regionsById.set(region.id, region);

    const regionEndRow = region.row + region.height;
    const regionEndCol = region.col + region.width;

    if (
      region.row < 0 ||
      region.col < 0 ||
      regionEndRow > rows ||
      regionEndCol > cols
    ) {
      return createInvalidResult(`Rectangle ${region.id} hors limites`);
    }

    for (let row = region.row; row < regionEndRow; row++) {
      for (let col = region.col; col < regionEndCol; col++) {
        const existingRegionId = coverage[row][col];

        if (existingRegionId !== null) {
          return createInvalidResult(
            `Chevauchement entre les rectangles ` +
              `${existingRegionId} et ${region.id}`,
          );
        }

        coverage[row][col] = region.id;
      }
    }
  }

  // Vérification que toute la grille est couverte.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (coverage[row][col] === null) {
        return createInvalidResult(
          `Grille non entièrement couverte : case (${row}, ${col}) vide`,
        );
      }
    }
  }

  /*
   * Vérification des clues :
   * - coordonnées valides ;
   * - clue situé dans un rectangle ;
   * - un seul clue par rectangle ;
   * - valeur du clue égale à l'aire du rectangle.
   *
   * La correspondance n'utilise plus l'index des tableaux.
   */
  const regionsWithClue = new Set<number>();

  for (const clue of clues) {
    if (!Number.isInteger(clue.row) || !Number.isInteger(clue.col)) {
      return createInvalidResult("Coordonnées de clue invalides");
    }

    if (clue.row < 0 || clue.row >= rows || clue.col < 0 || clue.col >= cols) {
      return createInvalidResult(
        `Clue hors limites : (${clue.row}, ${clue.col})`,
      );
    }

    if (!Number.isInteger(clue.value) || clue.value <= 0) {
      return createInvalidResult(
        `Valeur de clue invalide à la position ` + `(${clue.row}, ${clue.col})`,
      );
    }

    const regionId = coverage[clue.row][clue.col];

    if (regionId === null) {
      return createInvalidResult(
        `Clue situé sur une case non couverte : ` +
          `(${clue.row}, ${clue.col})`,
      );
    }

    if (regionsWithClue.has(regionId)) {
      return createInvalidResult(
        `Plusieurs clues dans le rectangle ${regionId}`,
      );
    }

    const region = regionsById.get(regionId);

    if (!region) {
      return createInvalidResult(
        `Rectangle ${regionId} associé au clue introuvable`,
      );
    }

    const expectedValue = region.width * region.height;

    if (clue.value !== expectedValue) {
      return createInvalidResult(
        `Valeur incorrecte pour le clue du rectangle ${regionId} : ` +
          `${clue.value} au lieu de ${expectedValue}`,
      );
    }

    regionsWithClue.add(regionId);
  }

  if (regionsWithClue.size !== regions.length) {
    const regionWithoutClue = regions.find(
      (region) => !regionsWithClue.has(region.id),
    );

    return createInvalidResult(
      regionWithoutClue
        ? `Aucun clue dans le rectangle ${regionWithoutClue.id}`
        : "Au moins un rectangle ne possède aucun clue",
    );
  }

  return createValidResult();
}

function validateRectangleGridSettings(
  grid: RectangleGrid,
  settings: GeneratorSettings,
): ValidationResult {
  const regionCount = grid.regions.length;

  if (
    regionCount < settings.minimumTargetRegionCount ||
    regionCount > settings.maximumTargetRegionCount
  ) {
    return createInvalidResult(
      `Nombre de rectangles hors cible : ${regionCount} ` +
        `(attendu entre ${settings.minimumTargetRegionCount} ` +
        `et ${settings.maximumTargetRegionCount})`,
    );
  }

  for (const region of grid.regions) {
    const area = region.width * region.height;

    if (area > settings.maxRegionArea) {
      return createInvalidResult(
        `Rectangle ${region.id} trop grand : aire ${area}, ` +
          `maximum autorisé ${settings.maxRegionArea}`,
      );
    }

    if (!settings.allowSingleCellRegions && area === 1) {
      return createInvalidResult(
        `Rectangle 1x1 interdit : rectangle ${region.id}`,
      );
    }
  }

  return createValidResult();
}

export function validateRectangleGrid(
  grid: RectangleGrid,
  settings: GeneratorSettings,
): ValidationResult {
  const structureValidation = validateRectangleGridStructure(grid);

  if (!structureValidation.isValid) {
    return structureValidation;
  }

  const settingsValidation = validateRectangleGridSettings(grid, settings);

  if (!settingsValidation.isValid) {
    return settingsValidation;
  }

  return createValidResult();
}
