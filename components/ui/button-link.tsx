import type { ComponentPropsWithoutRef } from "react";

type ButtonLinkProps = ComponentPropsWithoutRef<"a"> & {
  variant?: "primary" | "secondary";
  size?: "small" | "regular";
};

export function ButtonLink({
  variant = "primary",
  size = "regular",
  className = "",
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      className={`button button-${variant} button-${size} ${className}`.trim()}
      {...props}
      href={props.href?.startsWith("/") ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${props.href}/`.replace(/\/+$/, "/") : props.href}
    >
      {children}
    </a>
  );
}
