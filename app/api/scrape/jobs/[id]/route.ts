import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicScopedScrapeSummary } from "@/lib/scrapers/job-result";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("scrape_jobs")
    .select(
      "id,status,source_ids,scope,listings_found,listings_saved,error_message,result,created_at,started_at,heartbeat_at,completed_at",
    )
    .eq("id", id)
    .eq("requested_by", user.id)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Could not read import status" },
      { status: 500 },
    );
  if (!data)
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  return NextResponse.json({
    job: {
      ...data,
      error_message:
        data.status === "failed"
          ? "We couldn't check the selected sources. Please retry or choose another source."
          : null,
      result: publicScopedScrapeSummary(data.result),
    },
  });
}
