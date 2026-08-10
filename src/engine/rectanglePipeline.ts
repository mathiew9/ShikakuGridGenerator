import { generateRectangleGrid } from "./rectangleGenerator";
import { analyzeRectangleGridUniformity } from "./rectangleUniformity";
import { validateRectangleGrid } from "./rectangleValidator";
import type {
  GeneratorLog,
  GeneratorProgress,
  GeneratorSettings,
  RectangleGrid,
  RectanglePipelineCallbacks,
} from "../types/rectangleTypes";

function createLog(
  level: GeneratorLog["level"],
  message: string,
): GeneratorLog {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level,
    message,
  };
}

function createGridSignature(grid: RectangleGrid): string {
  const sortedClues = [...grid.clues].sort((a, b) => {
    if (a.row !== b.row) {
      return a.row - b.row;
    }

    if (a.col !== b.col) {
      return a.col - b.col;
    }

    return a.value - b.value;
  });

  return sortedClues
    .map((clue) => `${clue.row},${clue.col},${clue.value}`)
    .join("|");
}

function createProgress(
  isRunning: boolean,
  attempts: number,
  accepted: number,
  rejected: number,
  targetCount: number,
  currentStep: string,
  startedAt: number | null,
): GeneratorProgress {
  return {
    isRunning,
    attempts,
    accepted,
    rejected,
    progressPercent:
      targetCount > 0 ? Math.floor((accepted / targetCount) * 100) : 0,
    currentStep,
    startedAt,
  };
}

export async function runRectangleGenerationPipeline(
  settings: GeneratorSettings,
  callbacks: RectanglePipelineCallbacks,
  shouldStop: () => boolean,
): Promise<RectangleGrid[]> {
  const acceptedGrids: RectangleGrid[] = [];
  const seenSignatures = new Set<string>();

  let attempts = 0;
  let rejected = 0;

  let generationRejected = 0;
  let validationRejected = 0;
  let uniformityRejected = 0;
  let duplicateRejected = 0;

  const startedAt = Date.now();

  callbacks.onLog?.(createLog("info", "Génération démarrée."));

  callbacks.onProgress?.(
    createProgress(
      true,
      attempts,
      acceptedGrids.length,
      rejected,
      settings.targetCount,
      "Initialisation",
      startedAt,
    ),
  );

  while (
    acceptedGrids.length < settings.targetCount &&
    attempts < settings.maxAttempts &&
    !shouldStop()
  ) {
    attempts++;

    callbacks.onProgress?.(
      createProgress(
        true,
        attempts,
        acceptedGrids.length,
        rejected,
        settings.targetCount,
        `Tentative ${attempts}`,
        startedAt,
      ),
    );

    const grid = generateRectangleGrid(
      settings.gridSize,
      settings.gridSize,
      settings.maxRegionArea,
      settings.allowSingleCellRegions,
      settings.minimumTargetRegionCount,
      settings.maximumTargetRegionCount,
    );

    if (!grid) {
      rejected++;
      generationRejected++;

      callbacks.onLog?.(
        createLog(
          "warning",
          `Tentative ${attempts} rejetée : génération impossible.`,
        ),
      );

      continue;
    }

    if (settings.enableValidationCheck) {
      const validation = validateRectangleGrid(grid, settings);

      if (!validation.isValid) {
        rejected++;
        validationRejected++;

        callbacks.onLog?.(
          createLog(
            "warning",
            `Tentative ${attempts} rejetée : ${
              validation.reason ?? "validation invalide"
            }.`,
          ),
        );

        continue;
      }
    }

    if (settings.enableUniformityCheck) {
      const uniformity = analyzeRectangleGridUniformity(grid);

      if (!uniformity.accepted) {
        rejected++;
        uniformityRejected++;

        callbacks.onLog?.(
          createLog(
            "warning",
            `Tentative ${attempts} rejetée : ${
              uniformity.reason ?? "uniformité insuffisante"
            }.`,
          ),
        );

        continue;
      }

      grid.stats = uniformity.stats;
    }

    if (settings.rejectDuplicateGrids) {
      const signature = createGridSignature(grid);

      if (seenSignatures.has(signature)) {
        rejected++;
        duplicateRejected++;

        callbacks.onLog?.(
          createLog(
            "warning",
            `Tentative ${attempts} rejetée : doublon détecté.`,
          ),
        );

        continue;
      }

      seenSignatures.add(signature);
    }

    acceptedGrids.push(grid);

    callbacks.onGridAccepted?.(grid);

    callbacks.onLog?.(
      createLog(
        "success",
        `Grille acceptée ${acceptedGrids.length}/${settings.targetCount} (${grid.rows}x${grid.cols}).`,
      ),
    );

    callbacks.onProgress?.(
      createProgress(
        true,
        attempts,
        acceptedGrids.length,
        rejected,
        settings.targetCount,
        "Grille acceptée",
        startedAt,
      ),
    );

    if (attempts % 25 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const wasStopped = shouldStop();

  if (wasStopped) {
    callbacks.onLog?.(
      createLog("info", "Génération arrêtée par l'utilisateur."),
    );
  } else if (acceptedGrids.length >= settings.targetCount) {
    callbacks.onLog?.(createLog("success", "Génération terminée avec succès."));
  } else if (attempts >= settings.maxAttempts) {
    callbacks.onLog?.(
      createLog(
        "warning",
        "Nombre maximum de tentatives atteint avant l'objectif.",
      ),
    );
  }

  /*
   * Bilan de génération.
   */

  callbacks.onLog?.(createLog("info", `Tentatives : ${attempts}`));

  callbacks.onLog?.(
    createLog("success", `Acceptées : ${acceptedGrids.length}`),
  );

  callbacks.onLog?.(createLog("info", `Rejetées : ${rejected}`));

  if (generationRejected > 0) {
    callbacks.onLog?.(
      createLog("warning", `↳ Génération impossible : ${generationRejected}`),
    );
  }

  if (settings.enableValidationCheck) {
    callbacks.onLog?.(
      createLog(
        validationRejected > 0 ? "warning" : "info",
        `↳ Conformité : ${validationRejected}`,
      ),
    );
  }

  if (settings.enableUniformityCheck) {
    callbacks.onLog?.(
      createLog(
        uniformityRejected > 0 ? "warning" : "info",
        `↳ Uniformité : ${uniformityRejected}`,
      ),
    );
  }

  if (settings.rejectDuplicateGrids) {
    callbacks.onLog?.(
      createLog(
        duplicateRejected > 0 ? "warning" : "info",
        `↳ Doublons : ${duplicateRejected}`,
      ),
    );
  }

  callbacks.onProgress?.(
    createProgress(
      false,
      attempts,
      acceptedGrids.length,
      rejected,
      settings.targetCount,
      wasStopped ? "Arrêté" : "Terminé",
      startedAt,
    ),
  );

  return acceptedGrids;
}
