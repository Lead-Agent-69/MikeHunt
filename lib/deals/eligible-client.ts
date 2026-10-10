import type { SupabaseClient } from "@supabase/supabase-js";

/** Service-role clients bypass RLS. Keep ordinary server-side reads held-safe too. */
export function eligibleInventoryClient(
  client: SupabaseClient,
  purpose: "display" | "derive" = "display",
): SupabaseClient {
  return new Proxy(client, {
    get(target, property) {
      if (property !== "from") {
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (table: string) => {
        const builder = target.from(table);
        const view = {
          deals:
            purpose === "derive"
              ? "eligible_valuation_deals"
              : "eligible_deals",
          sold_listings: "eligible_sold_listings",
          price_history: "eligible_price_history",
        }[table as "deals" | "sold_listings" | "price_history"];
        if (!view) return builder;
        return new Proxy(builder, {
          get(query, method) {
            if (method === "select")
              return (...args: Parameters<typeof query.select>) =>
                target.from(view).select(...args);
            const value = Reflect.get(query, method);
            return typeof value === "function" ? value.bind(query) : value;
          },
        });
      };
    },
  });
}
