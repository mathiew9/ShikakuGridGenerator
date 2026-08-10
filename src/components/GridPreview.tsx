import type { RectangleGrid, RectangleRegion } from "../types/rectangleTypes";

type Props = {
  grid: RectangleGrid;
};

function findRegionForCell(
  regions: RectangleRegion[],
  row: number,
  col: number,
): RectangleRegion | undefined {
  return regions.find(
    (region) =>
      row >= region.row &&
      row < region.row + region.height &&
      col >= region.col &&
      col < region.col + region.width,
  );
}

function getPreviewSize(rows: number, cols: number): number {
  const maxDimension = Math.max(rows, cols);

  if (maxDimension <= 5) {
    return 220;
  }

  if (maxDimension <= 10) {
    return 260;
  }

  if (maxDimension <= 15) {
    return 320;
  }

  if (maxDimension <= 20) {
    return 360;
  }

  return 420;
}

function getFontSize(rows: number, cols: number): number {
  const maxDimension = Math.max(rows, cols);

  if (maxDimension <= 5) {
    return 16;
  }

  if (maxDimension <= 10) {
    return 12;
  }

  if (maxDimension <= 15) {
    return 10;
  }

  if (maxDimension <= 20) {
    return 8;
  }

  return 7;
}

export function GridPreview({ grid }: Props) {
  const { rows, cols, clues, regions } = grid;

  const previewSize = getPreviewSize(rows, cols);
  const fontSize = getFontSize(rows, cols);

  return (
    <div
      className="gridPreviewWrapper"
      style={{
        width: `${previewSize}px`,
        maxWidth: "100%",
      }}
    >
      <div
        className="gridPreview"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          fontSize: `${fontSize}px`,
        }}
      >
        {Array.from({ length: rows * cols }).map((_, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;

          const clue = clues.find(
            (candidate) => candidate.row === row && candidate.col === col,
          );

          const region = findRegionForCell(regions, row, col);

          const isTopEdge = region ? row === region.row : false;

          const isBottomEdge = region
            ? row === region.row + region.height - 1
            : false;

          const isLeftEdge = region ? col === region.col : false;

          const isRightEdge = region
            ? col === region.col + region.width - 1
            : false;

          return (
            <div
              key={index}
              className="cell"
              style={{
                borderTop: isTopEdge
                  ? "2px solid #f8fafc"
                  : "1px solid #334155",
                borderBottom: isBottomEdge
                  ? "2px solid #f8fafc"
                  : "1px solid #334155",
                borderLeft: isLeftEdge
                  ? "2px solid #f8fafc"
                  : "1px solid #334155",
                borderRight: isRightEdge
                  ? "2px solid #f8fafc"
                  : "1px solid #334155",
              }}
            >
              {clue ? clue.value : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}
