import { FlipDeskGate } from "@/components/shared/FlipDeskGate";
import { CheckAnyListingAnyDesk } from "@/components/intelligence/CheckAnyListingAnyDesk";

// Flip tool: personal, DIY and parts desks get Check any listing (personal-desk read,
// no profit or resale) above the in-page desk notice. Arbitrage routes stay gated.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <FlipDeskGate route="/find" openToAllDesks={<CheckAnyListingAnyDesk />}>
      {children}
    </FlipDeskGate>
  );
}
