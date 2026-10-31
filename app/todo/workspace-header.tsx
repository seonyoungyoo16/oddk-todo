import type { ReactNode } from "react";

export function WorkspaceHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="oddk-pageHeader">
    <h1 id="workspace-title">{title}</h1>
    {actions && <div className="oddk-pageHeaderActions">{actions}</div>}
    {description && <p className="oddk-pageDescription">{description}</p>}
  </header>;
}
