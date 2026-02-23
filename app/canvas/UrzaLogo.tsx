"use client";

import Image from "next/image";

type UrzaLogoProps = {
  className?: string;
};

export function UrzaLogo({ className }: UrzaLogoProps) {
  return (
    <Image
      src="/urza-logo.png"
      alt=""
      width={14}
      height={14}
      className={className ?? "h-3.5 w-3.5"}
    />
  );
}
