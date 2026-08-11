import { useCallback, useMemo, useState } from "react";
import "./styles/index.css";

import { GeneratorForm } from "./components/GeneratorForm";
import { GridList } from "./components/GridList";
import { GridLibraryPanel } from "./components/GridLibraryPanel";
import { LogPanel } from "./components/LogPanel";
import { useRectangleGenerator } from "./hooks/useRectangleGenerator";

import type { GeneratorSettings, RectangleGrid } from "./types/rectangleTypes";

const DEFAULT_SETTINGS: GeneratorSettings = {
  gridSize: 5,
  targetCount: 10,
  maxAttempts: 500,
  enableValidationCheck: true,
  enableUniformityCheck: true,
  rejectDuplicateGrids: true,
  allowSingleCellRegions: false,
  maxRegionArea: 6,
  minimumTargetRegionCount: 9,
  maximumTargetRegionCount: 10,
};

function App() {
  const [selectedGridIds, setSelectedGridIds] = useState<string[]>([]);

  const [areLogsCollapsed, setAreLogsCollapsed] = useState(true);

  const {
    generatedGrids,
    logs,
    progress,
    startGeneration,
    clearResults,
    deleteGrids,
    makeGridsUnique,
  } = useRectangleGenerator();

  const selectedGrids = useMemo<RectangleGrid[]>(() => {
    const selectedIds = new Set(selectedGridIds);

    return generatedGrids.filter((grid) => selectedIds.has(grid.id));
  }, [generatedGrids, selectedGridIds]);

  const handleSelectionChange = useCallback((gridIds: string[]) => {
    setSelectedGridIds(gridIds);
  }, []);

  const handleGenerate = async (settings: GeneratorSettings) => {
    setSelectedGridIds([]);

    await startGeneration(settings);
  };

  const handleClear = () => {
    setSelectedGridIds([]);

    clearResults();
  };

  return (
    <main
      className={`generatorApp ${
        areLogsCollapsed
          ? "generatorAppLogsCollapsed"
          : "generatorAppLogsExpanded"
      }`}
    >
      <header className="appHeader">
        <div className="appHeaderContent">
          <div>
            <h1>Rectangle Generator</h1>

            <p>Génération locale de grilles avec validation et aperçu.</p>
          </div>

          <div className="headerStat">
            <strong>{generatedGrids.length}</strong> grilles
          </div>
        </div>

        <LogPanel
          logs={logs}
          isCollapsed={areLogsCollapsed}
          onToggleCollapse={() =>
            setAreLogsCollapsed((currentValue) => !currentValue)
          }
        />
      </header>

      <aside className="generatorSidebar">
        <GeneratorForm
          defaultSettings={DEFAULT_SETTINGS}
          isRunning={progress.isRunning}
          onGenerate={handleGenerate}
          onClear={handleClear}
          hasResults={generatedGrids.length > 0 || logs.length > 0}
        />

        <GridLibraryPanel selectedGrids={selectedGrids} />
      </aside>

      <section className="generatorWorkspace">
        <GridList
          grids={generatedGrids}
          onDeleteGrids={deleteGrids}
          onMakeUnique={makeGridsUnique}
          onSelectionChange={handleSelectionChange}
        />
      </section>
    </main>
  );
}

export default App;
