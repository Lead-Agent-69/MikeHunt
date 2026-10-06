import { FlipDeskGate } from "@/components/shared/FlipDeskGate";

// Flip tool: personal, DIY and parts desks get the in-page desk notice instead.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FlipDeskGate route="/market">{children}</FlipDeskGate>;
}
