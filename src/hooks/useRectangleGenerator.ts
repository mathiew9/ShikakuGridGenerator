import { useCallback, useRef, useState } from "react";
import { runRectangleGenerationPipeline } from "../engine/rectanglePipeline";
import { makeRectangleGridUnique } from "../engine/rectangleUniqueness";
import type {
  GeneratorLog,
  GeneratorProgress,
  GeneratorSettings,
  RectangleGrid,
} from "../types/rectangleTypes";

const DEFAULT_PROGRESS: GeneratorProgress = {
  isRunning: false,
  attempts: 0,
  accepted: 0,
  rejected: 0,
  progressPercent: 0,
  currentStep: "En attente",
  startedAt: null,
};

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

export function useRectangleGenerator() {
  const [generatedGrids, setGeneratedGrids] = useState<RectangleGrid[]>([]);
  const [logs, setLogs] = useState<GeneratorLog[]>([]);
  const [progress, setProgress] = useState<GeneratorProgress>(DEFAULT_PROGRESS);

  const shouldStopRef = useRef(false);

  const addLog = useCallback((log: GeneratorLog) => {
    setLogs((previousLogs) => {
      const nextLogs = [...previousLogs, log];

      if (nextLogs.length > 500) {
        return nextLogs.slice(nextLogs.length - 500);
      }

      return nextLogs;
    });
  }, []);

  const startGeneration = useCallback(
    async (settings: GeneratorSettings) => {
      shouldStopRef.current = false;

      setGeneratedGrids([]);
      setLogs([]);
      setProgress({
        ...DEFAULT_PROGRESS,
        isRunning: true,
        currentStep: "Préparation",
        startedAt: Date.now(),
      });

      const acceptedGrids = await runRectangleGenerationPipeline(
        settings,
        {
          onProgress: (nextProgress) => {
            setProgress(nextProgress);
          },

          onLog: (log) => {
            addLog(log);
          },

          onGridAccepted: (grid) => {
            setGeneratedGrids((previousGrids) => [...previousGrids, grid]);
          },
        },
        () => shouldStopRef.current,
      );

      return acceptedGrids;
    },
    [addLog],
  );

  const stopGeneration = useCallback(() => {
    shouldStopRef.current = true;
  }, []);

  const clearResults = useCallback(() => {
    shouldStopRef.current = false;

    setGeneratedGrids([]);
    setLogs([]);
    setProgress(DEFAULT_PROGRESS);
  }, []);

  const deleteGrids = useCallback(
    (gridIds: string[]) => {
      if (gridIds.length === 0) {
        return;
      }

      const gridIdsToDelete = new Set(gridIds);

      setGeneratedGrids((currentGrids) =>
        currentGrids.filter((grid) => !gridIdsToDelete.has(grid.id)),
      );

      addLog(
        createLog(
          "action",
          `${gridIds.length} grille${
            gridIds.length > 1 ? "s" : ""
          } supprimée${gridIds.length > 1 ? "s" : ""}.`,
        ),
      );
    },
    [addLog],
  );

  const makeGridsUnique = useCallback(
    async (gridIds: string[]): Promise<void> => {
      if (gridIds.length === 0) {
        return;
      }

      const selectedIds = new Set(gridIds);

      const gridsToProcess = generatedGrids.filter((grid) => {
        if (!selectedIds.has(grid.id)) {
          return false;
        }

        const status = grid.uniquenessStatus ?? "untested";

        /*
         * Les grilles ayant déjà reçu un résultat
         * ne sont pas vérifiées une deuxième fois.
         */
        return status !== "unique" && status !== "testing";
      });

      const skippedCount = gridIds.length - gridsToProcess.length;

      if (gridsToProcess.length === 0) {
        addLog(
          createLog(
            "info",
            "Toutes les grilles sélectionnées ont déjà été vérifiées.",
          ),
        );

        return;
      }

      const processingIds = new Set(gridsToProcess.map((grid) => grid.id));

      setGeneratedGrids((currentGrids) =>
        currentGrids.map((grid) =>
          processingIds.has(grid.id)
            ? {
                ...grid,
                uniquenessStatus: "testing",
              }
            : grid,
        ),
      );

      addLog(
        createLog(
          "info",
          `Vérification de ${gridsToProcess.length} grille${
            gridsToProcess.length > 1 ? "s" : ""
          } sélectionnée${gridsToProcess.length > 1 ? "s" : ""}.`,
        ),
      );

      if (skippedCount > 0) {
        addLog(
          createLog(
            "info",
            `${skippedCount} grille${
              skippedCount > 1 ? "s" : ""
            } déjà vérifiée${
              skippedCount > 1 ? "s" : ""
            } ignorée${skippedCount > 1 ? "s" : ""}.`,
          ),
        );
      }

      /*
       * Permet à React d’afficher le statut "testing"
       * avant de démarrer les calculs.
       */
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      let uniqueCount = 0;
      let repairedCount = 0;
      let multipleCount = 0;
      let unsolvableCount = 0;
      let errorCount = 0;

      for (let index = 0; index < gridsToProcess.length; index++) {
        const grid = gridsToProcess[index];
        const displayedIndex = index + 1;
        const totalCount = gridsToProcess.length;

        try {
          const result = await makeRectangleGridUnique(grid);

          setGeneratedGrids((currentGrids) =>
            currentGrids.map((currentGrid) =>
              currentGrid.id === grid.id ? result.grid : currentGrid,
            ),
          );

          switch (result.status) {
            case "unique": {
              uniqueCount++;

              if (result.changed) {
                repairedCount++;

                addLog(
                  createLog(
                    "success",
                    `Grille ${displayedIndex}/${totalCount} rendue unique après ${
                      result.repairAttempts
                    } variante${result.repairAttempts > 1 ? "s" : ""}.`,
                  ),
                );
              } else {
                addLog(
                  createLog(
                    "success",
                    `Grille ${displayedIndex}/${totalCount} : solution unique.`,
                  ),
                );
              }

              break;
            }

            case "multiple": {
              multipleCount++;

              addLog(
                createLog(
                  "warning",
                  `Grille ${displayedIndex}/${totalCount} : plusieurs solutions${
                    result.reason ? ` — ${result.reason}` : ""
                  }.`,
                ),
              );

              break;
            }

            case "unsolvable": {
              unsolvableCount++;

              addLog(
                createLog(
                  "error",
                  `Grille ${displayedIndex}/${totalCount} : aucune solution.`,
                ),
              );

              break;
            }

            case "error":
            default: {
              errorCount++;

              addLog(
                createLog(
                  "error",
                  `Grille ${displayedIndex}/${totalCount} : ${
                    result.reason ?? "erreur pendant la vérification"
                  }.`,
                ),
              );

              break;
            }
          }
        } catch (error) {
          errorCount++;

          setGeneratedGrids((currentGrids) =>
            currentGrids.map((currentGrid) =>
              currentGrid.id === grid.id
                ? {
                    ...currentGrid,
                    uniquenessStatus: "error",
                  }
                : currentGrid,
            ),
          );

          addLog(
            createLog(
              "error",
              `Erreur pendant la vérification de la grille ${displayedIndex}/${totalCount} : ${
                error instanceof Error ? error.message : "erreur inconnue"
              }.`,
            ),
          );
        }

        /*
         * Rend brièvement la main au navigateur entre
         * deux grilles pour mettre à jour l’interface.
         */
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }

      addLog(createLog("info", "Bilan de la vérification d’unicité :"));

      addLog(createLog("success", `Solutions uniques : ${uniqueCount}`));

      addLog(
        createLog(
          repairedCount > 0 ? "success" : "info",
          `↳ Rendues uniques : ${repairedCount}`,
        ),
      );

      addLog(
        createLog(
          multipleCount > 0 ? "warning" : "info",
          `Plusieurs solutions : ${multipleCount}`,
        ),
      );

      addLog(
        createLog(
          unsolvableCount > 0 ? "error" : "info",
          `Sans solution : ${unsolvableCount}`,
        ),
      );

      addLog(
        createLog(errorCount > 0 ? "error" : "info", `Erreurs : ${errorCount}`),
      );

      if (skippedCount > 0) {
        addLog(
          createLog("info", `Déjà vérifiées et ignorées : ${skippedCount}`),
        );
      }
    },
    [addLog, generatedGrids],
  );

  return {
    generatedGrids,
    logs,
    progress,
    startGeneration,
    stopGeneration,
    clearResults,
    deleteGrids,
    makeGridsUnique,
  };
}
