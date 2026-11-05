import { BrandStartupLoader } from "@/components/brand/BrandStartupLoader";

// Next owns this fallback's lifetime; ready content and error routes replace it.
export default function DashboardLoading() {
  return <BrandStartupLoader />;
}
