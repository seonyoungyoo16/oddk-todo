import { HiOutlineArrowLeft } from "react-icons/hi2";

export function BackButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="oddk-backButton" aria-label={label} title={label} disabled={disabled} onClick={onClick}><HiOutlineArrowLeft aria-hidden="true" /></button>;
}
