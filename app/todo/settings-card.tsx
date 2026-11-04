import type { ReactNode } from "react";

export function SettingsCard({ title, description, children, className = "" }: {
  title?: string; description?: string; children: ReactNode; className?: string;
}) {
  return <section className={`oddk-settingsCard ${className}`}>
    {(title || description) && <header className="oddk-settingsCardHeading">
      {title && <h2>{title}</h2>}{description && <p>{description}</p>}
    </header>}
    {children}
  </section>;
}
