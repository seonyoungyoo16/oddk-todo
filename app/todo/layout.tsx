import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";
export const metadata: Metadata = { title: "oddk · 하루 계획", description: "할 일을 모으고 날짜와 시간에 배치하며 목표와 연결하는 하루 계획" };
export default function TodoLayout({ children }: { children: ReactNode }) { return children; }
