// ⚠️ LEGACY — custom auth path, NOT the live one. The app authenticates through Supabase Auth directly
// (app/(auth)/login + register call supabase.auth.signInWithPassword; the dashboard uses getServerUser).
// Only /api/auth/signup + /signin import this, and the UI doesn't call those routes. It reads/writes the
// `profiles` table, whereas the CANONICAL profile/plan/billing table is `user_profiles` (used by
// billing/webhook, checkout, lib/auth/plan, auth/provision). Do NOT add new reads against `profiles` —
// use `user_profiles` (and Supabase auth.users for email). Kept only to avoid breaking the unused routes.
//
// Authentication system for DealerHunt

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  company?: string;
  role: "owner" | "manager" | "user";
  tierId: string;
  status: "active" | "suspended" | "trialing";
  createdAt: Date;
  lastLoginAt: Date;
  preferences: {
    notifications: boolean;
    emailAlerts: boolean;
    smsAlerts: boolean;
    theme: "light" | "dark" | "auto";
    timezone: string;
    currency: string;
  };
  metadata: Record<string, any>;
}

export interface AuthSession {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export class AuthSystem {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    );
  }

  // Sign up new user
  async signUp(
    email: string,
    password: string,
    userData: Partial<UserProfile>,
  ): Promise<{
    user: UserProfile | null;
    error: string | null;
  }> {
    try {
      // Create auth user
      const { data: authData, error: authError } =
        await this.supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: userData.name || email.split("@")[0],
              company: userData.company,
              phone: userData.phone,
            },
          },
        });

      if (authError) {
        return { user: null, error: authError.message };
      }

      if (!authData.user) {
        return { user: null, error: "Failed to create user" };
      }

      // Create user profile
      const profile: Partial<UserProfile> = {
        id: authData.user.id,
        email: authData.user.email!,
        name: userData.name || authData.user.email!.split("@")[0],
        phone: userData.phone,
        company: userData.company,
        role: "owner",
        tierId: "starter", // Start with starter tier
        status: "trialing", // 14-day trial
        createdAt: new Date(),
        lastLoginAt: new Date(),
        preferences: {
          notifications: true,
          emailAlerts: true,
          smsAlerts: false,
          theme: "auto",
          timezone: "America/New_York",
          currency: "USD",
        },
        metadata: {
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
          source: "signup",
        },
      };

      const { data: profileData, error: profileError } = await this.supabase
        .from("profiles")
        .insert(profile)
        .select()
        .single();

      if (profileError) {
        return { user: null, error: profileError.message };
      }

      return { user: profileData as UserProfile, error: null };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Sign in user
  async signIn(
    email: string,
    password: string,
  ): Promise<{
    session: AuthSession | null;
    error: string | null;
  }> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { session: null, error: error.message };
      }

      if (!data.user || !data.session) {
        return { session: null, error: "Invalid credentials" };
      }

      // Get user profile
      const { data: profileData, error: profileError } = await this.supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profileError) {
        return { session: null, error: profileError.message };
      }

      // Update last login
      await this.supabase
        .from("profiles")
        .update({ lastLoginAt: new Date() })
        .eq("id", data.user.id);

      const session: AuthSession = {
        user: profileData as UserProfile,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: new Date(data.session.expires_at! * 1000),
      };

      return { session, error: null };
    } catch (error) {
      return {
        session: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Sign out user
  async signOut(): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.auth.signOut();
      return { error: error?.message || null };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Get current session
  async getCurrentSession(): Promise<AuthSession | null> {
    try {
      const {
        data: { session },
      } = await this.supabase.auth.getSession();

      if (!session) {
        return null;
      }

      // Get user profile
      const { data: profileData, error: profileError } = await this.supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profileError) {
        return null;
      }

      return {
        user: profileData as UserProfile,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: new Date(session.expires_at! * 1000),
      };
    } catch (error) {
      return null;
    }
  }

  // Update user profile
  async updateProfile(
    userId: string,
    updates: Partial<UserProfile>,
  ): Promise<{
    user: UserProfile | null;
    error: string | null;
  }> {
    try {
      const { data, error } = await this.supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        return { user: null, error: error.message };
      }

      return { user: data as UserProfile, error: null };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Reset password
  async resetPassword(email: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      return { error: error?.message || null };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Update password
  async updatePassword(newPassword: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword,
      });

      return { error: error?.message || null };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    const session = await this.getCurrentSession();
    return !!session;
  }

  // Get user role permissions
  getUserPermissions(role: UserProfile["role"]): {
    canViewDashboard: boolean;
    canManageUsers: boolean;
    canManageBilling: boolean;
    canManageSettings: boolean;
    canViewReports: boolean;
    canExportData: boolean;
    canManageIntegrations: boolean;
  } {
    switch (role) {
      case "owner":
        return {
          canViewDashboard: true,
          canManageUsers: true,
          canManageBilling: true,
          canManageSettings: true,
          canViewReports: true,
          canExportData: true,
          canManageIntegrations: true,
        };
      case "manager":
        return {
          canViewDashboard: true,
          canManageUsers: false,
          canManageBilling: false,
          canManageSettings: false,
          canViewReports: true,
          canExportData: true,
          canManageIntegrations: false,
        };
      case "user":
        return {
          canViewDashboard: true,
          canManageUsers: false,
          canManageBilling: false,
          canManageSettings: false,
          canViewReports: false,
          canExportData: false,
          canManageIntegrations: false,
        };
      default:
        return {
          canViewDashboard: false,
          canManageUsers: false,
          canManageBilling: false,
          canManageSettings: false,
          canViewReports: false,
          canExportData: false,
          canManageIntegrations: false,
        };
    }
  }

  // Validate user session
  async validateSession(token: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.auth.getUser(token);
      return !error && !!data.user;
    } catch (error) {
      return false;
    }
  }

  // Refresh session token
  async refreshSession(refreshToken: string): Promise<{
    session: AuthSession | null;
    error: string | null;
  }> {
    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) {
        return { session: null, error: error.message };
      }

      if (!data.session) {
        return { session: null, error: "Failed to refresh session" };
      }

      // Get updated user profile
      const { data: profileData, error: profileError } = await this.supabase
        .from("profiles")
        .select("*")
        .eq("id", data.session.user.id)
        .single();

      if (profileError) {
        return { session: null, error: profileError.message };
      }

      const session: AuthSession = {
        user: profileData as UserProfile,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: new Date(data.session.expires_at! * 1000),
      };

      return { session, error: null };
    } catch (error) {
      return {
        session: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
