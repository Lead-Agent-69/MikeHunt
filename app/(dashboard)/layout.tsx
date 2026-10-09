import { TopNav } from "@/components/layout/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { DashboardOverlays } from "@/components/layout/DashboardOverlays";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-transparent text-[var(--t1)]">
      <TopNav />
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
        <WorkspaceNav />
        {children}
      </main>
      <BottomNav />
      <DashboardOverlays />
    </div>
  );
}
