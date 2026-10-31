import { HiOutlineXMark } from "react-icons/hi2";

type DialogHeaderProps = {
  id: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  disabled?: boolean;
};

/** Shared markup and accessible close control; dialog state belongs to its caller. */
export function DialogHeader({ id, title, closeLabel, onClose, disabled = false }: DialogHeaderProps) {
  return <header className="oddk-dialogHeader">
    <h2 id={id}>{title}</h2>
    <button type="button" aria-label={closeLabel} disabled={disabled} onClick={onClose}><HiOutlineXMark aria-hidden="true" /></button>
  </header>;
}
