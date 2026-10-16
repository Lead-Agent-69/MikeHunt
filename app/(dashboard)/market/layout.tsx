import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Explorer | MIKEHUNT",
  description:
    "Explore indexed vehicles by location, radius, source, condition, and price evidence.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
