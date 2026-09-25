export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_log: {
        Row: {
          alert_type: string
          deal_id: string | null
          drop_amount: number | null
          drop_percentage: number | null
          id: string
          message: string | null
          new_price: number | null
          old_price: number | null
          read_at: string | null
          sent_at: string | null
          user_id: string | null
        }
        Insert: {
          alert_type?: string
          deal_id?: string | null
          drop_amount?: number | null
          drop_percentage?: number | null
          id?: string
          message?: string | null
          new_price?: number | null
          old_price?: number | null
          read_at?: string | null
          sent_at?: string | null
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          deal_id?: string | null
          drop_amount?: number | null
          drop_percentage?: number | null
          id?: string
          message?: string | null
          new_price?: number | null
          old_price?: number | null
          read_at?: string | null
          sent_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_log_listing_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_log_listing_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_matches: {
        Row: {
          alert_id: string | null
          created_at: string | null
          deal_id: string | null
          dealer_id: string | null
          id: string
          notified: boolean | null
          profit_estimate: number | null
          viewed: boolean | null
        }
        Insert: {
          alert_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          dealer_id?: string | null
          id?: string
          notified?: boolean | null
          profit_estimate?: number | null
          viewed?: boolean | null
        }
        Update: {
          alert_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          dealer_id?: string | null
          id?: string
          notified?: boolean | null
          profit_estimate?: number | null
          viewed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_matches_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_matches_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_matches_listing_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_matches_listing_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          active: boolean | null
          channels: string[]
          created_at: string
          filters: Json
          id: string
          last_triggered_at: string | null
          name: string
          trigger_count: number | null
          type: Database["public"]["Enums"]["alert_type"]
          user_id: string
        }
        Insert: {
          active?: boolean | null
          channels?: string[]
          created_at?: string
          filters?: Json
          id?: string
          last_triggered_at?: string | null
          name: string
          trigger_count?: number | null
          type: Database["public"]["Enums"]["alert_type"]
          user_id: string
        }
        Update: {
          active?: boolean | null
          channels?: string[]
          created_at?: string
          filters?: Json
          id?: string
          last_triggered_at?: string | null
          name?: string
          trigger_count?: number | null
          type?: Database["public"]["Enums"]["alert_type"]
          user_id?: string
        }
        Relationships: []
      }
      dealers: {
        Row: {
          active_deals: number | null
          address: string | null
          avg_ask_price: number | null
          avg_mmr_value: number | null
          avg_profit_estimate: number | null
          city: string
          created_at: string
          deal_score: number | null
          email: string | null
          embedding: string | null
          id: string
          last_scraped_at: string | null
          lat: number
          lng: number
          location: unknown
          name: string
          notes: string | null
          phone: string | null
          slug: string
          source_url: string | null
          state: string
          type: Database["public"]["Enums"]["dealer_type"]
          updated_at: string
          verified: boolean | null
          website: string | null
          zip: string | null
        }
        Insert: {
          active_deals?: number | null
          address?: string | null
          avg_ask_price?: number | null
          avg_mmr_value?: number | null
          avg_profit_estimate?: number | null
          city: string
          created_at?: string
          deal_score?: number | null
          email?: string | null
          embedding?: string | null
          id?: string
          last_scraped_at?: string | null
          lat: number
          lng: number
          location?: unknown
          name: string
          notes?: string | null
          phone?: string | null
          slug: string
          source_url?: string | null
          state: string
          type: Database["public"]["Enums"]["dealer_type"]
          updated_at?: string
          verified?: boolean | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          active_deals?: number | null
          address?: string | null
          avg_ask_price?: number | null
          avg_mmr_value?: number | null
          avg_profit_estimate?: number | null
          city?: string
          created_at?: string
          deal_score?: number | null
          email?: string | null
          embedding?: string | null
          id?: string
          last_scraped_at?: string | null
          lat?: number
          lng?: number
          location?: unknown
          name?: string
          notes?: string | null
          phone?: string | null
          slug?: string
          source_url?: string | null
          state?: string
          type?: Database["public"]["Enums"]["dealer_type"]
          updated_at?: string
          verified?: boolean | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      deals: {
        Row: {
          active: boolean | null
          ai_rationale: string | null
          ai_retail_estimate: number | null
          ai_wholesale_estimate: number | null
          ask_price: number
          auction_end_at: string | null
          body_style: string | null
          buy_now_price: number | null
          cargurus_price: number | null
          color: string | null
          condition: Database["public"]["Enums"]["listing_condition"]
          created_at: string
          damage_type: string | null
          dealer_id: string | null
          drivetrain: string | null
          duplicate_confidence: number | null
          duplicate_of_id: string | null
          embedding: string | null
          engine: string | null
          estimated_repair_cost: number | null
          estimated_transport_cost: number | null
          first_seen_at: string
          fuel_type: string | null
          id: string
          images: string[] | null
          is_arbitrage_opportunity: boolean | null
          kbb_retail: number | null
          kbb_trade_in: number | null
          keys_present: boolean | null
          last_price_change_at: string | null
          last_seen_at: string
          lat: number | null
          lng: number | null
          location: unknown
          location_city: string | null
          location_state: string | null
          location_zip: string | null
          make: string
          mileage: number | null
          mmr_value: number | null
          model: string
          profit_estimate: number | null
          profit_score: number | null
          run_drive: boolean | null
          source: Database["public"]["Enums"]["deal_source"]
          source_deal_id: string
          source_url: string
          title: string
          transmission: string | null
          trim: string | null
          true_net_profit: number | null
          updated_at: string
          vin: string | null
          year: number
        }
        Insert: {
          active?: boolean | null
          ai_rationale?: string | null
          ai_retail_estimate?: number | null
          ai_wholesale_estimate?: number | null
          ask_price: number
          auction_end_at?: string | null
          body_style?: string | null
          buy_now_price?: number | null
          cargurus_price?: number | null
          color?: string | null
          condition: Database["public"]["Enums"]["listing_condition"]
          created_at?: string
          damage_type?: string | null
          dealer_id?: string | null
          drivetrain?: string | null
          duplicate_confidence?: number | null
          duplicate_of_id?: string | null
          embedding?: string | null
          engine?: string | null
          estimated_repair_cost?: number | null
          estimated_transport_cost?: number | null
          first_seen_at?: string
          fuel_type?: string | null
          id?: string
          images?: string[] | null
          is_arbitrage_opportunity?: boolean | null
          kbb_retail?: number | null
          kbb_trade_in?: number | null
          keys_present?: boolean | null
          last_price_change_at?: string | null
          last_seen_at?: string
          lat?: number | null
          lng?: number | null
          location?: unknown
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          make: string
          mileage?: number | null
          mmr_value?: number | null
          model: string
          profit_estimate?: number | null
          profit_score?: number | null
          run_drive?: boolean | null
          source: Database["public"]["Enums"]["deal_source"]
          source_deal_id: string
          source_url: string
          title: string
          transmission?: string | null
          trim?: string | null
          true_net_profit?: number | null
          updated_at?: string
          vin?: string | null
          year: number
        }
        Update: {
          active?: boolean | null
          ai_rationale?: string | null
          ai_retail_estimate?: number | null
          ai_wholesale_estimate?: number | null
          ask_price?: number
          auction_end_at?: string | null
          body_style?: string | null
          buy_now_price?: number | null
          cargurus_price?: number | null
          color?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"]
          created_at?: string
          damage_type?: string | null
          dealer_id?: string | null
          drivetrain?: string | null
          duplicate_confidence?: number | null
          duplicate_of_id?: string | null
          embedding?: string | null
          engine?: string | null
          estimated_repair_cost?: number | null
          estimated_transport_cost?: number | null
          first_seen_at?: string
          fuel_type?: string | null
          id?: string
          images?: string[] | null
          is_arbitrage_opportunity?: boolean | null
          kbb_retail?: number | null
          kbb_trade_in?: number | null
          keys_present?: boolean | null
          last_price_change_at?: string | null
          last_seen_at?: string
          lat?: number | null
          lng?: number | null
          location?: unknown
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          make?: string
          mileage?: number | null
          mmr_value?: number | null
          model?: string
          profit_estimate?: number | null
          profit_score?: number | null
          run_drive?: boolean | null
          source?: Database["public"]["Enums"]["deal_source"]
          source_deal_id?: string
          source_url?: string
          title?: string
          transmission?: string | null
          trim?: string | null
          true_net_profit?: number | null
          updated_at?: string
          vin?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "listings_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          auction_fee: number | null
          color: string | null
          condition: string | null
          created_at: string | null
          daily_floor_rate: number | null
          deal_id: string | null
          dealer_id: string
          description: string | null
          floor_date: string | null
          holding_cost: number | null
          id: string
          lead_count: number | null
          list_price: number | null
          listed_platforms: string[] | null
          make: string
          market_value: number | null
          model: string
          notes: string | null
          odometer: number | null
          other_costs: number | null
          photos: string[] | null
          purchase_price: number
          purchased_city: string | null
          purchased_from: string | null
          purchased_state: string | null
          recon_cost: number | null
          repair_cost: number | null
          sold_date: string | null
          sold_price: number | null
          stage: string | null
          title_fee: number | null
          total_cost: number | null
          transport_cost: number | null
          trim: string | null
          updated_at: string | null
          vin: string
          year: number
        }
        Insert: {
          auction_fee?: number | null
          color?: string | null
          condition?: string | null
          created_at?: string | null
          daily_floor_rate?: number | null
          deal_id?: string | null
          dealer_id: string
          description?: string | null
          floor_date?: string | null
          holding_cost?: number | null
          id?: string
          lead_count?: number | null
          list_price?: number | null
          listed_platforms?: string[] | null
          make: string
          market_value?: number | null
          model: string
          notes?: string | null
          odometer?: number | null
          other_costs?: number | null
          photos?: string[] | null
          purchase_price?: number
          purchased_city?: string | null
          purchased_from?: string | null
          purchased_state?: string | null
          recon_cost?: number | null
          repair_cost?: number | null
          sold_date?: string | null
          sold_price?: number | null
          stage?: string | null
          title_fee?: number | null
          total_cost?: number | null
          transport_cost?: number | null
          trim?: string | null
          updated_at?: string | null
          vin: string
          year: number
        }
        Update: {
          auction_fee?: number | null
          color?: string | null
          condition?: string | null
          created_at?: string | null
          daily_floor_rate?: number | null
          deal_id?: string | null
          dealer_id?: string
          description?: string | null
          floor_date?: string | null
          holding_cost?: number | null
          id?: string
          lead_count?: number | null
          list_price?: number | null
          listed_platforms?: string[] | null
          make?: string
          market_value?: number | null
          model?: string
          notes?: string | null
          odometer?: number | null
          other_costs?: number | null
          photos?: string[] | null
          purchase_price?: number
          purchased_city?: string | null
          purchased_from?: string | null
          purchased_state?: string | null
          recon_cost?: number | null
          repair_cost?: number | null
          sold_date?: string | null
          sold_price?: number | null
          stage?: string | null
          title_fee?: number | null
          total_cost?: number | null
          transport_cost?: number | null
          trim?: string | null
          updated_at?: string | null
          vin?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_vehicle_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_vehicle_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ask_price: number | null
          created_at: string | null
          days_listed: number | null
          dealer_id: string | null
          estimated_margin: number | null
          id: string
          listing_url: string | null
          market_value: number | null
          notes: string | null
          outreach_message: string | null
          outreach_status: string | null
          seller_email: string | null
          seller_phone: string | null
          source: string
          updated_at: string | null
          vehicle: string
        }
        Insert: {
          ask_price?: number | null
          created_at?: string | null
          days_listed?: number | null
          dealer_id?: string | null
          estimated_margin?: number | null
          id?: string
          listing_url?: string | null
          market_value?: number | null
          notes?: string | null
          outreach_message?: string | null
          outreach_status?: string | null
          seller_email?: string | null
          seller_phone?: string | null
          source: string
          updated_at?: string | null
          vehicle: string
        }
        Update: {
          ask_price?: number | null
          created_at?: string | null
          days_listed?: number | null
          dealer_id?: string | null
          estimated_margin?: number | null
          id?: string
          listing_url?: string | null
          market_value?: number | null
          notes?: string | null
          outreach_message?: string | null
          outreach_status?: string | null
          seller_email?: string | null
          seller_phone?: string | null
          source?: string
          updated_at?: string | null
          vehicle?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          deal_id: string
          id: number
          observed_at: string
          price: number
        }
        Insert: {
          deal_id: string
          id?: number
          observed_at?: string
          price: number
        }
        Update: {
          deal_id?: string
          id?: number
          observed_at?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_history_listing_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_listing_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string | null
          created_at: string
          daily_floor_rate: number | null
          default_auction_fee: number | null
          default_recon: number | null
          email: string
          full_name: string | null
          id: string
          license_number: string | null
          min_profit_target: number | null
          phone: string | null
          plan: Database["public"]["Enums"]["user_plan"]
          preferred_states: string[] | null
          preferred_types: Database["public"]["Enums"]["dealer_type"][] | null
          price_range_max: number | null
          price_range_min: number | null
          state: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          target_profit: number | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          daily_floor_rate?: number | null
          default_auction_fee?: number | null
          default_recon?: number | null
          email: string
          full_name?: string | null
          id: string
          license_number?: string | null
          min_profit_target?: number | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["user_plan"]
          preferred_states?: string[] | null
          preferred_types?: Database["public"]["Enums"]["dealer_type"][] | null
          price_range_max?: number | null
          price_range_min?: number | null
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          target_profit?: number | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          daily_floor_rate?: number | null
          default_auction_fee?: number | null
          default_recon?: number | null
          email?: string
          full_name?: string | null
          id?: string
          license_number?: string | null
          min_profit_target?: number | null
          phone?: string | null
          plan?: Database["public"]["Enums"]["user_plan"]
          preferred_states?: string[] | null
          preferred_types?: Database["public"]["Enums"]["dealer_type"][] | null
          price_range_max?: number | null
          price_range_min?: number | null
          state?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          target_profit?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      recon_stages: {
        Row: {
          actual_cost: number | null
          completed_at: string | null
          dealer_id: string | null
          estimated_completion: string | null
          estimated_cost: number | null
          id: string
          inventory_id: string | null
          notes: string | null
          shop_name: string | null
          stage: string
          started_at: string | null
        }
        Insert: {
          actual_cost?: number | null
          completed_at?: string | null
          dealer_id?: string | null
          estimated_completion?: string | null
          estimated_cost?: number | null
          id?: string
          inventory_id?: string | null
          notes?: string | null
          shop_name?: string | null
          stage: string
          started_at?: string | null
        }
        Update: {
          actual_cost?: number | null
          completed_at?: string | null
          dealer_id?: string | null
          estimated_completion?: string | null
          estimated_cost?: number | null
          id?: string
          inventory_id?: string | null
          notes?: string | null
          shop_name?: string | null
          stage?: string
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recon_stages_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recon_stages_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_credentials: {
        Row: {
          payload: string
          source_id: string
          updated_at: string | null
        }
        Insert: {
          payload: string
          source_id: string
          updated_at?: string | null
        }
        Update: {
          payload?: string
          source_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scraper_runs: {
        Row: {
          completed_at: string | null
          deals_found: number | null
          deals_new: number | null
          deals_updated: number | null
          duration_ms: number | null
          error_message: string | null
          id: string
          source: Database["public"]["Enums"]["deal_source"]
          started_at: string
          status: Database["public"]["Enums"]["scraper_status"]
        }
        Insert: {
          completed_at?: string | null
          deals_found?: number | null
          deals_new?: number | null
          deals_updated?: number | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          source: Database["public"]["Enums"]["deal_source"]
          started_at?: string
          status?: Database["public"]["Enums"]["scraper_status"]
        }
        Update: {
          completed_at?: string | null
          deals_found?: number | null
          deals_new?: number | null
          deals_updated?: number | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          source?: Database["public"]["Enums"]["deal_source"]
          started_at?: string
          status?: Database["public"]["Enums"]["scraper_status"]
        }
        Relationships: []
      }
      scraper_state: {
        Row: {
          auto_disable_threshold: number | null
          average_duration_ms: number | null
          consecutive_failures: number | null
          enabled: boolean | null
          estimated_listings_per_run: number | null
          last_run_at: string | null
          run_count: number | null
          source_id: string
          success_rate: number | null
          updated_at: string | null
        }
        Insert: {
          auto_disable_threshold?: number | null
          average_duration_ms?: number | null
          consecutive_failures?: number | null
          enabled?: boolean | null
          estimated_listings_per_run?: number | null
          last_run_at?: string | null
          run_count?: number | null
          source_id: string
          success_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_disable_threshold?: number | null
          average_duration_ms?: number | null
          consecutive_failures?: number | null
          enabled?: boolean | null
          estimated_listings_per_run?: number | null
          last_run_at?: string | null
          run_count?: number | null
          source_id?: string
          success_rate?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      transports: {
        Row: {
          actual_delivery: string | null
          booked_price: number | null
          carrier: string | null
          carrier_contact: string | null
          created_at: string | null
          dealer_id: string | null
          estimated_delivery: string | null
          from_state: string | null
          from_zip: string | null
          id: string
          inventory_id: string | null
          miles: number | null
          notes: string | null
          pickup_date: string | null
          quoted_price: number | null
          status: string | null
          to_state: string | null
          to_zip: string | null
          tracking_url: string | null
          trailer_type: string | null
        }
        Insert: {
          actual_delivery?: string | null
          booked_price?: number | null
          carrier?: string | null
          carrier_contact?: string | null
          created_at?: string | null
          dealer_id?: string | null
          estimated_delivery?: string | null
          from_state?: string | null
          from_zip?: string | null
          id?: string
          inventory_id?: string | null
          miles?: number | null
          notes?: string | null
          pickup_date?: string | null
          quoted_price?: number | null
          status?: string | null
          to_state?: string | null
          to_zip?: string | null
          tracking_url?: string | null
          trailer_type?: string | null
        }
        Update: {
          actual_delivery?: string | null
          booked_price?: number | null
          carrier?: string | null
          carrier_contact?: string | null
          created_at?: string | null
          dealer_id?: string | null
          estimated_delivery?: string | null
          from_state?: string | null
          from_zip?: string | null
          id?: string
          inventory_id?: string | null
          miles?: number | null
          notes?: string | null
          pickup_date?: string | null
          quoted_price?: number | null
          status?: string | null
          to_state?: string | null
          to_zip?: string | null
          tracking_url?: string | null
          trailer_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transports_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transports_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          alert_threshold: number | null
          created_at: string
          deal_id: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          alert_threshold?: number | null
          created_at?: string
          deal_id: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          alert_threshold?: number | null
          created_at?: string
          deal_id?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_listing_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_listing_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      top_deals: {
        Row: {
          active: boolean | null
          ask_price: number | null
          auction_end_at: string | null
          body_style: string | null
          buy_now_price: number | null
          cargurus_price: number | null
          color: string | null
          condition: Database["public"]["Enums"]["listing_condition"] | null
          created_at: string | null
          damage_type: string | null
          dealer_id: string | null
          dealer_name: string | null
          dealer_score: number | null
          dealer_type: Database["public"]["Enums"]["dealer_type"] | null
          drivetrain: string | null
          engine: string | null
          first_seen_at: string | null
          fuel_type: string | null
          id: string | null
          images: string[] | null
          kbb_retail: number | null
          kbb_trade_in: number | null
          keys_present: boolean | null
          last_seen_at: string | null
          lat: number | null
          lng: number | null
          location: unknown
          location_city: string | null
          location_state: string | null
          location_zip: string | null
          make: string | null
          mileage: number | null
          mmr_value: number | null
          model: string | null
          profit_estimate: number | null
          profit_score: number | null
          roi_pct: number | null
          run_drive: boolean | null
          source: Database["public"]["Enums"]["deal_source"] | null
          source_listing_id: string | null
          source_url: string | null
          title: string | null
          transmission: string | null
          trim: string | null
          updated_at: string | null
          vin: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      dealers_near: {
        Args: { radius_miles?: number; user_lat: number; user_lng: number }
        Returns: {
          active_deals: number | null
          address: string | null
          avg_ask_price: number | null
          avg_mmr_value: number | null
          avg_profit_estimate: number | null
          city: string
          created_at: string
          deal_score: number | null
          email: string | null
          embedding: string | null
          id: string
          last_scraped_at: string | null
          lat: number
          lng: number
          location: unknown
          name: string
          notes: string | null
          phone: string | null
          slug: string
          source_url: string | null
          state: string
          type: Database["public"]["Enums"]["dealer_type"]
          updated_at: string
          verified: boolean | null
          website: string | null
          zip: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "dealers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      detect_duplicates_by_vin: {
        Args: { vin_filter?: string[] }
        Returns: undefined
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      gettransactionid: { Args: never; Returns: unknown }
      longtransactionsenabled: { Args: never; Returns: boolean }
      match_deals: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
          title: string
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      search_deals: {
        Args: { query: string }
        Returns: {
          active: boolean | null
          ai_rationale: string | null
          ai_retail_estimate: number | null
          ai_wholesale_estimate: number | null
          ask_price: number
          auction_end_at: string | null
          body_style: string | null
          buy_now_price: number | null
          cargurus_price: number | null
          color: string | null
          condition: Database["public"]["Enums"]["listing_condition"]
          created_at: string
          damage_type: string | null
          dealer_id: string | null
          drivetrain: string | null
          duplicate_confidence: number | null
          duplicate_of_id: string | null
          embedding: string | null
          engine: string | null
          estimated_repair_cost: number | null
          estimated_transport_cost: number | null
          first_seen_at: string
          fuel_type: string | null
          id: string
          images: string[] | null
          is_arbitrage_opportunity: boolean | null
          kbb_retail: number | null
          kbb_trade_in: number | null
          keys_present: boolean | null
          last_price_change_at: string | null
          last_seen_at: string
          lat: number | null
          lng: number | null
          location: unknown
          location_city: string | null
          location_state: string | null
          location_zip: string | null
          make: string
          mileage: number | null
          mmr_value: number | null
          model: string
          profit_estimate: number | null
          profit_score: number | null
          run_drive: boolean | null
          source: Database["public"]["Enums"]["deal_source"]
          source_deal_id: string
          source_url: string
          title: string
          transmission: string | null
          trim: string | null
          true_net_profit: number | null
          updated_at: string
          vin: string | null
          year: number
        }[]
        SetofOptions: {
          from: "*"
          to: "deals"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      alert_type:
        | "price_drop"
        | "new_listing"
        | "auction_ending"
        | "dealer_update"
      deal_source:
        | "copart"
        | "iaa"
        | "adesa"
        | "manheim"
        | "facebook_marketplace"
        | "craigslist"
        | "ebay_motors"
        | "autotrader"
        | "cars_com"
        | "gov_auction"
        | "repo_network"
        | "independent_dealer"
        | "cargurus"
      dealer_type:
        | "auction_reseller"
        | "salvage_rebuild"
        | "wholesale_reseller"
        | "independent"
        | "repo_fleet"
        | "parts_only"
      listing_condition:
        | "run_drive"
        | "repairable"
        | "parts_only"
        | "clean_title"
        | "rebuilt_title"
        | "salvage_title"
        | "flood"
        | "fire"
        | "hail"
      scraper_status: "idle" | "running" | "success" | "error" | "rate_limited"
      user_plan: "scout" | "dealer_pro" | "dealer_elite" | "api"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_type: [
        "price_drop",
        "new_listing",
        "auction_ending",
        "dealer_update",
      ],
      deal_source: [
        "copart",
        "iaa",
        "adesa",
        "manheim",
        "facebook_marketplace",
        "craigslist",
        "ebay_motors",
        "autotrader",
        "cars_com",
        "gov_auction",
        "repo_network",
        "independent_dealer",
        "cargurus",
      ],
      dealer_type: [
        "auction_reseller",
        "salvage_rebuild",
        "wholesale_reseller",
        "independent",
        "repo_fleet",
        "parts_only",
      ],
      listing_condition: [
        "run_drive",
        "repairable",
        "parts_only",
        "clean_title",
        "rebuilt_title",
        "salvage_title",
        "flood",
        "fire",
        "hail",
      ],
      scraper_status: ["idle", "running", "success", "error", "rate_limited"],
      user_plan: ["scout", "dealer_pro", "dealer_elite", "api"],
    },
  },
} as const
