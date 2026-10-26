import Image from "next/image";

export function Brand({ linked = true }: { linked?: boolean }) {
  const image = (
    <Image
      src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.png`}
      alt="oddk"
      width={1942}
      height={805}
      sizes="88px"
      className="brand-image"
      priority
    />
  );
  return linked ? (
    <a className="brand" href="#main" aria-label="oddk 홈">
      {image}
    </a>
  ) : (
    <span className="brand">{image}</span>
  );
}
