import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type {
  GridUniquenessStatus,
  RectangleGrid,
} from "../types/rectangleTypes";
import { GridPreview } from "./GridPreview";
import {
  FaTrashCan,
  FaQuestion,
  FaHourglassHalf,
  FaExclamation,
  FaCheck,
  FaX,
  FaCheckDouble,
  FaWandMagicSparkles,
} from "react-icons/fa6";
import { PiWarningDiamondFill } from "react-icons/pi";

type GridId = RectangleGrid["id"];

type Props = {
  grids: RectangleGrid[];

  onDeleteGrids: (gridIds: GridId[]) => void;

  onMakeUnique: (gridIds: GridId[]) => Promise<void>;

  onSelectionChange?: (gridIds: GridId[]) => void;
};

type StatusBadge = {
  icon: ReactNode;
  title: string;
};

function getStatusBadge(status: GridUniquenessStatus | undefined): StatusBadge {
  switch (status) {
    case "testing":
      return {
        icon: <FaHourglassHalf />,
        title: "Testing...",
      };

    case "unique":
      return {
        icon: <FaCheck style={{ color: "lime" }} />,
        title: "One unique solution",
      };

    case "multiple":
      return {
        icon: <PiWarningDiamondFill style={{ color: "orange" }} />,
        title: "Multiple solutions",
      };

    case "unsolvable":
      return {
        icon: <FaX style={{ color: "red" }} />,
        title: "Unsolvable",
      };

    case "error":
      return {
        icon: <FaExclamation style={{ color: "red" }} />,
        title: "Error",
      };

    case "untested":
    default:
      return {
        icon: <FaQuestion />,
        title: "Untested",
      };
  }
}

export function GridList({
  grids,
  onDeleteGrids,
  onMakeUnique,
  onSelectionChange,
}: Props) {
  const [selectedGridIds, setSelectedGridIds] = useState<Set<GridId>>(
    () => new Set(),
  );

  const availableGridIds = useMemo(
    () => new Set(grids.map((grid) => grid.id)),
    [grids],
  );

  /*
   * Retire automatiquement de la sélection
   * les grilles supprimées.
   */
  useEffect(() => {
    setSelectedGridIds((currentSelection) => {
      const nextSelection = new Set<GridId>();

      for (const gridId of currentSelection) {
        if (availableGridIds.has(gridId)) {
          nextSelection.add(gridId);
        }
      }

      if (nextSelection.size === currentSelection.size) {
        return currentSelection;
      }

      return nextSelection;
    });
  }, [availableGridIds]);

  /*
   * Informe App des grilles actuellement
   * sélectionnées.
   */
  useEffect(() => {
    onSelectionChange?.([...selectedGridIds]);
  }, [selectedGridIds, onSelectionChange]);

  const selectedCount = selectedGridIds.size;

  const unselectedCount = grids.length - selectedCount;

  const allGridsSelected = grids.length > 0 && selectedCount === grids.length;

  const handleToggleGrid = (gridId: GridId, isSelected: boolean) => {
    setSelectedGridIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      if (isSelected) {
        nextSelection.add(gridId);
      } else {
        nextSelection.delete(gridId);
      }

      return nextSelection;
    });
  };

  const handleSelectAll = () => {
    setSelectedGridIds(new Set(grids.map((grid) => grid.id)));
  };

  const handleDeselectAll = () => {
    setSelectedGridIds(new Set());
  };

  const handleDeleteGrid = (gridId: GridId) => {
    setSelectedGridIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      nextSelection.delete(gridId);

      return nextSelection;
    });

    onDeleteGrids([gridId]);
  };

  const handleDeleteUnselected = () => {
    const unselectedGridIds = grids
      .filter((grid) => !selectedGridIds.has(grid.id))
      .map((grid) => grid.id);

    if (unselectedGridIds.length === 0) {
      return;
    }

    onDeleteGrids(unselectedGridIds);
  };

  const handleMakeUnique = () => {
    if (selectedGridIds.size === 0) {
      return;
    }

    void onMakeUnique([...selectedGridIds]);
  };

  return (
    <section className="gridResultsPanel">
      <div className="gridResultsHeader">
        <div className="gridResultsTitle">
          <h2>Grilles générées</h2>

          <span>
            {grids.length === 0
              ? "Aucune grille"
              : `${grids.length} grille${
                  grids.length > 1 ? "s" : ""
                } disponible${
                  grids.length > 1 ? "s" : ""
                } · ${selectedCount} sélectionnée${
                  selectedCount > 1 ? "s" : ""
                }`}
          </span>
        </div>

        <div className="gridResultsActions">
          <button
            type="button"
            className="gridActionButton"
            onClick={handleSelectAll}
            disabled={grids.length === 0 || allGridsSelected}
          >
            <FaCheckDouble />
            Sélectionner tout
          </button>

          <button
            type="button"
            className="gridActionButton"
            onClick={handleDeselectAll}
            disabled={selectedCount === 0}
          >
            Désélectionner
          </button>

          <button
            type="button"
            className="gridActionButton gridActionButtonPrimary"
            onClick={handleMakeUnique}
            disabled={selectedCount === 0}
          >
            <FaWandMagicSparkles />
            Rendre unique ({selectedCount})
          </button>

          <button
            type="button"
            className="gridActionButton gridActionButtonDanger"
            onClick={handleDeleteUnselected}
            disabled={unselectedCount === 0}
          >
            <FaTrashCan />
            Garder la sélection ({unselectedCount} supprimées)
          </button>
        </div>
      </div>

      <div className="gridScrollArea">
        {grids.length === 0 ? (
          <div className="emptyGridState">
            <div className="emptyGridIcon">▦</div>

            <strong>Aucune grille générée</strong>

            <span>Configure les paramètres puis lance une génération.</span>
          </div>
        ) : (
          <div className="gridList">
            {grids.map((grid) => {
              const isSelected = selectedGridIds.has(grid.id);

              const statusBadge = getStatusBadge(grid.uniquenessStatus);

              const shouldSuggestDeletion =
                grid.uniquenessStatus === "unsolvable" ||
                grid.uniquenessStatus === "error";

              const handleCardClick = () => {
                handleToggleGrid(grid.id, !isSelected);
              };

              const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();

                  handleToggleGrid(grid.id, !isSelected);
                }
              };

              return (
                <article
                  key={grid.id}
                  className={`gridCard ${isSelected ? "gridCardSelected" : ""}`}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={handleCardClick}
                  onKeyDown={handleCardKeyDown}
                  title={
                    isSelected
                      ? "Cliquer pour désélectionner cette grille"
                      : "Cliquer pour sélectionner cette grille"
                  }
                >
                  <div className="gridCardHeader">
                    <input
                      type="checkbox"
                      className="gridCardCheckbox"
                      checked={isSelected}
                      aria-label={
                        isSelected
                          ? "Désélectionner cette grille"
                          : "Sélectionner cette grille"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      onChange={(event) => {
                        handleToggleGrid(grid.id, event.target.checked);
                      }}
                    />

                    <span className="gridCardRegionCount">
                      {grid.regions.length} rectangles
                    </span>

                    <div className="gridCardActions">
                      <span
                        className="gridTestStatus"
                        role="img"
                        aria-label={statusBadge.title}
                        title={statusBadge.title}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        {statusBadge.icon}
                      </span>

                      <button
                        type="button"
                        className={`gridDeleteButton ${
                          shouldSuggestDeletion
                            ? "gridDeleteButtonSuggested"
                            : ""
                        }`}
                        aria-label={
                          shouldSuggestDeletion
                            ? "Supprimer cette grille invalide"
                            : "Supprimer cette grille"
                        }
                        title={
                          grid.uniquenessStatus === "unsolvable"
                            ? "Cette grille n’a aucune solution — supprimer"
                            : grid.uniquenessStatus === "error"
                              ? "Le test de cette grille a échoué — supprimer"
                              : "Supprimer cette grille"
                        }
                        onClick={(event) => {
                          event.stopPropagation();

                          handleDeleteGrid(grid.id);
                        }}
                      >
                        <FaTrashCan />
                      </button>
                    </div>
                  </div>

                  <GridPreview grid={grid} />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
