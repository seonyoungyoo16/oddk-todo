import type { ComponentPropsWithoutRef } from "react";

const paths = {
  "arrow-right": "M5 12h14m-6-6 6 6-6 6",
  "arrow-up": "M12 19V5m-6 6 6-6 6 6",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  calendar:
    "M8 3v4m8-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2",
  inbox: "M4 4h16l2 10v6H2v-6L4 4m-2 10h6l2 3h4l2-3h6",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  plus: "M12 5v14M5 12h14",
} as const;

export function Icon({
  name,
  ...props
}: ComponentPropsWithoutRef<"svg"> & { name: keyof typeof paths }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
