import { TopNav } from "@/components/layout/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { DashboardOverlays } from "@/components/layout/DashboardOverlays";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { DiscoverySaveProvider } from "@/components/discovery/DiscoverySaveProvider";
import { DiscoveryViewAccess } from "@/components/search/DiscoveryViewAccess";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-transparent text-[var(--t1)]">
      <TopNav />
      <main className="flex-1 w-full min-w-0 [--workspace-gutter:0.75rem] sm:[--workspace-gutter:1rem] lg:[--workspace-gutter:1.5rem] 2xl:[--workspace-gutter:2rem] px-[var(--workspace-gutter)] py-3 sm:py-4 lg:py-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
        <WorkspaceNav />
        <DiscoveryViewAccess />
        <DiscoverySaveProvider>{children}</DiscoverySaveProvider>
      </main>
      <BottomNav />
      <DashboardOverlays />
    </div>
  );
}
