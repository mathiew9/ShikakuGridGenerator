type Props = {
  open: boolean;
  title: string;
  message: string;

  confirmLabel?: string;
  cancelLabel?: string;

  showCancel?: boolean;

  onConfirm: () => void;
  onCancel: () => void;
};

export function GridLibraryDialog({
  open,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Annuler",
  showCancel = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="gridLibraryDialogBackdrop" role="presentation">
      <div
        className="gridLibraryDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grid-library-dialog-title"
      >
        <h3 id="grid-library-dialog-title">{title}</h3>

        <p>{message}</p>

        <div className="gridLibraryDialogActions">
          {showCancel && (
            <button
              type="button"
              className="gridLibrarySecondaryButton"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            className="gridLibraryPrimaryButton"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
