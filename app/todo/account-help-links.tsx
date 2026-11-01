import type { ReactNode } from "react";

export function AccountHelpLinks({ children }: { children?: ReactNode }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return <nav className="oddk-accountHelpLinks" aria-label="개인정보 및 지원">
    <a href={`${base}/privacy/`}>개인정보처리방침</a>
    <a href={`${base}/support/`}>지원·문의</a>
    {children}
  </nav>;
}
