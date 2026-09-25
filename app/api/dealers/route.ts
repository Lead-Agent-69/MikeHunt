export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { DealersService } from "@/lib/data/dealers-service";
import { getServerUser } from "@/lib/server-supabase";

export async function GET(request: NextRequest) {
  try {
    const dealersService = new DealersService();
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const filters: any = {};

    if (searchParams.get("states")) {
      filters.states = searchParams.get("states")!.split(",");
    }

    if (searchParams.get("types")) {
      filters.dealerTypes = searchParams.get("types")!.split(",");
    }

    if (searchParams.get("makes")) {
      filters.makes = searchParams.get("makes")!.split(",");
    }

    if (searchParams.get("services")) {
      filters.services = searchParams.get("services")!.split(",");
    }

    if (searchParams.get("minRating")) {
      filters.minRating = parseFloat(searchParams.get("minRating")!);
    }

    if (searchParams.get("sortBy")) {
      filters.sortBy = searchParams.get("sortBy") as any;
    }

    if (searchParams.get("limit")) {
      filters.limit = parseInt(searchParams.get("limit")!);
    }

    // Handle nearby search
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius = searchParams.get("radius");

    if (lat && lng) {
      const coordinates: [number, number] = [parseFloat(lat), parseFloat(lng)];
      const maxRadius = radius ? parseInt(radius) : 100;
      const dealers = await dealersService.getDealersNearCoordinates(
        coordinates,
        maxRadius,
        filters.limit || 20,
      );
      return NextResponse.json({
        dealers,
        total: dealers.length,
        hasMore: false,
      });
    }

    // Handle top dealers
    const top = searchParams.get("top");
    if (top === "true") {
      const dealers = await dealersService.getTopDealersByProfit(
        filters.limit || 10,
      );
      return NextResponse.json({
        dealers,
        total: dealers.length,
        hasMore: false,
      });
    }

    // Handle state statistics
    const state = searchParams.get("state");
    const stats = searchParams.get("stats");
    if (stats === "true" && state) {
      const stateStats = await dealersService.getStateDealerStats(state);
      return NextResponse.json(stateStats);
    }

    // Get regular dealers
    const dealers = await dealersService.searchDealers(filters);
    return NextResponse.json({
      dealers,
      total: dealers.length,
      hasMore: false,
    });
  } catch (error) {
    console.error("Error in dealers API:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch dealers",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const dealersService = new DealersService();
    const body = await request.json();
    const { action, userPreferences } = body;

    switch (action) {
      case "recommendations":
        if (!userPreferences) {
          return NextResponse.json(
            { error: "User preferences required" },
            { status: 400 },
          );
        }
        const recommendations =
          await dealersService.generateDealerRecommendations(userPreferences);
        return NextResponse.json(recommendations);

      case "add": {
        // Writes to the global `dealers` table require auth.
        const {
          data: { user },
        } = await getServerUser();
        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { dealer } = body;
        if (!dealer) {
          return NextResponse.json(
            { error: "Dealer data required" },
            { status: 400 },
          );
        }
        const newDealer = await dealersService.addDealer(dealer);
        return NextResponse.json(newDealer);
      }

      case "update": {
        // Writes require auth; a dealer may only edit their OWN record (id === user.id).
        const {
          data: { user },
        } = await getServerUser();
        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { dealerId, updates } = body;
        if (!dealerId || !updates) {
          return NextResponse.json(
            { error: "Dealer ID and updates required" },
            { status: 400 },
          );
        }
        if (dealerId !== user.id) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const updatedDealer = await dealersService.updateDealer(
          dealerId,
          updates,
        );
        return NextResponse.json(updatedDealer);
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in dealers POST API:", error);
    return NextResponse.json(
      {
        error: "Failed to process request",
      },
      { status: 500 },
    );
  }
}
