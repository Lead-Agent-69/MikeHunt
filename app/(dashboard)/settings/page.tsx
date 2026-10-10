"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Field } from "@/components/shared/Field";
import { Ico } from "@/components/shared/Ico";
import { ErrorState } from "@/components/shared/ErrorState";
import { useDealerId } from "@/hooks/useDealerId";
import { usePreferences } from "@/hooks/usePreferences";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import { EnablePush } from "@/components/EnablePush";
import { LocationPrefs } from "@/components/settings/LocationPrefs";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { BuyingProfilePrefs } from "@/components/settings/BuyingProfilePrefs";

// Fetcher function for SWR
const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  });

// User-level VIEW preferences (default market). Persists per user via /api/preferences, so it saves for
// everyone (no dealer profile required). This is the "what do I want to see" control.
function CarsViewPrefs() {
  const { isLoading } = usePreferences();
  if (isLoading) return <p role="status">Loading preferences...</p>;
  return (
    <div className="glass-panel p-6 animate-popIn">
      <h2 className="text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-6">
        Locations
      </h2>
      <LocationPrefs />
      <BuyingProfilePrefs />
      <div className="mt-6 pt-6 border-t border-[var(--b1)] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-black text-[var(--t1)]">Deal alerts</div>
          <p className="text-[12px] text-[var(--t4)]">
            Enable notifications for changes to your saved searches and
            vehicles.
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
  const {
    prefs,
    save: savePreferences,
    authed,
    isLoading: prefsLoading,
  } = usePreferences();
  // UI only: the stored target_profit is untouched. Unknown mode = personal.
  // Signed in, the saved account mode decides — never a desk left in this browser's localStorage by a
  // previous (dealer) session — and Business profile / Dealer Defaults stay hidden until prefs load.
  const savedBuyerMode = authed
    ? prefs?.buyerScope?.buyerMode
    : intent?.buyerMode;
  const showProfitTarget = !prefsLoading && isFlipBuyerMode(savedBuyerMode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationSaved, setNotificationSaved] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [saveError, setSaveError] = useState("");

  const [profile, setProfile] = useState({
    name: "",
    phone: "",
    city: "",
    state: "",
    // No state picked until the user picks one. A silent California default misplaced new users.
    home_state: "",
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
    dealerId && !dealerLoading ? ["/api/profile", dealerId] : null,
    ([url]: [string, string]) => fetcher(url),
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
        home_state: profileData.profile.home_state || "",
        auction_fee_default: profileData.profile.auction_fee_default ?? 450,
        recon_cost_default: profileData.profile.recon_cost_default ?? 500,
        daily_floor_rate: profileData.profile.daily_floor_rate ?? 35,
        target_profit: profileData.profile.target_profit ?? 3500,
        notify_price_drops: profileData.profile.notify_price_drops ?? true,
      }));
    }
  }, [profileData]);
  useEffect(() => {
    if (prefsLoading) return;
    setProfile((previous) => ({
      ...previous,
      phone: prefs.profileContact?.phone || "",
      city: prefs.profileContact?.city || "",
      state: prefs.profileContact?.state || "",
    }));
  }, [prefs.profileContact, prefsLoading]);
  const profileKey = JSON.stringify(profile);
  useEffect(() => {
    setSaved(false);
  }, [profileKey]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      if (!authed)
        throw new Error("Sign in again to save your profile and costs.");
      for (const amount of showProfitTarget
        ? [
            profile.auction_fee_default,
            profile.recon_cost_default,
            profile.daily_floor_rate,
            profile.target_profit,
          ]
        : []) {
        if (!Number.isFinite(amount) || amount < 0 || amount > 1000000)
          throw new Error("Costs must be between $0 and $1,000,000.");
      }
      await savePreferences({
        profileContact: {
          phone: profile.phone,
          city: profile.city,
          state: profile.state,
        },
      });

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-require-account": "true",
        },
        // Location is saved separately; a contact/cost save cannot overwrite it.
        body: JSON.stringify({
          name: profile.name,
          ...(showProfitTarget
            ? {
                auction_fee_default: profile.auction_fee_default,
                recon_cost_default: profile.recon_cost_default,
                daily_floor_rate: profile.daily_floor_rate,
                target_profit: profile.target_profit,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }
      setSaved(true);
      toast.success("Settings saved");

      // Revalidate from server
      await mutate(data, false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings";
      setSaveError(
        `${message} Your draft is kept; retry to finish saving all changes.`,
      );
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  async function savePriceNotifications(enabled: boolean) {
    const previous = profile.notify_price_drops;
    setNotificationSaving(true);
    setNotificationSaved(false);
    setNotificationError("");
    setProfile((p) => ({ ...p, notify_price_drops: enabled }));
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-require-account": "true",
        },
        body: JSON.stringify({ notify_price_drops: enabled }),
      });
      if (!response.ok)
        throw new Error("Notification preferences could not be saved.");
      setNotificationSaved(true);
    } catch (error) {
      setProfile((p) => ({ ...p, notify_price_drops: previous }));
      setNotificationError("Could not save notifications. Try again.");
      toast.error(userFacingErrorMessage(error));
    } finally {
      setNotificationSaving(false);
    }
  }

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
        <fieldset
          disabled={saving || notificationSaving}
          className="min-w-0 space-y-6"
        >
          {/* Profile Section */}
          <div className="glass-panel p-6 animate-popIn">
            <h2 className="text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-6">
              {showProfitTarget ? "Business profile" : "Contact details"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label={showProfitTarget ? "Business name" : "Name"}
                value={profile.name}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, name: e.target.value }))
                }
                placeholder={
                  showProfitTarget ? "Your business name" : "Your name"
                }
              />
              <Field
                label="Phone"
                value={profile.phone}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, phone: e.target.value }))
                }
                placeholder="(555) 123-4567"
              />
              {showProfitTarget && (
                <>
                  <Field
                    label="Business city"
                    value={profile.city}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, city: e.target.value }))
                    }
                    placeholder="Austin"
                  />
                  <Field
                    label="Business state"
                    value={profile.state}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, state: e.target.value }))
                    }
                    placeholder="TX"
                  />
                </>
              )}
            </div>
          </div>

          {/* Dealer Defaults Section */}
          {showProfitTarget && (
            <div
              className="glass-panel p-6 animate-popIn"
              style={{ animationDelay: "100ms" }}
            >
              <h2 className="text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-6">
                Deal cost defaults
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          )}

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
                disabled={notificationSaving}
                onChange={(e) => void savePriceNotifications(e.target.checked)}
                className="w-5 h-5 accent-[var(--green)]"
              />
              <span className="text-sm font-semibold text-[var(--t1)]">
                Email me when a saved car drops in price
              </span>
            </label>
            <p
              role={notificationError ? "alert" : "status"}
              className="mt-2 text-xs text-[var(--t4)]"
            >
              {notificationSaving
                ? "Saving..."
                : notificationSaved
                  ? "Saved"
                  : notificationError ||
                    "Notification changes save automatically."}
            </p>
          </div>

          {/* Save Button */}
          <div className="sticky bottom-20 lg:bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--b1)] bg-[var(--s0)] p-4">
            <p role="status" className="w-full text-sm text-[var(--red)]">
              {saveError}
            </p>
            <span className="text-sm text-[var(--t4)] font-medium hidden sm:inline">
              Save changes to your profile.
            </span>
            <div className="flex items-center gap-4 w-full sm:w-auto">
              {saved && (
                <span className="text-sm font-bold text-[var(--green)] flex items-center gap-1 animate-popIn">
                  <Ico name="check" size={16} /> Saved!
                </span>
              )}
              <button
                disabled={saving || notificationSaving || prefsLoading}
                onClick={handleSave}
                className="w-full sm:w-auto px-8 py-3 text-sm font-bold text-white rounded-xl transition-all border-none flex justify-center items-center gap-2 disabled:opacity-50"
                style={{ background: "var(--grad)" }}
              >
                {saving && <Ico name="refresh" className="animate-spin" />}
                {saving
                  ? "Saving..."
                  : showProfitTarget
                    ? "Save profile and costs"
                    : "Save profile"}
              </button>
            </div>
          </div>
        </fieldset>
      )}
    </div>
  );
}
