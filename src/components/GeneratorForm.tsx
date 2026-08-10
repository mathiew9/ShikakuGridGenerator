import { useState } from "react";
import RangeSliderImport from "react-range-slider-input";
import "react-range-slider-input/dist/style.css";

import { GRID_PRESETS, GRID_SIZE_OPTIONS } from "../config/gridPresets";
import type {
  GeneratorSettings,
  GridSizePreset,
} from "../types/rectangleTypes";

const RangeSlider =
  (
    RangeSliderImport as unknown as {
      default?: typeof RangeSliderImport;
    }
  ).default ?? RangeSliderImport;

type GeneratorFormProps = {
  defaultSettings: GeneratorSettings;
  isRunning: boolean;
  hasResults: boolean;
  onGenerate: (settings: GeneratorSettings) => Promise<void> | void;
  onClear: () => void;
};

export function GeneratorForm({
  defaultSettings,
  isRunning,
  hasResults,
  onGenerate,
  onClear,
}: GeneratorFormProps) {
  const [settings, setSettings] = useState<GeneratorSettings>(defaultSettings);

  const currentPreset = GRID_PRESETS[settings.gridSize];

  const defaultMaxRegionArea = currentPreset.defaultMaxRegionArea;
  const defaultMinimumTargetRegionCount =
    currentPreset.defaultMinimumRegionCount;
  const defaultMaximumTargetRegionCount =
    currentPreset.defaultMaximumRegionCount;

  const handleGridSizeChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const gridSize = Number(event.target.value) as GridSizePreset;
    const preset = GRID_PRESETS[gridSize];

    setSettings((previous) => ({
      ...previous,
      gridSize,
      maxRegionArea: preset.defaultMaxRegionArea,
      minimumTargetRegionCount: preset.defaultMinimumRegionCount,
      maximumTargetRegionCount: preset.defaultMaximumRegionCount,
    }));
  };

  const handleNumberChange =
    (key: keyof GeneratorSettings) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);

      setSettings((previous) => ({
        ...previous,
        [key]: value,
      }));
    };

  const handleCheckboxChange =
    (key: keyof GeneratorSettings) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;

      setSettings((previous) => ({
        ...previous,
        [key]: checked,
      }));
    };

  const handleResetMaxRegionArea = () => {
    setSettings((previous) => ({
      ...previous,
      maxRegionArea: GRID_PRESETS[previous.gridSize].defaultMaxRegionArea,
    }));
  };

  const handleResetTargetRegionCountRange = () => {
    setSettings((previous) => {
      const preset = GRID_PRESETS[previous.gridSize];

      return {
        ...previous,
        minimumTargetRegionCount: preset.defaultMinimumRegionCount,
        maximumTargetRegionCount: preset.defaultMaximumRegionCount,
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isRunning) {
      return;
    }

    const preset = GRID_PRESETS[settings.gridSize];

    const minimumTargetRegionCount =
      settings.minimumTargetRegionCount || preset.defaultMinimumRegionCount;

    const maximumTargetRegionCount = Math.max(
      minimumTargetRegionCount,
      settings.maximumTargetRegionCount || preset.defaultMaximumRegionCount,
    );

    await onGenerate({
      ...settings,
      maxRegionArea: settings.maxRegionArea || preset.defaultMaxRegionArea,
      minimumTargetRegionCount,
      maximumTargetRegionCount,
    });
  };

  return (
    <section className="generatorSettings">
      <div className="sidebarTitle">
        <h2>Paramètres</h2>
        <span>Configuration de la génération</span>
      </div>

      <form className="generatorForm" onSubmit={handleSubmit}>
        <div className="formTopRow">
          <label className="field">
            <span>Taille</span>

            <select
              value={settings.gridSize}
              onChange={handleGridSizeChange}
              disabled={isRunning}
            >
              {GRID_SIZE_OPTIONS.map((preset) => (
                <option key={preset.size} value={preset.size}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="numberLabel">Nb de grilles</span>

            <input
              type="number"
              min={1}
              max={1000}
              value={settings.targetCount}
              onChange={handleNumberChange("targetCount")}
              disabled={isRunning}
            />
          </label>

          <label className="field">
            <span className="numberLabel">Max tentatives</span>

            <input
              type="number"
              min={1}
              max={100000}
              value={settings.maxAttempts}
              onChange={handleNumberChange("maxAttempts")}
              disabled={isRunning}
            />
          </label>
        </div>

        <div className="field">
          <div className="sliderHeader">
            <span>
              Aire maximale : <strong>{settings.maxRegionArea}</strong>
            </span>

            <button
              className="smallButton"
              type="button"
              onClick={handleResetMaxRegionArea}
              disabled={isRunning}
            >
              Défaut ({defaultMaxRegionArea})
            </button>
          </div>

          <input
            type="range"
            min={1}
            max={currentPreset.sliderMaxRegionArea}
            value={settings.maxRegionArea}
            onChange={handleNumberChange("maxRegionArea")}
            disabled={isRunning}
          />
        </div>

        <div className="field">
          <div className="sliderHeader">
            <span>
              Rectangles ciblés :{" "}
              <strong>
                {settings.minimumTargetRegionCount} –{" "}
                {settings.maximumTargetRegionCount}
              </strong>
            </span>

            <button
              className="smallButton"
              type="button"
              onClick={handleResetTargetRegionCountRange}
              disabled={isRunning}
            >
              Défaut ({defaultMinimumTargetRegionCount}–
              {defaultMaximumTargetRegionCount})
            </button>
          </div>

          <RangeSlider
            className="targetRegionRange"
            min={currentPreset.minimumRegionCount}
            max={currentPreset.sliderMaxTargetRegionCount}
            step={1}
            value={[
              settings.minimumTargetRegionCount,
              settings.maximumTargetRegionCount,
            ]}
            disabled={isRunning}
            ariaLabel={[
              "Nombre minimum de rectangles",
              "Nombre maximum de rectangles",
            ]}
            onInput={(values) => {
              const [minimumTargetRegionCount, maximumTargetRegionCount] =
                values;

              if (
                minimumTargetRegionCount === undefined ||
                maximumTargetRegionCount === undefined
              ) {
                return;
              }

              setSettings((previous) => ({
                ...previous,
                minimumTargetRegionCount,
                maximumTargetRegionCount,
              }));
            }}
          />
        </div>

        <div className="checkboxList">
          <label className="checkboxField">
            <input
              type="checkbox"
              checked={settings.enableValidationCheck}
              onChange={handleCheckboxChange("enableValidationCheck")}
              disabled={isRunning}
            />

            <span>Vérifier la conformité</span>
          </label>

          <label className="checkboxField">
            <input
              type="checkbox"
              checked={settings.enableUniformityCheck}
              onChange={handleCheckboxChange("enableUniformityCheck")}
              disabled={isRunning}
            />

            <span>Vérifier l’uniformité</span>
          </label>

          <label className="checkboxField">
            <input
              type="checkbox"
              checked={settings.rejectDuplicateGrids}
              onChange={handleCheckboxChange("rejectDuplicateGrids")}
              disabled={isRunning}
            />

            <span>Rejeter les doublons</span>
          </label>

          <label className="checkboxField">
            <input
              type="checkbox"
              checked={settings.allowSingleCellRegions}
              onChange={handleCheckboxChange("allowSingleCellRegions")}
              disabled={isRunning}
            />

            <span>Autoriser les rectangles 1×1</span>
          </label>
        </div>

        <div className="formActions">
          <button className="primaryButton" type="submit" disabled={isRunning}>
            {isRunning ? "Génération…" : "Générer"}
          </button>

          <button
            className="secondaryButton"
            type="button"
            onClick={onClear}
            disabled={isRunning || !hasResults}
          >
            Effacer les grilles
          </button>
        </div>
      </form>
    </section>
  );
}
