import type { ReactNode } from "react";

export function TaskListBody({ children }: { children: ReactNode }) {
  return <div className="oddk-taskListScroll" role="region" aria-label="할 일 목록 스크롤" tabIndex={0}><ul className="oddk-taskList">{children}</ul></div>;
}
