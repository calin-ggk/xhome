import './ConfirmModal.css';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: 'is-danger' | 'is-primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ isOpen, title, message, confirmLabel, cancelLabel, confirmVariant = 'is-danger', onConfirm, onCancel }: Props) {
  if (!isOpen) return null;
  return (
    <div className="modal is-active">
      <div className="modal-background" onClick={onCancel} />
      <div className="modal-card confirm-modal">
        <header className="modal-card-head">
          <p className="modal-card-title">{title}</p>
          <button type="button" className="delete" onClick={onCancel} />
        </header>
        <section className="modal-card-body">
          <p>{message}</p>
        </section>
        <footer className="modal-card-foot">
          <button type="button" className={`button ${confirmVariant}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="button" onClick={onCancel}>
            {cancelLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
