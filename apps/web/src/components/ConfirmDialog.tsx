import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Sicherheitsabfrage für kritische Aktionen (Spieler entfernen, Match abbrechen, ...). */
export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog" onCancel={onCancel} aria-labelledby="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
