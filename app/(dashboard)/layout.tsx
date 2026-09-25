import { TopNav } from "@/components/layout/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { CommandPalette } from "@/components/shared/CommandPalette";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-transparent text-[var(--t1)]">
      <TopNav />
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 pb-20 md:pb-6">
        {children}
      </main>
      <BottomNav />
      <CommandPalette />
    </div>
  );
}
