export type GridSizePreset = 5 | 10 | 15 | 20 | 25;

export type CellPosition = {
  row: number;
  col: number;
};

export type RectangleRegion = {
  id: number;
  row: number;
  col: number;
  width: number;
  height: number;
};

export type RectangleClue = {
  row: number;
  col: number;
  value: number;
};

export type RectangleGridStats = {
  regionCount: number;
  minArea: number;
  maxArea: number;
  averageArea: number;
  singleCellCount: number;
  horizontalCount: number;
  verticalCount: number;
};

export type RectangleQualityReport = {
  accepted: boolean;
  score: number;
  hardFailures: string[];
  warnings: string[];
  areaCounts: Record<number, number>;
  distributionDistance: number;
  regionCount: number;
  bigRegionCount: number;
  veryLongRegionCount: number;
  generationDurationMs: number;
};

export type RectangleGrid = {
  id: string;
  rows: number;
  cols: number;
  clues: RectangleClue[];
  regions: RectangleRegion[];
  stats: RectangleGridStats;
  targetRegionCount: number;
  seed?: number;
  quality?: RectangleQualityReport;
  uniquenessStatus?: GridUniquenessStatus;
};

export type GeneratorSettings = {
  gridSize: GridSizePreset;
  targetCount: number;
  maxAttempts: number;
  enableValidationCheck: boolean;
  enableUniformityCheck: boolean;
  rejectDuplicateGrids: boolean;
  allowSingleCellRegions: boolean;
  maxRegionArea: number;
  minimumTargetRegionCount: number;
  maximumTargetRegionCount: number;
};

export type GeneratorProgress = {
  isRunning: boolean;
  attempts: number;
  accepted: number;
  rejected: number;
  progressPercent: number;
  currentStep: string;
  startedAt: number | null;
};

export type LogLevel = "info" | "success" | "warning" | "error" | "action";

export type GeneratorLog = {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
};

export type ValidationResult = {
  isValid: boolean;
  reason: string | null;
};

export type UniformityResult = {
  accepted: boolean;
  reason: string | null;
  stats: RectangleGridStats;
  quality?: RectangleQualityReport;
};

export type RectanglePipelineCallbacks = {
  onProgress?: (progress: GeneratorProgress) => void;
  onLog?: (log: GeneratorLog) => void;
  onGridAccepted?: (grid: RectangleGrid) => void;
};

export type GridUniquenessStatus =
  | "untested"
  | "testing"
  | "unique"
  | "multiple"
  | "unsolvable"
  | "error";

/* =========================================================
   BIBLIOTHÈQUE DE GRILLES
   ========================================================= */

export type StoredRectangleGrid = {
  id: string;
  clues: RectangleClue[];
  regions: RectangleRegion[];
};

export type RectangleGridLibrary = {
  format: "nin9hub-rectangle-library";
  version: 1;

  /*
   * Tous les puzzles présents dans ce fichier ont été
   * vérifiés comme possédant une solution unique.
   */
  uniquenessVerified: true;

  gridSize: GridSizePreset;

  grids: StoredRectangleGrid[];
};
