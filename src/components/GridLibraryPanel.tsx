import { useMemo, useRef, useState } from "react";
import type {
  GridSizePreset,
  RectangleGrid,
  RectangleGridLibrary,
} from "../types/rectangleTypes";
import {
  createEmptyGridLibrary,
  downloadGridLibrary,
  getDefaultGridLibraryFileName,
  mergeUniqueGridsIntoLibrary,
  parseGridLibraryText,
} from "../engine/gridLibrary";
import type { GridLibraryMergeResult } from "../engine/gridLibrary";
import { GridLibraryDialog } from "./GridLibraryDialog";
import { FaFileImport, FaX } from "react-icons/fa6";

type Props = {
  selectedGrids: RectangleGrid[];
};

type DialogState = {
  title: string;
  message: string;

  confirmLabel: string;
  cancelLabel?: string;

  showCancel: boolean;

  onConfirm: () => void;
};

export function GridLibraryPanel({ selectedGrids }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /*
   * État du fichier tel qu'il était au dernier import
   * ou au dernier export.
   */
  const [baseLibrary, setBaseLibrary] = useState<RectangleGridLibrary | null>(
    null,
  );

  /*
   * Bibliothèque contenant également les grilles
   * ajoutées mais pas encore exportées.
   */
  const [workingLibrary, setWorkingLibrary] =
    useState<RectangleGridLibrary | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);

  const [lastMergeResult, setLastMergeResult] =
    useState<GridLibraryMergeResult | null>(null);

  const [dialog, setDialog] = useState<DialogState | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const uniqueSelectedGrids = useMemo(
    () => selectedGrids.filter((grid) => grid.uniquenessStatus === "unique"),
    [selectedGrids],
  );

  const selectedUniqueSizes = useMemo(() => {
    return new Set(uniqueSelectedGrids.map((grid) => grid.rows));
  }, [uniqueSelectedGrids]);

  const selectedUniqueGridSize: GridSizePreset | null =
    selectedUniqueSizes.size === 1
      ? ([...selectedUniqueSizes][0] as GridSizePreset)
      : null;

  const existingCount = baseLibrary?.grids.length ?? 0;

  const finalCount = workingLibrary?.grids.length ?? 0;

  const pendingCount =
    workingLibrary && baseLibrary
      ? workingLibrary.grids.length - baseLibrary.grids.length
      : 0;

  /*
   * Comme nous conservons exactement la même référence
   * après import/export, une nouvelle bibliothèque
   * représente des modifications en attente.
   */
  const hasUnsavedChanges =
    workingLibrary !== null &&
    baseLibrary !== null &&
    workingLibrary !== baseLibrary;

  const closeDialog = () => {
    setDialog(null);
  };

  const showInfoDialog = (title: string, message: string) => {
    setDialog({
      title,
      message,
      confirmLabel: "Fermer",
      showCancel: false,
      onConfirm: () => {},
    });
  };

  const clearLibrary = () => {
    setBaseLibrary(null);
    setWorkingLibrary(null);
    setFileName(null);
    setLastMergeResult(null);
  };

  const createNewLibraryFromSelection = (exportImmediately: boolean) => {
    if (uniqueSelectedGrids.length === 0) {
      showInfoDialog(
        "Aucune grille unique",
        "Sélectionne au moins une grille ayant été vérifiée comme solution unique.",
      );

      return;
    }

    if (selectedUniqueGridSize === null) {
      showInfoDialog(
        "Tailles différentes",
        "Les grilles uniques sélectionnées doivent toutes avoir la même taille.",
      );

      return;
    }

    const emptyLibrary = createEmptyGridLibrary(selectedUniqueGridSize);

    const mergeResult = mergeUniqueGridsIntoLibrary(
      emptyLibrary,
      selectedGrids,
    );

    if (!mergeResult.success) {
      showInfoDialog(
        "Impossible de créer le fichier",
        mergeResult.error ?? "Une erreur inconnue est survenue.",
      );

      return;
    }

    const newFileName = getDefaultGridLibraryFileName(selectedUniqueGridSize);

    setFileName(newFileName);

    setLastMergeResult(mergeResult);

    if (exportImmediately) {
      downloadGridLibrary(mergeResult.library, newFileName);

      /*
       * Le fichier vient d'être exporté :
       * il n'y a donc plus de modification en attente.
       */
      setBaseLibrary(mergeResult.library);

      setWorkingLibrary(mergeResult.library);

      return;
    }

    setBaseLibrary(emptyLibrary);

    setWorkingLibrary(mergeResult.library);
  };

  const requestCreateNewLibrary = (exportImmediately: boolean) => {
    if (uniqueSelectedGrids.length === 0) {
      showInfoDialog(
        "Aucune grille unique",
        "Aucun fichier n'est chargé et aucune grille unique n'est sélectionnée.",
      );

      return;
    }

    if (selectedUniqueGridSize === null) {
      showInfoDialog(
        "Tailles différentes",
        "Impossible de créer une bibliothèque avec plusieurs tailles de grille.",
      );

      return;
    }

    const newFileName = getDefaultGridLibraryFileName(selectedUniqueGridSize);

    setDialog({
      title: "Créer une nouvelle bibliothèque",
      message:
        `Aucun fichier n'est chargé.\n\n` +
        `Créer "${newFileName}" avec ` +
        `${uniqueSelectedGrids.length} grille${
          uniqueSelectedGrids.length > 1 ? "s" : ""
        } unique${uniqueSelectedGrids.length > 1 ? "s" : ""} ?`,
      confirmLabel: exportImmediately ? "Créer et exporter" : "Créer",
      cancelLabel: "Annuler",
      showCancel: true,
      onConfirm: () => {
        createNewLibraryFromSelection(exportImmediately);
      },
    });
  };

  const handleImportButtonClick = () => {
    if (hasUnsavedChanges) {
      setDialog({
        title: "Modifications non exportées",
        message:
          "La bibliothèque actuelle contient des modifications qui n'ont pas encore été exportées. Les abandonner et importer un autre fichier ?",
        confirmLabel: "Importer quand même",
        cancelLabel: "Annuler",
        showCancel: true,
        onConfirm: () => {
          fileInputRef.current?.click();
        },
      });

      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    /*
     * Permet de sélectionner à nouveau le même fichier
     * plus tard.
     */
    event.target.value = "";

    if (!file) {
      return;
    }

    let text: string;

    try {
      text = await file.text();
    } catch {
      showInfoDialog("Erreur de lecture", "Impossible de lire ce fichier.");

      return;
    }

    const parseResult = parseGridLibraryText(text);

    if (!parseResult.success) {
      if (uniqueSelectedGrids.length > 0 && selectedUniqueGridSize !== null) {
        setDialog({
          title: "Fichier invalide",
          message:
            `${parseResult.error}\n\n` +
            "Créer plutôt une nouvelle bibliothèque avec les grilles uniques sélectionnées ?",
          confirmLabel: "Créer un nouveau fichier",
          cancelLabel: "Fermer",
          showCancel: true,
          onConfirm: () => {
            createNewLibraryFromSelection(false);
          },
        });

        return;
      }

      showInfoDialog("Fichier invalide", parseResult.error);

      return;
    }

    setBaseLibrary(parseResult.library);

    setWorkingLibrary(parseResult.library);

    setFileName(file.name);

    setLastMergeResult(null);
  };

  const handleAddSelected = () => {
    if (selectedGrids.length === 0) {
      showInfoDialog(
        "Aucune sélection",
        "Sélectionne les grilles que tu veux ajouter à la bibliothèque.",
      );

      return;
    }

    if (uniqueSelectedGrids.length === 0) {
      showInfoDialog(
        "Aucune grille unique",
        "Seules les grilles vérifiées comme ayant une solution unique peuvent être ajoutées.",
      );

      return;
    }

    if (!workingLibrary) {
      requestCreateNewLibrary(false);
      return;
    }

    const mergeResult = mergeUniqueGridsIntoLibrary(
      workingLibrary,
      selectedGrids,
    );

    setLastMergeResult(mergeResult);

    if (!mergeResult.success) {
      showInfoDialog(
        "Impossible d'ajouter les grilles",
        mergeResult.error ?? "Une erreur inconnue est survenue.",
      );

      return;
    }

    setWorkingLibrary(mergeResult.library);
    setSuccessMessage(
      `${mergeResult.addedCount} grille${
        mergeResult.addedCount > 1 ? "s" : ""
      } ajoutée${mergeResult.addedCount > 1 ? "s" : ""} à la bibliothèque.`,
    );

    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  };

  const handleUndoPendingChanges = () => {
    if (!baseLibrary || !hasUnsavedChanges) {
      return;
    }

    setWorkingLibrary(baseLibrary);

    setLastMergeResult(null);
  };

  const handleRemoveLibrary = () => {
    if (!workingLibrary) {
      return;
    }

    if (hasUnsavedChanges) {
      setDialog({
        title: "Retirer la bibliothèque",
        message:
          "Des modifications n'ont pas encore été exportées. Retirer quand même le fichier actuellement chargé ?",
        confirmLabel: "Retirer",
        cancelLabel: "Annuler",
        showCancel: true,
        onConfirm: clearLibrary,
      });

      return;
    }

    clearLibrary();
  };

  const handleExport = () => {
    if (!workingLibrary) {
      requestCreateNewLibrary(true);
      return;
    }

    const exportFileName =
      fileName ?? getDefaultGridLibraryFileName(workingLibrary.gridSize);

    downloadGridLibrary(workingLibrary, exportFileName);

    /*
     * Après téléchargement, l'état actuel devient
     * notre nouvelle référence.
     */
    setBaseLibrary(workingLibrary);

    setLastMergeResult(null);
  };

  const handleDialogConfirm = () => {
    const action = dialog?.onConfirm;

    closeDialog();

    action?.();
  };

  return (
    <>
      <section className="gridLibraryPanel">
        <div className="gridLibraryHeader">
          <div>
            <h2>Bibliothèque</h2>

            <span>Sauvegarde des grilles uniques</span>
          </div>
        </div>

        <div className="gridLibraryFile">
          <div className="gridLibraryFileInfo">
            <span className="gridLibraryLabel">Fichier</span>

            <strong
              className={fileName ? "" : "gridLibraryNoFile"}
              title={fileName ?? "Aucun fichier chargé"}
            >
              {fileName ?? "Aucun fichier chargé"}
            </strong>
          </div>

          <div className="gridLibraryFileActions">
            {!workingLibrary ? (
              <button
                type="button"
                className="gridLibraryIconButton"
                onClick={handleImportButtonClick}
                aria-label="Importer un fichier"
                title="Importer un fichier"
              >
                <FaFileImport />
              </button>
            ) : (
              <button
                type="button"
                className="gridLibraryIconButton"
                onClick={handleRemoveLibrary}
                aria-label="Retirer le fichier"
                title="Retirer le fichier"
              >
                <FaX />
              </button>
            )}
          </div>
        </div>

        {workingLibrary ? (
          <div className="gridLibraryStats">
            <div>
              <span>Taille</span>
              <strong>
                {workingLibrary.gridSize}×{workingLibrary.gridSize}
              </strong>
            </div>

            <div>
              <span>Version</span>
              <strong>v{workingLibrary.version}</strong>
            </div>

            <div>
              <span>Existantes</span>
              <strong>{existingCount}</strong>
            </div>

            <div>
              <span>À ajouter</span>
              <strong>{pendingCount}</strong>
            </div>

            <div>
              <span>Total final</span>
              <strong>{finalCount}</strong>
            </div>

            <div>
              <span>Doublons</span>
              <strong>{lastMergeResult?.duplicateCount ?? 0}</strong>
            </div>
          </div>
        ) : (
          <div className="gridLibraryEmptyInfo">
            <span>
              {selectedGrids.length} grille
              {selectedGrids.length !== 1 ? "s" : ""} sélectionnée
              {selectedGrids.length !== 1 ? "s" : ""}
            </span>

            <strong>
              {uniqueSelectedGrids.length} unique
              {uniqueSelectedGrids.length !== 1 ? "s" : ""}
            </strong>
          </div>
        )}

        {lastMergeResult && lastMergeResult.ignoredNotUniqueCount > 0 && (
          <div className="gridLibraryNotice">
            {lastMergeResult.ignoredNotUniqueCount} grille
            {lastMergeResult.ignoredNotUniqueCount > 1 ? "s" : ""} non unique
            {lastMergeResult.ignoredNotUniqueCount > 1 ? "s" : ""} ignorée
            {lastMergeResult.ignoredNotUniqueCount > 1 ? "s" : ""}.
          </div>
        )}
        {successMessage && (
          <div className="gridLibrarySuccess">{successMessage}</div>
        )}
        {hasUnsavedChanges && (
          <div className="gridLibraryDirty">Modifications non exportées</div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="gridLibraryFileInput"
          onChange={handleFileChange}
        />

        <div className="gridLibraryActions">
          <button
            type="button"
            className="gridLibraryFullButton"
            onClick={handleAddSelected}
            disabled={selectedGrids.length === 0}
          >
            Ajouter sélectionnées
          </button>

          <button
            type="button"
            className="gridLibrarySecondaryButton gridLibraryFullButton"
            onClick={handleUndoPendingChanges}
            disabled={!hasUnsavedChanges}
          >
            Annuler les ajouts
          </button>

          <button
            type="button"
            className="gridLibraryPrimaryButton gridLibraryFullButton"
            onClick={handleExport}
          >
            {workingLibrary
              ? `Exporter ${
                  fileName ??
                  getDefaultGridLibraryFileName(workingLibrary.gridSize)
                }`
              : "Créer / exporter"}
          </button>
        </div>
      </section>

      <GridLibraryDialog
        open={dialog !== null}
        title={dialog?.title ?? ""}
        message={dialog?.message ?? ""}
        confirmLabel={dialog?.confirmLabel ?? "OK"}
        cancelLabel={dialog?.cancelLabel ?? "Annuler"}
        showCancel={dialog?.showCancel ?? false}
        onConfirm={handleDialogConfirm}
        onCancel={closeDialog}
      />
    </>
  );
}
