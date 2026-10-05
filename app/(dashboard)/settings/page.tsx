"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Field } from "@/components/shared/Field";
import { Ico } from "@/components/shared/Ico";
import { ErrorState } from "@/components/shared/ErrorState";
import { US_STATES } from "@/lib/utils/titleRules";
import { useDealerId } from "@/hooks/useDealerId";
import { Skeleton } from "@/components/shared/Skeleton";
import { usePreferences } from "@/hooks/usePreferences";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import { EnablePush } from "@/components/EnablePush";

// Fetcher function for SWR
const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  });

// User-level VIEW preferences (default market). Persists per user via /api/preferences, so it saves for
// everyone (no dealer profile required). This is the "what do I want to see" control.
function CarsViewPrefs() {
  const { prefs, save, authed, isLoading } = usePreferences();
  if (isLoading || !authed) return null;
  const set = async (patch: Parameters<typeof save>[0]) => {
    await save(patch);
    toast.success("Saved");
  };
  const selectCls =
    "rounded-lg bg-[var(--s1)] border border-[var(--b2)] text-[var(--t1)] text-sm font-semibold px-3 py-2 focus:outline-none focus:border-[var(--brand)]";
  return (
    <div className="glass-panel p-6 animate-popIn">
      <h2 className="text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-6">
        Default View
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-[var(--t3)]">
            Default market (state you open to)
          </span>
          <select
            className={selectCls}
            value={prefs.carsState || ""}
            onChange={(e) => set({ carsState: e.target.value })}
          >
            <option value="">Nationwide</option>
            {US_STATES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[12px] text-[var(--t4)] mt-4">
        Saves instantly to your account and syncs across devices.
      </p>
      <div className="mt-5 border-t border-[var(--b1)] pt-5">
        <p className="text-sm font-black text-[var(--t1)]">Buying profile</p>
        <p className="mt-1 text-[12px] text-[var(--t4)]">
          Change your buyer mode, vehicle types, budget, title tolerance, and
          timeline.
        </p>
        <a
          href="/onboarding?edit=1"
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-[var(--b2)] px-4 text-sm font-bold text-[var(--t1)] transition-colors hover:bg-[var(--s2)]"
        >
          Edit buying profile
        </a>
      </div>

      <div className="mt-6 pt-6 border-t border-[var(--b1)] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-black text-[var(--t1)]">Deal alerts</div>
          <p className="text-[12px] text-[var(--t4)]">
            Get a push the instant a hot deal matching your saved searches drops
            — even when the app is closed.
          </p>
        </div>
        <div className="shrink-0">
          <EnablePush />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { dealerId, loading: dealerLoading } = useDealerId();
  const { intent } = useBuyerIntent();
  const { prefs } = usePreferences();
  // UI only: the stored target_profit is untouched. Unknown mode = personal.
  const showProfitTarget = isFlipBuyerMode(
    intent?.buyerMode || prefs?.buyerScope?.buyerMode,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [homeZip, setHomeZip] = useState("");
  const [locating, setLocating] = useState(false);

  const [profile, setProfile] = useState({
    name: "",
    phone: "",
    city: "",
    state: "",
    home_state: "CA",
    auction_fee_default: 450,
    recon_cost_default: 500,
    daily_floor_rate: 35,
    target_profit: 3500,
    notify_price_drops: true,
  });

  // Use SWR for data fetching
  const {
    data: profileData,
    error,
    isLoading,
    mutate,
  } = useSWR(
    dealerId && !dealerLoading ? `/api/profile?dealerId=${dealerId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 300000, // 5 minutes (settings don't change often)
    },
  );

  const loading = isLoading || dealerLoading;
  const authError =
    !dealerLoading && !dealerId
      ? "Please sign in to view your settings."
      : null;

  // Update local profile state when data loads
  useEffect(() => {
    if (profileData?.profile) {
      setProfile((p) => ({
        ...p,
        name: profileData.profile.name || profileData.profile.full_name || "",
        phone: profileData.profile.phone || "",
        city: profileData.profile.city || "",
        state: profileData.profile.state || "",
        home_state: profileData.profile.home_state || "CA",
        auction_fee_default: profileData.profile.auction_fee_default ?? 450,
        recon_cost_default: profileData.profile.recon_cost_default ?? 500,
        daily_floor_rate: profileData.profile.daily_floor_rate ?? 35,
        target_profit: profileData.profile.target_profit ?? 3500,
        notify_price_drops: profileData.profile.notify_price_drops ?? true,
      }));
    }
  }, [profileData]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Optimistic update
      mutate({ profile }, false);

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) {
        mutate(); // Revert on error
        throw new Error(data.error || "Save failed");
      }
      setSaved(true);
      toast.success("Settings saved");

      // Update local storage cache for the hook
      localStorage.setItem(
        "dh_dealer_defaults",
        JSON.stringify({
          auctionFee: profile.auction_fee_default,
          reconCost: profile.recon_cost_default,
          dailyFloorRate: profile.daily_floor_rate,
          targetProfit: profile.target_profit,
          homeState: profile.home_state,
        }),
      );

      // Revalidate from server
      mutate();
    } catch (err: any) {
      toast.error("Failed to save settings");
      mutate(); // Revert on error
    } finally {
      setSaving(false);
    }
  };

  // Home location → unlocks radius "near me" + nearest-deals (saved-search radius too).
  const saveHomeZip = async () => {
    if (!/^\d{5}$/.test(homeZip.trim())) {
      toast.error("Enter a 5-digit ZIP code");
      return;
    }
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home_zip: homeZip.trim() }),
      });
      if (!r.ok) throw new Error();
      toast.success("Home ZIP saved — “near me” deals enabled");
      mutate();
    } catch {
      toast.error("Couldn’t save ZIP");
    }
  };

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast.error("Location isn’t available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              home_lat: pos.coords.latitude,
              home_lng: pos.coords.longitude,
            }),
          });
          if (!r.ok) throw new Error();
          toast.success("Location set — nearest deals + radius enabled");
          mutate();
        } catch {
          toast.error("Couldn’t save your location");
        } finally {
          setLocating(false);
        }
      },
      () => {
        toast.error("Location permission denied");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-fadeUp pb-24">
      {/* Header */}
      <div className="glass-panel p-6 flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
          style={{ background: "var(--grad)" }}
        >
          <Ico name="settings" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--t1)]">Settings</h1>
          <p className="text-sm text-[var(--t4)] mt-1">
            Your viewing preferences, workspace profile, and source connections.
          </p>
        </div>
      </div>

      {/* View preferences — user-level, always available (independent of the dealer profile). */}
      <CarsViewPrefs />

      {loading && (
        <div className="text-center py-10">
          <Ico
            name="refresh"
            className="animate-spin text-[var(--t4)] mx-auto"
          />
        </div>
      )}
      {(authError || error) && !loading && (
        <ErrorState
          title="Couldn't load settings"
          message={authError || error?.message || "An error occurred"}
          onRetry={() => mutate()}
          compact
        />
      )}

      {!loading && !authError && !error && (
        <>
          {/* Profile Section */}
          <div className="glass-panel p-6 animate-popIn">
            <h2 className="text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-6">
              Dealer Profile
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Dealership Name"
                value={profile.name}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Your dealership name"
              />
              <Field
                label="Phone"
                value={profile.phone}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, phone: e.target.value }))
                }
                placeholder="(555) 123-4567"
              />
              <Field
                label="City"
                value={profile.city}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, city: e.target.value }))
                }
                placeholder="Austin"
              />
              <Field
                label="State"
                value={profile.state}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, state: e.target.value }))
                }
                placeholder="TX"
              />
            </div>
          </div>

          {/* Dealer Defaults Section */}
          <div
            className="glass-panel p-6 animate-popIn"
            style={{ animationDelay: "100ms" }}
          >
            <h2 className="text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-6">
              Dealer Defaults
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[var(--t2)]">
                  Home State (for transport calculation)
                </label>
                <select
                  value={profile.home_state}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, home_state: e.target.value }))
                  }
                  className="w-full text-sm text-[var(--t1)] rounded-lg px-3 py-2.5 outline-none transition-all border-none"
                  style={{ background: "var(--s2)" }}
                >
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Home location — unlocks "near me" radius + nearest-deals rails */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-xs font-medium text-[var(--t2)]">
                  Home location (enables “near me” radius + nearest deals)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={homeZip}
                    onChange={(e) => setHomeZip(e.target.value)}
                    placeholder="ZIP code"
                    inputMode="numeric"
                    maxLength={5}
                    className="w-28 text-sm text-[var(--t1)] rounded-lg px-3 py-2.5 outline-none border-none"
                    style={{ background: "var(--s2)" }}
                  />
                  <button
                    type="button"
                    onClick={saveHomeZip}
                    className="text-sm font-semibold rounded-lg px-3 py-2.5 border"
                    style={{
                      background: "var(--s0)",
                      borderColor: "var(--b2)",
                      color: "var(--t2)",
                    }}
                  >
                    Set ZIP
                  </button>
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={locating}
                    className="flex items-center gap-1.5 text-sm font-semibold rounded-lg px-3 py-2.5 text-white border-none disabled:opacity-60"
                    style={{ background: "var(--grad)" }}
                  >
                    <Ico name={locating ? "refresh" : "map"} size={15} />
                    {locating ? "Locating…" : "Use my location"}
                  </button>
                </div>
              </div>

              <Field
                label="Default Auction Fee ($)"
                type="number"
                inputMode="numeric"
                value={profile.auction_fee_default}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    auction_fee_default: Number(e.target.value),
                  }))
                }
              />

              <Field
                label="Default Recon Cost ($)"
                type="number"
                inputMode="numeric"
                value={profile.recon_cost_default}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    recon_cost_default: Number(e.target.value),
                  }))
                }
              />

              <Field
                label="Daily Floor Rate ($/day)"
                type="number"
                inputMode="numeric"
                value={profile.daily_floor_rate}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    daily_floor_rate: Number(e.target.value),
                  }))
                }
              />

              {showProfitTarget && (
                <Field
                  label="Target Profit Threshold ($)"
                  type="number"
                  inputMode="numeric"
                  value={profile.target_profit}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      target_profit: Number(e.target.value),
                    }))
                  }
                />
              )}
            </div>
          </div>

          {/* Preferences Section */}
          <div
            className="glass-panel p-6 animate-popIn"
            style={{ animationDelay: "200ms" }}
          >
            <h2 className="text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-6">
              Notifications
            </h2>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={profile.notify_price_drops}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    notify_price_drops: e.target.checked,
                  }))
                }
                className="w-5 h-5 accent-[var(--green)]"
              />
              <span className="text-sm font-semibold text-[var(--t1)]">
                Email me when a saved car drops in price
              </span>
            </label>
          </div>

          {/* Save Button */}
          <div className="sticky bottom-20 sm:bottom-6 flex items-center justify-between glass-panel p-4">
            <span className="text-sm text-[var(--t4)] font-medium hidden sm:inline">
              Changes apply immediately.
            </span>
            <div className="flex items-center gap-4 w-full sm:w-auto">
              {saved && (
                <span className="text-sm font-bold text-[var(--green)] flex items-center gap-1 animate-popIn">
                  <Ico name="check" size={16} /> Saved!
                </span>
              )}
              <button
                disabled={saving}
                onClick={handleSave}
                className="w-full sm:w-auto px-8 py-3 text-sm font-bold text-white rounded-xl transition-all border-none flex justify-center items-center gap-2 disabled:opacity-50"
                style={{ background: "var(--grad)" }}
              >
                {saving && <Ico name="refresh" className="animate-spin" />}
                Save Settings
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
