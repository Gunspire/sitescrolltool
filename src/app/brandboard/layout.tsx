import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Brandboard — one-page brand guidelines builder",
  description:
    "Compose any company's logo, colours, typography and imagery into a single brand board — live, local, no database.",
};

export default function BrandboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
