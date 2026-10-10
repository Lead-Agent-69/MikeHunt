import type { SupabaseClient } from "@supabase/supabase-js";

/** Service-role clients bypass RLS. Keep ordinary server-side reads held-safe too. */
export function eligibleInventoryClient(
  client: SupabaseClient,
): SupabaseClient {
  return new Proxy(client, {
    get(target, property) {
      if (property !== "from") {
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (table: string) => {
        const builder = target.from(table);
        if (!["deals", "sold_listings"].includes(table)) return builder;
        return new Proxy(builder, {
          get(query, method) {
            if (method === "select")
              return (...args: Parameters<typeof query.select>) =>
                query
                  .select(...args)
                  .eq("access_hold", false)
                  .gt("access_expires_at", new Date().toISOString());
            const value = Reflect.get(query, method);
            return typeof value === "function" ? value.bind(query) : value;
          },
        });
      };
    },
  });
}
