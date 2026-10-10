export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
            referencedRelation: "flash_deals"
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
            referencedRelation: "flash_deals"
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
      api_keys: {
        Row: {
          created_at: string | null
          id: string
          key_hash: string
          key_prefix: string | null
          last_used_at: string | null
          name: string | null
          request_count: number | null
          revoked: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_hash: string
          key_prefix?: string | null
          last_used_at?: string | null
          name?: string | null
          request_count?: number | null
          revoked?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string | null
          last_used_at?: string | null
          name?: string | null
          request_count?: number | null
          revoked?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      auction_run_lists: {
        Row: {
          auction_date: string
          auction_name: string
          created_at: string
          id: string
          processed_count: number
          results: Json
          status: string
          total_count: number
          updated_at: string
          user_id: string
          vins: string[]
        }
        Insert: {
          auction_date: string
          auction_name: string
          created_at?: string
          id?: string
          processed_count?: number
          results?: Json
          status?: string
          total_count?: number
          updated_at?: string
          user_id: string
          vins?: string[]
        }
        Update: {
          auction_date?: string
          auction_name?: string
          created_at?: string
          id?: string
          processed_count?: number
          results?: Json
          status?: string
          total_count?: number
          updated_at?: string
          user_id?: string
          vins?: string[]
        }
        Relationships: []
      }
      changelog: {
        Row: {
          body: string | null
          features: string[] | null
          fixes: string[] | null
          id: string
          is_major: boolean | null
          published_at: string | null
          title: string
          version: string | null
        }
        Insert: {
          body?: string | null
          features?: string[] | null
          fixes?: string[] | null
          id?: string
          is_major?: boolean | null
          published_at?: string | null
          title: string
          version?: string | null
        }
        Update: {
          body?: string | null
          features?: string[] | null
          fixes?: string[] | null
          id?: string
          is_major?: boolean | null
          published_at?: string | null
          title?: string
          version?: string | null
        }
        Relationships: []
      }
      deal_outcomes: {
        Row: {
          actual_fees: number | null
          actual_profit: number | null
          actual_recon: number | null
          actual_transport: number | null
          created_at: string | null
          days_to_sell: number | null
          deal_id: string | null
          id: string
          inventory_id: string | null
          location_state: string | null
          make: string | null
          model: string | null
          notes: string | null
          predicted_profit: number | null
          predicted_recon: number | null
          predicted_sell: number | null
          predicted_transport: number | null
          purchase_price: number
          purchased_at: string | null
          sell_price: number | null
          sold_at: string | null
          sold_where: string | null
          user_id: string
          vin: string | null
          year: number | null
        }
        Insert: {
          actual_fees?: number | null
          actual_profit?: number | null
          actual_recon?: number | null
          actual_transport?: number | null
          created_at?: string | null
          days_to_sell?: number | null
          deal_id?: string | null
          id?: string
          inventory_id?: string | null
          location_state?: string | null
          make?: string | null
          model?: string | null
          notes?: string | null
          predicted_profit?: number | null
          predicted_recon?: number | null
          predicted_sell?: number | null
          predicted_transport?: number | null
          purchase_price: number
          purchased_at?: string | null
          sell_price?: number | null
          sold_at?: string | null
          sold_where?: string | null
          user_id: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          actual_fees?: number | null
          actual_profit?: number | null
          actual_recon?: number | null
          actual_transport?: number | null
          created_at?: string | null
          days_to_sell?: number | null
          deal_id?: string | null
          id?: string
          inventory_id?: string | null
          location_state?: string | null
          make?: string | null
          model?: string | null
          notes?: string | null
          predicted_profit?: number | null
          predicted_recon?: number | null
          predicted_sell?: number | null
          predicted_transport?: number | null
          purchase_price?: number
          purchased_at?: string | null
          sell_price?: number | null
          sold_at?: string | null
          sold_where?: string | null
          user_id?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_outcomes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_outcomes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "flash_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_outcomes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_outcomes_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_views: {
        Row: {
          created_at: string | null
          day: string
          deal_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          day?: string
          deal_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          day?: string
          deal_id?: string
          user_id?: string
        }
        Relationships: []
      }
      dealer_calibration: {
        Row: {
          computed_at: string | null
          confidence_score: number | null
          last_updated: string | null
          profit_accuracy_pct: number | null
          recent_avg_profit: number | null
          recent_avg_roi: number | null
          recent_win_rate: number | null
          recon_multiplier: number | null
          sample_size: number | null
          sell_price_accuracy_pct: number | null
          transport_multiplier: number | null
          user_id: string
        }
        Insert: {
          computed_at?: string | null
          confidence_score?: number | null
          last_updated?: string | null
          profit_accuracy_pct?: number | null
          recent_avg_profit?: number | null
          recent_avg_roi?: number | null
          recent_win_rate?: number | null
          recon_multiplier?: number | null
          sample_size?: number | null
          sell_price_accuracy_pct?: number | null
          transport_multiplier?: number | null
          user_id: string
        }
        Update: {
          computed_at?: string | null
          confidence_score?: number | null
          last_updated?: string | null
          profit_accuracy_pct?: number | null
          recent_avg_profit?: number | null
          recent_avg_roi?: number | null
          recent_win_rate?: number | null
          recon_multiplier?: number | null
          sample_size?: number | null
          sell_price_accuracy_pct?: number | null
          transport_multiplier?: number | null
          user_id?: string
        }
        Relationships: []
      }
      dealer_deals: {
        Row: {
          actual_all_in_cost: number | null
          actual_fees: number | null
          actual_holding_cost: number | null
          actual_profit: number | null
          actual_recon: number | null
          actual_roi: number | null
          actual_transport: number | null
          created_at: string | null
          days_to_sell: number | null
          deal_id: string | null
          id: string
          make: string | null
          mileage: number | null
          model: string | null
          notes: string | null
          platform_est_profit: number | null
          platform_est_recon: number | null
          platform_est_sell: number | null
          platform_est_transport: number | null
          purchase_date: string | null
          purchase_price: number | null
          purchase_source: string | null
          purchased: boolean | null
          sell_channel: string | null
          sell_date: string | null
          sell_price: number | null
          sold: boolean | null
          updated_at: string | null
          user_id: string
          vin: string | null
          year: number | null
        }
        Insert: {
          actual_all_in_cost?: number | null
          actual_fees?: number | null
          actual_holding_cost?: number | null
          actual_profit?: number | null
          actual_recon?: number | null
          actual_roi?: number | null
          actual_transport?: number | null
          created_at?: string | null
          days_to_sell?: number | null
          deal_id?: string | null
          id?: string
          make?: string | null
          mileage?: number | null
          model?: string | null
          notes?: string | null
          platform_est_profit?: number | null
          platform_est_recon?: number | null
          platform_est_sell?: number | null
          platform_est_transport?: number | null
          purchase_date?: string | null
          purchase_price?: number | null
          purchase_source?: string | null
          purchased?: boolean | null
          sell_channel?: string | null
          sell_date?: string | null
          sell_price?: number | null
          sold?: boolean | null
          updated_at?: string | null
          user_id: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          actual_all_in_cost?: number | null
          actual_fees?: number | null
          actual_holding_cost?: number | null
          actual_profit?: number | null
          actual_recon?: number | null
          actual_roi?: number | null
          actual_transport?: number | null
          created_at?: string | null
          days_to_sell?: number | null
          deal_id?: string | null
          id?: string
          make?: string | null
          mileage?: number | null
          model?: string | null
          notes?: string | null
          platform_est_profit?: number | null
          platform_est_recon?: number | null
          platform_est_sell?: number | null
          platform_est_transport?: number | null
          purchase_date?: string | null
          purchase_price?: number | null
          purchase_source?: string | null
          purchased?: boolean | null
          sell_channel?: string | null
          sell_date?: string | null
          sell_price?: number | null
          sold?: boolean | null
          updated_at?: string | null
          user_id?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dealer_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "flash_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_profiles: {
        Row: {
          baseline_fees: number | null
          baseline_recon: number | null
          baseline_transport: number | null
          business_name: string | null
          created_at: string | null
          home_city: string | null
          home_lat: number | null
          home_lng: number | null
          home_state: string | null
          license_number: string | null
          lot_size: number | null
          max_buy_price: number | null
          min_profit_threshold: number | null
          preferred_makes: string[] | null
          target_roi: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          baseline_fees?: number | null
          baseline_recon?: number | null
          baseline_transport?: number | null
          business_name?: string | null
          created_at?: string | null
          home_city?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_state?: string | null
          license_number?: string | null
          lot_size?: number | null
          max_buy_price?: number | null
          min_profit_threshold?: number | null
          preferred_makes?: string[] | null
          target_roi?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          baseline_fees?: number | null
          baseline_recon?: number | null
          baseline_transport?: number | null
          business_name?: string | null
          created_at?: string | null
          home_city?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_state?: string | null
          license_number?: string | null
          lot_size?: number | null
          max_buy_price?: number | null
          min_profit_threshold?: number | null
          preferred_makes?: string[] | null
          target_roi?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dealers: {
        Row: {
          active_deals: number | null
          address: string | null
          auction_fee_default: number | null
          avg_ask_price: number | null
          avg_mmr_value: number | null
          avg_profit_estimate: number | null
          city: string
          created_at: string
          daily_floor_rate: number | null
          deal_score: number | null
          email: string | null
          embedding: string | null
          home_state: string | null
          id: string
          last_scraped_at: string | null
          lat: number
          lng: number
          location: unknown | null
          name: string
          notes: string | null
          notify_price_drops: boolean | null
          phone: string | null
          recon_cost_default: number | null
          slug: string
          source_url: string | null
          state: string
          target_profit: number | null
          type: Database["public"]["Enums"]["dealer_type"]
          updated_at: string
          verified: boolean | null
          website: string | null
          zip: string | null
        }
        Insert: {
          active_deals?: number | null
          address?: string | null
          auction_fee_default?: number | null
          avg_ask_price?: number | null
          avg_mmr_value?: number | null
          avg_profit_estimate?: number | null
          city: string
          created_at?: string
          daily_floor_rate?: number | null
          deal_score?: number | null
          email?: string | null
          embedding?: string | null
          home_state?: string | null
          id?: string
          last_scraped_at?: string | null
          lat: number
          lng: number
          location?: unknown | null
          name: string
          notes?: string | null
          notify_price_drops?: boolean | null
          phone?: string | null
          recon_cost_default?: number | null
          slug: string
          source_url?: string | null
          state: string
          target_profit?: number | null
          type: Database["public"]["Enums"]["dealer_type"]
          updated_at?: string
          verified?: boolean | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          active_deals?: number | null
          address?: string | null
          auction_fee_default?: number | null
          avg_ask_price?: number | null
          avg_mmr_value?: number | null
          avg_profit_estimate?: number | null
          city?: string
          created_at?: string
          daily_floor_rate?: number | null
          deal_score?: number | null
          email?: string | null
          embedding?: string | null
          home_state?: string | null
          id?: string
          last_scraped_at?: string | null
          lat?: number
          lng?: number
          location?: unknown | null
          name?: string
          notes?: string | null
          notify_price_drops?: boolean | null
          phone?: string | null
          recon_cost_default?: number | null
          slug?: string
          source_url?: string | null
          state?: string
          target_profit?: number | null
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
          assembly_country: string | null
          assembly_plant: string | null
          auction_end_at: string | null
          availability_status: string | null
          body_class: string | null
          body_style: string | null
          buy_now_price: number | null
          cargurus_price: number | null
          color: string | null
          condition: Database["public"]["Enums"]["listing_condition"]
          created_at: string
          damage_type: string | null
          deal_analysis: Json | null
          deal_verdict: string | null
          dealer_id: string | null
          drivetrain: string | null
          duplicate_confidence: number | null
          duplicate_of_id: string | null
          embedded_at: string | null
          embedding: string | null
          embedding_source_hash: string | null
          engine: string | null
          estimated_repair_cost: number | null
          estimated_transport_cost: number | null
          first_seen_at: string
          flash_alert_sent: boolean | null
          fuel_type: string | null
          id: string
          images: string[] | null
          images_cached: boolean | null
          is_arbitrage_opportunity: boolean | null
          kbb_retail: number | null
          kbb_trade_in: number | null
          keys_present: boolean | null
          last_price_change_at: string | null
          last_seen_at: string
          lat: number | null
          lng: number | null
          location: unknown | null
          location_city: string | null
          location_state: string | null
          location_zip: string | null
          make: string
          mileage: number | null
          mmr_value: number | null
          model: string
          options: Json | null
          price_drop_amount: number | null
          price_drop_days: number | null
          price_gap_detected: boolean | null
          pricing_breakdown: Json | null
          profit_estimate: number | null
          profit_score: number | null
          recalls_count: number | null
          recommended_max_bid: number | null
          run_drive: boolean | null
          sell_estimate: number | null
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
          assembly_country?: string | null
          assembly_plant?: string | null
          auction_end_at?: string | null
          availability_status?: string | null
          body_class?: string | null
          body_style?: string | null
          buy_now_price?: number | null
          cargurus_price?: number | null
          color?: string | null
          condition: Database["public"]["Enums"]["listing_condition"]
          created_at?: string
          damage_type?: string | null
          deal_analysis?: Json | null
          deal_verdict?: string | null
          dealer_id?: string | null
          drivetrain?: string | null
          duplicate_confidence?: number | null
          duplicate_of_id?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_source_hash?: string | null
          engine?: string | null
          estimated_repair_cost?: number | null
          estimated_transport_cost?: number | null
          first_seen_at?: string
          flash_alert_sent?: boolean | null
          fuel_type?: string | null
          id?: string
          images?: string[] | null
          images_cached?: boolean | null
          is_arbitrage_opportunity?: boolean | null
          kbb_retail?: number | null
          kbb_trade_in?: number | null
          keys_present?: boolean | null
          last_price_change_at?: string | null
          last_seen_at?: string
          lat?: number | null
          lng?: number | null
          location?: unknown | null
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          make: string
          mileage?: number | null
          mmr_value?: number | null
          model: string
          options?: Json | null
          price_drop_amount?: number | null
          price_drop_days?: number | null
          price_gap_detected?: boolean | null
          pricing_breakdown?: Json | null
          profit_estimate?: number | null
          profit_score?: number | null
          recalls_count?: number | null
          recommended_max_bid?: number | null
          run_drive?: boolean | null
          sell_estimate?: number | null
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
          assembly_country?: string | null
          assembly_plant?: string | null
          auction_end_at?: string | null
          availability_status?: string | null
          body_class?: string | null
          body_style?: string | null
          buy_now_price?: number | null
          cargurus_price?: number | null
          color?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"]
          created_at?: string
          damage_type?: string | null
          deal_analysis?: Json | null
          deal_verdict?: string | null
          dealer_id?: string | null
          drivetrain?: string | null
          duplicate_confidence?: number | null
          duplicate_of_id?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_source_hash?: string | null
          engine?: string | null
          estimated_repair_cost?: number | null
          estimated_transport_cost?: number | null
          first_seen_at?: string
          flash_alert_sent?: boolean | null
          fuel_type?: string | null
          id?: string
          images?: string[] | null
          images_cached?: boolean | null
          is_arbitrage_opportunity?: boolean | null
          kbb_retail?: number | null
          kbb_trade_in?: number | null
          keys_present?: boolean | null
          last_price_change_at?: string | null
          last_seen_at?: string
          lat?: number | null
          lng?: number | null
          location?: unknown | null
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          make?: string
          mileage?: number | null
          mmr_value?: number | null
          model?: string
          options?: Json | null
          price_drop_amount?: number | null
          price_drop_days?: number | null
          price_gap_detected?: boolean | null
          pricing_breakdown?: Json | null
          profit_estimate?: number | null
          profit_score?: number | null
          recalls_count?: number | null
          recommended_max_bid?: number | null
          run_drive?: boolean | null
          sell_estimate?: number | null
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
      finance_lenders: {
        Row: {
          advance_percentage: number | null
          created_at: string | null
          dealer_id: string
          id: string
          is_default: boolean | null
          monthly_rate: number
          name: string
          setup_fee: number | null
          updated_at: string | null
        }
        Insert: {
          advance_percentage?: number | null
          created_at?: string | null
          dealer_id: string
          id?: string
          is_default?: boolean | null
          monthly_rate: number
          name: string
          setup_fee?: number | null
          updated_at?: string | null
        }
        Update: {
          advance_percentage?: number | null
          created_at?: string | null
          dealer_id?: string
          id?: string
          is_default?: boolean | null
          monthly_rate?: number
          name?: string
          setup_fee?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_lenders_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          created_at: string | null
          lat: number
          lng: number
          place_key: string
          source: string | null
        }
        Insert: {
          created_at?: string | null
          lat: number
          lng: number
          place_key: string
          source?: string | null
        }
        Update: {
          created_at?: string | null
          lat?: number
          lng?: number
          place_key?: string
          source?: string | null
        }
        Relationships: []
      }
      harvest_states: {
        Row: {
          created_at: string
          requested_by: string | null
          source: string
          state: string
        }
        Insert: {
          created_at?: string
          requested_by?: string | null
          source?: string
          state: string
        }
        Update: {
          created_at?: string
          requested_by?: string | null
          source?: string
          state?: string
        }
        Relationships: []
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
            referencedRelation: "flash_deals"
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
      market_aggregates: {
        Row: {
          avg_ask: number | null
          avg_days_listed: number | null
          avg_market_value: number | null
          avg_profit: number | null
          category: string | null
          computed_at: string | null
          id: string
          make: string | null
          median_ask: number | null
          median_odometer: number | null
          model: string | null
          period: string | null
          source: string | null
          state: string | null
          trim: string | null
          unit_count: number | null
          year: number | null
        }
        Insert: {
          avg_ask?: number | null
          avg_days_listed?: number | null
          avg_market_value?: number | null
          avg_profit?: number | null
          category?: string | null
          computed_at?: string | null
          id?: string
          make?: string | null
          median_ask?: number | null
          median_odometer?: number | null
          model?: string | null
          period?: string | null
          source?: string | null
          state?: string | null
          trim?: string | null
          unit_count?: number | null
          year?: number | null
        }
        Update: {
          avg_ask?: number | null
          avg_days_listed?: number | null
          avg_market_value?: number | null
          avg_profit?: number | null
          category?: string | null
          computed_at?: string | null
          id?: string
          make?: string | null
          median_ask?: number | null
          median_odometer?: number | null
          model?: string | null
          period?: string | null
          source?: string | null
          state?: string | null
          trim?: string | null
          unit_count?: number | null
          year?: number | null
        }
        Relationships: []
      }
      market_trends: {
        Row: {
          avg_days_to_sell: number | null
          avg_price: number
          demand_score: number | null
          id: string
          make: string
          model: string
          recorded_at: string | null
          supply_count: number | null
        }
        Insert: {
          avg_days_to_sell?: number | null
          avg_price: number
          demand_score?: number | null
          id?: string
          make: string
          model: string
          recorded_at?: string | null
          supply_count?: number | null
        }
        Update: {
          avg_days_to_sell?: number | null
          avg_price?: number
          demand_score?: number | null
          id?: string
          make?: string
          model?: string
          recorded_at?: string | null
          supply_count?: number | null
        }
        Relationships: []
      }
      page_views: {
        Row: {
          device: string | null
          id: string
          path: string
          referrer: string | null
          viewed_at: string
        }
        Insert: {
          device?: string | null
          id?: string
          path: string
          referrer?: string | null
          viewed_at?: string
        }
        Update: {
          device?: string | null
          id?: string
          path?: string
          referrer?: string | null
          viewed_at?: string
        }
        Relationships: []
      }
      parts_estimates: {
        Row: {
          created_at: string | null
          dealer_id: string
          id: string
          inventory_id: string | null
          parts_list: Json
          total_estimate: number
          updated_at: string | null
          vehicle_name: string | null
        }
        Insert: {
          created_at?: string | null
          dealer_id: string
          id?: string
          inventory_id?: string | null
          parts_list?: Json
          total_estimate?: number
          updated_at?: string | null
          vehicle_name?: string | null
        }
        Update: {
          created_at?: string | null
          dealer_id?: string
          id?: string
          inventory_id?: string | null
          parts_list?: Json
          total_estimate?: number
          updated_at?: string | null
          vehicle_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_estimates_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_estimates_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
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
            referencedRelation: "flash_deals"
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
          avatar_url: string | null
          city: string | null
          created_at: string
          daily_floor_rate: number | null
          default_auction_fee: number | null
          default_recon: number | null
          email: string
          full_name: string | null
          home_lat: number | null
          home_lng: number | null
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
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          daily_floor_rate?: number | null
          default_auction_fee?: number | null
          default_recon?: number | null
          email: string
          full_name?: string | null
          home_lat?: number | null
          home_lng?: number | null
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
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          daily_floor_rate?: number | null
          default_auction_fee?: number | null
          default_recon?: number | null
          email?: string
          full_name?: string | null
          home_lat?: number | null
          home_lng?: number | null
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
      saved_cars: {
        Row: {
          deal_id: string | null
          dealer_id: string | null
          id: string
          last_checked: string | null
          last_price_seen: number | null
          market_value_at_save: number | null
          notes: string | null
          notified_unavailable: boolean | null
          price_at_save: number | null
          profit_at_save: number | null
          saved_at: string | null
          snapshot: Json
          source_name: string | null
          source_url: string | null
          status: string | null
          tags: string[] | null
          user_id: string
        }
        Insert: {
          deal_id?: string | null
          dealer_id?: string | null
          id?: string
          last_checked?: string | null
          last_price_seen?: number | null
          market_value_at_save?: number | null
          notes?: string | null
          notified_unavailable?: boolean | null
          price_at_save?: number | null
          profit_at_save?: number | null
          saved_at?: string | null
          snapshot: Json
          source_name?: string | null
          source_url?: string | null
          status?: string | null
          tags?: string[] | null
          user_id: string
        }
        Update: {
          deal_id?: string | null
          dealer_id?: string | null
          id?: string
          last_checked?: string | null
          last_price_seen?: number | null
          market_value_at_save?: number | null
          notes?: string | null
          notified_unavailable?: boolean | null
          price_at_save?: number | null
          profit_at_save?: number | null
          saved_at?: string | null
          snapshot?: Json
          source_name?: string | null
          source_url?: string | null
          status?: string | null
          tags?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_cars_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_cars_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "flash_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_cars_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_cars_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          listings_found: number | null
          listings_saved: number | null
          source: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          listings_found?: number | null
          listings_saved?: number | null
          source: string
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          listings_found?: number | null
          listings_saved?: number | null
          source?: string
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      scrape_runs: {
        Row: {
          deals_found: number | null
          duration_ms: number | null
          error: string | null
          id: string
          ok: boolean
          run_at: string | null
          source: string
        }
        Insert: {
          deals_found?: number | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          ok: boolean
          run_at?: string | null
          source: string
        }
        Update: {
          deals_found?: number | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          ok?: boolean
          run_at?: string | null
          source?: string
        }
        Relationships: []
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
          source: string
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
          source: string
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
          source?: string
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
      sold_listings: {
        Row: {
          country_code: string
          created_at: string | null
          currency_code: string
          id: string
          location_state: string | null
          make: string | null
          mileage: number | null
          model: string | null
          sold_at: string | null
          sold_price: number | null
          source: string | null
          source_item_id: string | null
          source_url: string | null
          title: string | null
          trim: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          country_code?: string
          created_at?: string | null
          currency_code?: string
          id?: string
          location_state?: string | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          sold_at?: string | null
          sold_price?: number | null
          source?: string | null
          source_item_id?: string | null
          source_url?: string | null
          title?: string | null
          trim?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          country_code?: string
          created_at?: string | null
          currency_code?: string
          id?: string
          location_state?: string | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          sold_at?: string | null
          sold_price?: number | null
          source?: string | null
          source_item_id?: string | null
          source_url?: string | null
          title?: string | null
          trim?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: []
      }
      source_url_cache: {
        Row: {
          deal_id: string | null
          expires_at: string | null
          scraped_at: string | null
          source: string | null
          url: string
          url_hash: string
        }
        Insert: {
          deal_id?: string | null
          expires_at?: string | null
          scraped_at?: string | null
          source?: string | null
          url: string
          url_hash: string
        }
        Update: {
          deal_id?: string | null
          expires_at?: string | null
          scraped_at?: string | null
          source?: string | null
          url?: string
          url_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_url_cache_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_url_cache_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "flash_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_url_cache_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
        ]
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
      teardowns: {
        Row: {
          created_at: string | null
          dealer_id: string
          id: string
          inventory_id: string | null
          net_profit: number | null
          parts: Json
          parts_value: number | null
          salvage_cost: number | null
        }
        Insert: {
          created_at?: string | null
          dealer_id?: string
          id?: string
          inventory_id?: string | null
          net_profit?: number | null
          parts?: Json
          parts_value?: number | null
          salvage_cost?: number | null
        }
        Update: {
          created_at?: string | null
          dealer_id?: string
          id?: string
          inventory_id?: string | null
          net_profit?: number | null
          parts?: Json
          parts_value?: number | null
          salvage_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teardowns_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teardowns_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_routes: {
        Row: {
          created_at: string | null
          dealer_id: string
          dispatcher_name: string
          dispatcher_phone: string | null
          id: string
          route_name: string | null
          typical_cost: number | null
        }
        Insert: {
          created_at?: string | null
          dealer_id: string
          dispatcher_name: string
          dispatcher_phone?: string | null
          id?: string
          route_name?: string | null
          typical_cost?: number | null
        }
        Update: {
          created_at?: string | null
          dealer_id?: string
          dispatcher_name?: string
          dispatcher_phone?: string | null
          id?: string
          route_name?: string | null
          typical_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_routes_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      user_feed_inbox: {
        Row: {
          created_at: string | null
          deal_id: string
          id: string
          search_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deal_id: string
          id?: string
          search_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deal_id?: string
          id?: string
          search_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feed_inbox_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feed_inbox_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "flash_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feed_inbox_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "top_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feed_inbox_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "user_saved_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          auction_fee_default: number | null
          budget_max: number | null
          budget_min: number | null
          created_at: string | null
          daily_floor_rate: number | null
          home_lat: number | null
          home_lng: number | null
          home_state: string | null
          home_zip: string | null
          id: string
          max_odometer: number | null
          name: string | null
          notify_price_drops: boolean | null
          onboarded: boolean | null
          plan: string | null
          plan_ended_at: string | null
          plan_started_at: string | null
          preferred_body_styles: string[] | null
          preferred_makes: string[] | null
          recon_cost_default: number | null
          role: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          target_profit: number | null
          user_type: string | null
        }
        Insert: {
          auction_fee_default?: number | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string | null
          daily_floor_rate?: number | null
          home_lat?: number | null
          home_lng?: number | null
          home_state?: string | null
          home_zip?: string | null
          id: string
          max_odometer?: number | null
          name?: string | null
          notify_price_drops?: boolean | null
          onboarded?: boolean | null
          plan?: string | null
          plan_ended_at?: string | null
          plan_started_at?: string | null
          preferred_body_styles?: string[] | null
          preferred_makes?: string[] | null
          recon_cost_default?: number | null
          role?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          target_profit?: number | null
          user_type?: string | null
        }
        Update: {
          auction_fee_default?: number | null
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string | null
          daily_floor_rate?: number | null
          home_lat?: number | null
          home_lng?: number | null
          home_state?: string | null
          home_zip?: string | null
          id?: string
          max_odometer?: number | null
          name?: string | null
          notify_price_drops?: boolean | null
          onboarded?: boolean | null
          plan?: string | null
          plan_ended_at?: string | null
          plan_started_at?: string | null
          preferred_body_styles?: string[] | null
          preferred_makes?: string[] | null
          recon_cost_default?: number | null
          role?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          target_profit?: number | null
          user_type?: string | null
        }
        Relationships: []
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
      user_saved_searches: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          make: string | null
          max_distance_miles: number | null
          max_price: number | null
          max_year: number | null
          min_count: number | null
          min_year: number | null
          model: string | null
          name: string
          notify_email: boolean | null
          notify_sms: boolean | null
          require_go: boolean | null
          target_profit: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          make?: string | null
          max_distance_miles?: number | null
          max_price?: number | null
          max_year?: number | null
          min_count?: number | null
          min_year?: number | null
          model?: string | null
          name: string
          notify_email?: boolean | null
          notify_sms?: boolean | null
          require_go?: boolean | null
          target_profit?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          make?: string | null
          max_distance_miles?: number | null
          max_price?: number | null
          max_year?: number | null
          min_count?: number | null
          min_year?: number | null
          model?: string | null
          name?: string
          notify_email?: boolean | null
          notify_sms?: boolean | null
          require_go?: boolean | null
          target_profit?: number | null
          user_id?: string
        }
        Relationships: []
      }
      vin_decodes: {
        Row: {
          body_class: string | null
          cylinders: number | null
          decoded_at: string | null
          displacement_l: number | null
          drive_type: string | null
          extras_at: string | null
          fuel_type: string | null
          made_in_usa: boolean | null
          make: string | null
          model: string | null
          mpg_city: number | null
          mpg_combined: number | null
          mpg_highway: number | null
          plant_country: string | null
          raw: Json | null
          recalls_at: string | null
          recalls_count: number | null
          safety_frontal: number | null
          safety_overall: number | null
          safety_rollover: number | null
          safety_side: number | null
          trim: string | null
          vin: string
          year: number | null
        }
        Insert: {
          body_class?: string | null
          cylinders?: number | null
          decoded_at?: string | null
          displacement_l?: number | null
          drive_type?: string | null
          extras_at?: string | null
          fuel_type?: string | null
          made_in_usa?: boolean | null
          make?: string | null
          model?: string | null
          mpg_city?: number | null
          mpg_combined?: number | null
          mpg_highway?: number | null
          plant_country?: string | null
          raw?: Json | null
          recalls_at?: string | null
          recalls_count?: number | null
          safety_frontal?: number | null
          safety_overall?: number | null
          safety_rollover?: number | null
          safety_side?: number | null
          trim?: string | null
          vin: string
          year?: number | null
        }
        Update: {
          body_class?: string | null
          cylinders?: number | null
          decoded_at?: string | null
          displacement_l?: number | null
          drive_type?: string | null
          extras_at?: string | null
          fuel_type?: string | null
          made_in_usa?: boolean | null
          make?: string | null
          model?: string | null
          mpg_city?: number | null
          mpg_combined?: number | null
          mpg_highway?: number | null
          plant_country?: string | null
          raw?: Json | null
          recalls_at?: string | null
          recalls_count?: number | null
          safety_frontal?: number | null
          safety_overall?: number | null
          safety_rollover?: number | null
          safety_side?: number | null
          trim?: string | null
          vin?: string
          year?: number | null
        }
        Relationships: []
      }
      vin_price_history: {
        Row: {
          asking_price: number | null
          id: string
          location_state: string | null
          market_value: number | null
          recorded_at: string | null
          source: string | null
          vin: string
        }
        Insert: {
          asking_price?: number | null
          id?: string
          location_state?: string | null
          market_value?: number | null
          recorded_at?: string | null
          source?: string | null
          vin: string
        }
        Update: {
          asking_price?: number | null
          id?: string
          location_state?: string | null
          market_value?: number | null
          recorded_at?: string | null
          source?: string | null
          vin?: string
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
            referencedRelation: "flash_deals"
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
      flash_deals: {
        Row: {
          active: boolean | null
          ai_rationale: string | null
          ai_retail_estimate: number | null
          ai_wholesale_estimate: number | null
          ask_price: number | null
          auction_end_at: string | null
          below_market_pct: number | null
          body_style: string | null
          buy_now_price: number | null
          cargurus_price: number | null
          color: string | null
          condition: Database["public"]["Enums"]["listing_condition"] | null
          created_at: string | null
          damage_type: string | null
          deal_analysis: Json | null
          deal_verdict: string | null
          dealer_id: string | null
          drivetrain: string | null
          duplicate_confidence: number | null
          duplicate_of_id: string | null
          embedding: string | null
          engine: string | null
          estimated_repair_cost: number | null
          estimated_transport_cost: number | null
          first_seen_at: string | null
          fuel_type: string | null
          id: string | null
          images: string[] | null
          is_arbitrage_opportunity: boolean | null
          kbb_retail: number | null
          kbb_trade_in: number | null
          keys_present: boolean | null
          last_price_change_at: string | null
          last_seen_at: string | null
          lat: number | null
          lng: number | null
          location: unknown | null
          location_city: string | null
          location_state: string | null
          location_zip: string | null
          make: string | null
          mileage: number | null
          mmr_value: number | null
          model: string | null
          profit_estimate: number | null
          profit_score: number | null
          recommended_max_bid: number | null
          run_drive: boolean | null
          seconds_remaining: number | null
          sell_estimate: number | null
          source: Database["public"]["Enums"]["deal_source"] | null
          source_deal_id: string | null
          source_url: string | null
          title: string | null
          transmission: string | null
          trim: string | null
          true_net_profit: number | null
          updated_at: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          active?: boolean | null
          ai_rationale?: string | null
          ai_retail_estimate?: number | null
          ai_wholesale_estimate?: number | null
          ask_price?: number | null
          auction_end_at?: string | null
          below_market_pct?: never
          body_style?: string | null
          buy_now_price?: number | null
          cargurus_price?: number | null
          color?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"] | null
          created_at?: string | null
          damage_type?: string | null
          deal_analysis?: Json | null
          deal_verdict?: string | null
          dealer_id?: string | null
          drivetrain?: string | null
          duplicate_confidence?: number | null
          duplicate_of_id?: string | null
          embedding?: string | null
          engine?: string | null
          estimated_repair_cost?: number | null
          estimated_transport_cost?: number | null
          first_seen_at?: string | null
          fuel_type?: string | null
          id?: string | null
          images?: string[] | null
          is_arbitrage_opportunity?: boolean | null
          kbb_retail?: number | null
          kbb_trade_in?: number | null
          keys_present?: boolean | null
          last_price_change_at?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          location?: unknown | null
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          make?: string | null
          mileage?: number | null
          mmr_value?: number | null
          model?: string | null
          profit_estimate?: number | null
          profit_score?: number | null
          recommended_max_bid?: number | null
          run_drive?: boolean | null
          seconds_remaining?: never
          sell_estimate?: number | null
          source?: Database["public"]["Enums"]["deal_source"] | null
          source_deal_id?: string | null
          source_url?: string | null
          title?: string | null
          transmission?: string | null
          trim?: string | null
          true_net_profit?: number | null
          updated_at?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          active?: boolean | null
          ai_rationale?: string | null
          ai_retail_estimate?: number | null
          ai_wholesale_estimate?: number | null
          ask_price?: number | null
          auction_end_at?: string | null
          below_market_pct?: never
          body_style?: string | null
          buy_now_price?: number | null
          cargurus_price?: number | null
          color?: string | null
          condition?: Database["public"]["Enums"]["listing_condition"] | null
          created_at?: string | null
          damage_type?: string | null
          deal_analysis?: Json | null
          deal_verdict?: string | null
          dealer_id?: string | null
          drivetrain?: string | null
          duplicate_confidence?: number | null
          duplicate_of_id?: string | null
          embedding?: string | null
          engine?: string | null
          estimated_repair_cost?: number | null
          estimated_transport_cost?: number | null
          first_seen_at?: string | null
          fuel_type?: string | null
          id?: string | null
          images?: string[] | null
          is_arbitrage_opportunity?: boolean | null
          kbb_retail?: number | null
          kbb_trade_in?: number | null
          keys_present?: boolean | null
          last_price_change_at?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          location?: unknown | null
          location_city?: string | null
          location_state?: string | null
          location_zip?: string | null
          make?: string | null
          mileage?: number | null
          mmr_value?: number | null
          model?: string | null
          profit_estimate?: number | null
          profit_score?: number | null
          recommended_max_bid?: number | null
          run_drive?: boolean | null
          seconds_remaining?: never
          sell_estimate?: number | null
          source?: Database["public"]["Enums"]["deal_source"] | null
          source_deal_id?: string | null
          source_url?: string | null
          title?: string | null
          transmission?: string | null
          trim?: string | null
          true_net_profit?: number | null
          updated_at?: string | null
          vin?: string | null
          year?: number | null
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
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown | null
          f_table_catalog: unknown | null
          f_table_name: unknown | null
          f_table_schema: unknown | null
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown | null
          f_table_catalog: string | null
          f_table_name: unknown | null
          f_table_schema: unknown | null
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown | null
          f_table_catalog?: string | null
          f_table_name?: unknown | null
          f_table_schema?: unknown | null
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown | null
          f_table_catalog?: string | null
          f_table_name?: unknown | null
          f_table_schema?: unknown | null
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      market_timing_signals: {
        Row: {
          current_avg: number | null
          data_points: number | null
          make: string | null
          model: string | null
          pct_change: number | null
          prior_avg: number | null
          signal: string | null
        }
        Relationships: []
      }
      source_health: {
        Row: {
          avg_deals: number | null
          last_ok: string | null
          last_run: string | null
          last3_all_failed: boolean | null
          ok_7d: number | null
          runs_7d: number | null
          source: string | null
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
          location: unknown | null
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
        Args: {
          oldname: string
          newname: string
          version: string
        }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: {
          tbl: unknown
          col: string
        }
        Returns: unknown
      }
      _postgis_pgsql_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      _postgis_scripts_pgsql_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      _postgis_selectivity: {
        Args: {
          tbl: unknown
          att_name: string
          geom: unknown
          mode?: string
        }
        Returns: number
      }
      _st_3dintersects: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_bestsrid: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      _st_contains: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_coveredby:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      _st_covers:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      _st_crosses: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
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
      _st_equals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_intersects: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: {
          line1: unknown
          line2: unknown
        }
        Returns: number
      }
      _st_longestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      _st_orderingequals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_overlaps: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_pointoutside: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      _st_sortablehash: {
        Args: {
          geom: unknown
        }
        Returns: number
      }
      _st_touches: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          g1: unknown
          clip?: unknown
          tolerance?: number
          return_polygons?: boolean
        }
        Returns: unknown
      }
      _st_within: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      addauth: {
        Args: {
          "": string
        }
        Returns: boolean
      }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
              column_name: string
              new_srid_in: number
              new_type: string
              new_dim: number
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              schema_name: string
              table_name: string
              column_name: string
              new_srid: number
              new_type: string
              new_dim: number
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              table_name: string
              column_name: string
              new_srid: number
              new_type: string
              new_dim: number
              use_typmod?: boolean
            }
            Returns: string
          }
      binary_quantize:
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      box:
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      box2d:
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      box2d_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box2d_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box2df_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box2df_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box3d:
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      box3d_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box3d_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box3dtobox: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      bytea:
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      compute_dealer_calibration: {
        Args: {
          dealer_user_id: string
        }
        Returns: undefined
      }
      count_by_state: {
        Args: {
          p_table: string
          p_col: string
        }
        Returns: {
          state: string
          n: number
        }[]
      }
      dealer_inventory: {
        Args: Record<PropertyKey, never>
        Returns: {
          host: string
          total: number
          clean: number
          rebuilt: number
          salvage: number
          parts: number
        }[]
      }
      dealers_near: {
        Args: {
          user_lat: number
          user_lng: number
          radius_miles?: number
        }
        Returns: {
          active_deals: number | null
          address: string | null
          auction_fee_default: number | null
          avg_ask_price: number | null
          avg_mmr_value: number | null
          avg_profit_estimate: number | null
          city: string
          created_at: string
          daily_floor_rate: number | null
          deal_score: number | null
          email: string | null
          embedding: string | null
          home_state: string | null
          id: string
          last_scraped_at: string | null
          lat: number
          lng: number
          location: unknown | null
          name: string
          notes: string | null
          notify_price_drops: boolean | null
          phone: string | null
          recon_cost_default: number | null
          slug: string
          source_url: string | null
          state: string
          target_profit: number | null
          type: Database["public"]["Enums"]["dealer_type"]
          updated_at: string
          verified: boolean | null
          website: string | null
          zip: string | null
        }[]
      }
      detect_duplicates_by_vin: {
        Args: {
          vin_filter?: string[]
        }
        Returns: undefined
      }
      disablelongtransactions: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      discover_deals: {
        Args: {
          p_state?: string
          p_max_price?: number
          p_limit?: number
          p_states?: string[]
        }
        Returns: Json
      }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
              column_name: string
            }
            Returns: string
          }
        | {
            Args: {
              schema_name: string
              table_name: string
              column_name: string
            }
            Returns: string
          }
        | {
            Args: {
              table_name: string
              column_name: string
            }
            Returns: string
          }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              table_name: string
            }
            Returns: string
          }
      enablelongtransactions: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      equals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      find_duplicate_vins: {
        Args: {
          limit_count?: number
        }
        Returns: {
          id: string
          vin: string
          count: number
        }[]
      }
      geography:
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      geography_analyze: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      geography_gist_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geography_gist_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geography_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geography_send: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      geography_spgist_compress_nd: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geography_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
      geography_typmod_out: {
        Args: {
          "": number
        }
        Returns: unknown
      }
      geometry:
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      geometry_above: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_analyze: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      geometry_below: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_cmp: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      geometry_contained_3d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_contains: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      geometry_eq: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_ge: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_gist_compress_2d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_gist_compress_nd: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_gist_decompress_2d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_gist_decompress_nd: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_gist_sortsupport_2d: {
        Args: {
          "": unknown
        }
        Returns: undefined
      }
      geometry_gt: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_hash: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      geometry_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_le: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_left: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_lt: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_overabove: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overleft: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overright: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_recv: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_right: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_same: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_send: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      geometry_sortsupport: {
        Args: {
          "": unknown
        }
        Returns: undefined
      }
      geometry_spgist_compress_2d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_spgist_compress_3d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_spgist_compress_nd: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
      geometry_typmod_out: {
        Args: {
          "": number
        }
        Returns: unknown
      }
      geometry_within: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometrytype:
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      geomfromewkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      geomfromewkt: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      get_market_pulse: {
        Args: Record<PropertyKey, never>
        Returns: {
          make: string
          model: string
          go_deals: number
          avg_profit: number
          avg_days: number
        }[]
      }
      get_profit_by_trim: {
        Args: {
          p_make: string
          p_model: string
        }
        Returns: {
          trim_name: string
          go_deals: number
          avg_profit: number
          avg_ask: number
        }[]
      }
      get_proj4_from_srid: {
        Args: {
          "": number
        }
        Returns: string
      }
      gettransactionid: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      gidx_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gidx_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gtrgm_options: {
        Args: {
          "": unknown
        }
        Returns: undefined
      }
      gtrgm_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      halfvec_avg: {
        Args: {
          "": number[]
        }
        Returns: unknown
      }
      halfvec_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      halfvec_send: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      halfvec_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
      hnsw_bit_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      hnsw_halfvec_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      hnsw_sparsevec_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      hnswhandler: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      ivfflat_bit_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      ivfflat_halfvec_support: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      ivfflathandler: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      json: {
        Args: {
          "": unknown
        }
        Returns: Json
      }
      jsonb: {
        Args: {
          "": unknown
        }
        Returns: Json
      }
      l2_norm:
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
      l2_normalize:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      landing_proof: {
        Args: Record<PropertyKey, never>
        Returns: {
          cars_scored: number
          cars_buy: number
          avg_spread: number
          total_spread: number
          new_buys_7d: number
          states: number
        }[]
      }
      longtransactionsenabled: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      match_deals: {
        Args: {
          query_embedding: string
          match_threshold: number
          match_count: number
        }
        Returns: {
          id: string
          title: string
          similarity: number
        }[]
      }
      path: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_asflatgeobuf_finalfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      pgis_asgeobuf_finalfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      pgis_asmvt_finalfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      pgis_asmvt_serialfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      pgis_geometry_clusterintersecting_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown[]
      }
      pgis_geometry_clusterwithin_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown[]
      }
      pgis_geometry_collect_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_geometry_makeline_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_geometry_polygonize_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_geometry_union_parallel_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_geometry_union_parallel_serialfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      point: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      polygon: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      populate_geometry_columns:
        | {
            Args: {
              tbl_oid: unknown
              use_typmod?: boolean
            }
            Returns: number
          }
        | {
            Args: {
              use_typmod?: boolean
            }
            Returns: string
          }
      postgis_addbbox: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_constraint_dims: {
        Args: {
          geomschema: string
          geomtable: string
          geomcolumn: string
        }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: {
          geomschema: string
          geomtable: string
          geomcolumn: string
        }
        Returns: number
      }
      postgis_constraint_type: {
        Args: {
          geomschema: string
          geomtable: string
          geomcolumn: string
        }
        Returns: string
      }
      postgis_dropbbox: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_extensions_upgrade: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_full_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_geos_noop: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_geos_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_getbbox: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_hasbbox: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      postgis_index_supportfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_lib_build_date: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_lib_revision: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_lib_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_libjson_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_liblwgeom_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_libprotobuf_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_libxml_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_noop: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_proj_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_scripts_build_date: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_scripts_installed: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_scripts_released: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_svn_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_type_name: {
        Args: {
          geomname: string
          coord_dimension: number
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_typmod_dims: {
        Args: {
          "": number
        }
        Returns: number
      }
      postgis_typmod_srid: {
        Args: {
          "": number
        }
        Returns: number
      }
      postgis_typmod_type: {
        Args: {
          "": number
        }
        Returns: string
      }
      postgis_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_wagyu_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      search_deals: {
        Args: {
          query: string
        }
        Returns: {
          active: boolean | null
          ai_rationale: string | null
          ai_retail_estimate: number | null
          ai_wholesale_estimate: number | null
          ask_price: number
          assembly_country: string | null
          assembly_plant: string | null
          auction_end_at: string | null
          availability_status: string | null
          body_class: string | null
          body_style: string | null
          buy_now_price: number | null
          cargurus_price: number | null
          color: string | null
          condition: Database["public"]["Enums"]["listing_condition"]
          created_at: string
          damage_type: string | null
          deal_analysis: Json | null
          deal_verdict: string | null
          dealer_id: string | null
          drivetrain: string | null
          duplicate_confidence: number | null
          duplicate_of_id: string | null
          embedding: string | null
          engine: string | null
          estimated_repair_cost: number | null
          estimated_transport_cost: number | null
          first_seen_at: string
          flash_alert_sent: boolean | null
          fuel_type: string | null
          id: string
          images: string[] | null
          images_cached: boolean | null
          is_arbitrage_opportunity: boolean | null
          kbb_retail: number | null
          kbb_trade_in: number | null
          keys_present: boolean | null
          last_price_change_at: string | null
          last_seen_at: string
          lat: number | null
          lng: number | null
          location: unknown | null
          location_city: string | null
          location_state: string | null
          location_zip: string | null
          make: string
          mileage: number | null
          mmr_value: number | null
          model: string
          options: Json | null
          price_drop_amount: number | null
          price_drop_days: number | null
          price_gap_detected: boolean | null
          pricing_breakdown: Json | null
          profit_estimate: number | null
          profit_score: number | null
          recalls_count: number | null
          recommended_max_bid: number | null
          run_drive: boolean | null
          sell_estimate: number | null
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
      }
      set_limit: {
        Args: {
          "": number
        }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: {
          "": string
        }
        Returns: string[]
      }
      similar_deals_by_id: {
        Args: {
          p_deal_id: string
          p_count?: number
          p_threshold?: number
        }
        Returns: {
          id: string
          year: number
          make: string
          model: string
          ask_price: number
          mileage: number
          condition: Database["public"]["Enums"]["listing_condition"]
          deal_verdict: string
          true_net_profit: number
          sell_estimate: number
          profit_score: number
          location_state: string
          location_city: string
          images: string[]
          source: Database["public"]["Enums"]["deal_source"]
          similarity: number
        }[]
      }
      sparsevec_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      sparsevec_send: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      sparsevec_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
      spheroid_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      spheroid_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_3dclosestpoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_3ddistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_3dintersects: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_3dlength: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_3dlongestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_3dperimeter: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_3dshortestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_addpoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_angle:
        | {
            Args: {
              line1: unknown
              line2: unknown
            }
            Returns: number
          }
        | {
            Args: {
              pt1: unknown
              pt2: unknown
              pt3: unknown
              pt4?: unknown
            }
            Returns: number
          }
      st_area:
        | {
            Args: {
              "": string
            }
            Returns: number
          }
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
        | {
            Args: {
              geog: unknown
              use_spheroid?: boolean
            }
            Returns: number
          }
      st_area2d: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_asbinary:
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      st_asencodedpolyline: {
        Args: {
          geom: unknown
          nprecision?: number
        }
        Returns: string
      }
      st_asewkb: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      st_asewkt:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      st_asgeojson:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              geog: unknown
              maxdecimaldigits?: number
              options?: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              maxdecimaldigits?: number
              options?: number
            }
            Returns: string
          }
        | {
            Args: {
              r: Record<string, unknown>
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
            }
            Returns: string
          }
      st_asgml:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              geog: unknown
              maxdecimaldigits?: number
              options?: number
              nprefix?: string
              id?: string
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              maxdecimaldigits?: number
              options?: number
            }
            Returns: string
          }
        | {
            Args: {
              version: number
              geog: unknown
              maxdecimaldigits?: number
              options?: number
              nprefix?: string
              id?: string
            }
            Returns: string
          }
        | {
            Args: {
              version: number
              geom: unknown
              maxdecimaldigits?: number
              options?: number
              nprefix?: string
              id?: string
            }
            Returns: string
          }
      st_ashexewkb: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      st_askml:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              geog: unknown
              maxdecimaldigits?: number
              nprefix?: string
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              maxdecimaldigits?: number
              nprefix?: string
            }
            Returns: string
          }
      st_aslatlontext: {
        Args: {
          geom: unknown
          tmpl?: string
        }
        Returns: string
      }
      st_asmarc21: {
        Args: {
          geom: unknown
          format?: string
        }
        Returns: string
      }
      st_asmvtgeom: {
        Args: {
          geom: unknown
          bounds: unknown
          extent?: number
          buffer?: number
          clip_geom?: boolean
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              geog: unknown
              rel?: number
              maxdecimaldigits?: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              rel?: number
              maxdecimaldigits?: number
            }
            Returns: string
          }
      st_astext:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      st_astwkb:
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_z?: number
              prec_m?: number
              with_sizes?: boolean
              with_boxes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_z?: number
              prec_m?: number
              with_sizes?: boolean
              with_boxes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: {
          geom: unknown
          maxdecimaldigits?: number
          options?: number
        }
        Returns: string
      }
      st_azimuth:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: number
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: number
          }
      st_boundary: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_boundingdiagonal: {
        Args: {
          geom: unknown
          fits?: boolean
        }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: {
              geom: unknown
              radius: number
              options?: string
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              radius: number
              quadsegs: number
            }
            Returns: unknown
          }
      st_buildarea: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_centroid:
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      st_cleangeometry: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_clipbybox2d: {
        Args: {
          geom: unknown
          box: unknown
        }
        Returns: unknown
      }
      st_closestpoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_clusterintersecting: {
        Args: {
          "": unknown[]
        }
        Returns: unknown[]
      }
      st_collect:
        | {
            Args: {
              "": unknown[]
            }
            Returns: unknown
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: unknown
          }
      st_collectionextract: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_collectionhomogenize: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_concavehull: {
        Args: {
          param_geom: unknown
          param_pctconvex: number
          param_allow_holes?: boolean
        }
        Returns: unknown
      }
      st_contains: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_containsproperly: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_convexhull: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_coorddim: {
        Args: {
          geometry: unknown
        }
        Returns: number
      }
      st_coveredby:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      st_covers:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      st_crosses: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_curvetoline: {
        Args: {
          geom: unknown
          tol?: number
          toltype?: number
          flags?: number
        }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: {
          g1: unknown
          tolerance?: number
          flags?: number
        }
        Returns: unknown
      }
      st_difference: {
        Args: {
          geom1: unknown
          geom2: unknown
          gridsize?: number
        }
        Returns: unknown
      }
      st_dimension: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_disjoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_distance:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
              use_spheroid?: boolean
            }
            Returns: number
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: number
          }
      st_distancesphere:
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: number
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
              radius: number
            }
            Returns: number
          }
      st_distancespheroid: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_dump: {
        Args: {
          "": unknown
        }
        Returns: Database["public"]["CompositeTypes"]["geometry_dump"][]
      }
      st_dumppoints: {
        Args: {
          "": unknown
        }
        Returns: Database["public"]["CompositeTypes"]["geometry_dump"][]
      }
      st_dumprings: {
        Args: {
          "": unknown
        }
        Returns: Database["public"]["CompositeTypes"]["geometry_dump"][]
      }
      st_dumpsegments: {
        Args: {
          "": unknown
        }
        Returns: Database["public"]["CompositeTypes"]["geometry_dump"][]
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
      st_endpoint: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_envelope: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_equals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_expand:
        | {
            Args: {
              box: unknown
              dx: number
              dy: number
            }
            Returns: unknown
          }
        | {
            Args: {
              box: unknown
              dx: number
              dy: number
              dz?: number
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              dx: number
              dy: number
              dz?: number
              dm?: number
            }
            Returns: unknown
          }
      st_exteriorring: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_flipcoordinates: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_force2d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_force3d: {
        Args: {
          geom: unknown
          zvalue?: number
        }
        Returns: unknown
      }
      st_force3dm: {
        Args: {
          geom: unknown
          mvalue?: number
        }
        Returns: unknown
      }
      st_force3dz: {
        Args: {
          geom: unknown
          zvalue?: number
        }
        Returns: unknown
      }
      st_force4d: {
        Args: {
          geom: unknown
          zvalue?: number
          mvalue?: number
        }
        Returns: unknown
      }
      st_forcecollection: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcecurve: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcepolygonccw: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcepolygoncw: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcerhr: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcesfs: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_generatepoints:
        | {
            Args: {
              area: unknown
              npoints: number
            }
            Returns: unknown
          }
        | {
            Args: {
              area: unknown
              npoints: number
              seed: number
            }
            Returns: unknown
          }
      st_geogfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geogfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geographyfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geohash:
        | {
            Args: {
              geog: unknown
              maxchars?: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              maxchars?: number
            }
            Returns: string
          }
      st_geomcollfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomcollfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geometricmedian: {
        Args: {
          g: unknown
          tolerance?: number
          max_iter?: number
          fail_if_not_converged?: boolean
        }
        Returns: unknown
      }
      st_geometryfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geometrytype: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      st_geomfromewkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromewkt: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromgeojson:
        | {
            Args: {
              "": Json
            }
            Returns: unknown
          }
        | {
            Args: {
              "": Json
            }
            Returns: unknown
          }
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
      st_geomfromgml: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromkml: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfrommarc21: {
        Args: {
          marc21xml: string
        }
        Returns: unknown
      }
      st_geomfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromtwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_gmltosql: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_hasarc: {
        Args: {
          geometry: unknown
        }
        Returns: boolean
      }
      st_hausdorffdistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_hexagon: {
        Args: {
          size: number
          cell_i: number
          cell_j: number
          origin?: unknown
        }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: {
          size: number
          bounds: unknown
        }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: {
          line: unknown
          point: unknown
        }
        Returns: number
      }
      st_intersection: {
        Args: {
          geom1: unknown
          geom2: unknown
          gridsize?: number
        }
        Returns: unknown
      }
      st_intersects:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      st_isclosed: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_iscollection: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_isempty: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_ispolygonccw: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_ispolygoncw: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_isring: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_issimple: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_isvalid: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_isvaliddetail: {
        Args: {
          geom: unknown
          flags?: number
        }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
      }
      st_isvalidreason: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      st_isvalidtrajectory: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_length:
        | {
            Args: {
              "": string
            }
            Returns: number
          }
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
        | {
            Args: {
              geog: unknown
              use_spheroid?: boolean
            }
            Returns: number
          }
      st_length2d: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_letters: {
        Args: {
          letters: string
          font?: Json
        }
        Returns: unknown
      }
      st_linecrossingdirection: {
        Args: {
          line1: unknown
          line2: unknown
        }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: {
          txtin: string
          nprecision?: number
        }
        Returns: unknown
      }
      st_linefrommultipoint: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_linefromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_linefromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_linelocatepoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_linemerge: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_linestringfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_linetocurve: {
        Args: {
          geometry: unknown
        }
        Returns: unknown
      }
      st_locatealong: {
        Args: {
          geometry: unknown
          measure: number
          leftrightoffset?: number
        }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          geometry: unknown
          frommeasure: number
          tomeasure: number
          leftrightoffset?: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: {
          geometry: unknown
          fromelevation: number
          toelevation: number
        }
        Returns: unknown
      }
      st_longestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_m: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_makebox2d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_makeline:
        | {
            Args: {
              "": unknown[]
            }
            Returns: unknown
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: unknown
          }
      st_makepolygon: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_makevalid:
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              params: string
            }
            Returns: unknown
          }
      st_maxdistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_maximuminscribedcircle: {
        Args: {
          "": unknown
        }
        Returns: Record<string, unknown>
      }
      st_memsize: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: {
          inputgeom: unknown
          segs_per_quarter?: number
        }
        Returns: unknown
      }
      st_minimumboundingradius: {
        Args: {
          "": unknown
        }
        Returns: Record<string, unknown>
      }
      st_minimumclearance: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_minimumclearanceline: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_mlinefromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mlinefromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mpointfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mpointfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mpolyfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mpolyfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multi: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_multilinefromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multilinestringfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multipointfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multipointfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multipolyfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multipolygonfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_ndims: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_node: {
        Args: {
          g: unknown
        }
        Returns: unknown
      }
      st_normalize: {
        Args: {
          geom: unknown
        }
        Returns: unknown
      }
      st_npoints: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_nrings: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numgeometries: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numinteriorring: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numinteriorrings: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numpatches: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numpoints: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_offsetcurve: {
        Args: {
          line: unknown
          distance: number
          params?: string
        }
        Returns: unknown
      }
      st_orderingequals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_orientedenvelope: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_overlaps: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_perimeter:
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
        | {
            Args: {
              geog: unknown
              use_spheroid?: boolean
            }
            Returns: number
          }
      st_perimeter2d: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_pointfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_pointfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_pointm: {
        Args: {
          xcoordinate: number
          ycoordinate: number
          mcoordinate: number
          srid?: number
        }
        Returns: unknown
      }
      st_pointonsurface: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_points: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
          srid?: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
          mcoordinate: number
          srid?: number
        }
        Returns: unknown
      }
      st_polyfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_polyfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_polygonfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_polygonfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_polygonize: {
        Args: {
          "": unknown[]
        }
        Returns: unknown
      }
      st_project: {
        Args: {
          geog: unknown
          distance: number
          azimuth: number
        }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_x: number
          prec_y?: number
          prec_z?: number
          prec_m?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: {
          geom: unknown
          gridsize: number
        }
        Returns: unknown
      }
      st_relate: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: string
      }
      st_removerepeatedpoints: {
        Args: {
          geom: unknown
          tolerance?: number
        }
        Returns: unknown
      }
      st_reverse: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_segmentize: {
        Args: {
          geog: unknown
          max_segment_length: number
        }
        Returns: unknown
      }
      st_setsrid:
        | {
            Args: {
              geog: unknown
              srid: number
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              srid: number
            }
            Returns: unknown
          }
      st_sharedpaths: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_shiftlongitude: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_shortestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: {
          geom: unknown
          vertex_fraction: number
          is_outer?: boolean
        }
        Returns: unknown
      }
      st_split: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_square: {
        Args: {
          size: number
          cell_i: number
          cell_j: number
          origin?: unknown
        }
        Returns: unknown
      }
      st_squaregrid: {
        Args: {
          size: number
          bounds: unknown
        }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | {
            Args: {
              geog: unknown
            }
            Returns: number
          }
        | {
            Args: {
              geom: unknown
            }
            Returns: number
          }
      st_startpoint: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_subdivide: {
        Args: {
          geom: unknown
          maxvertices?: number
          gridsize?: number
        }
        Returns: unknown[]
      }
      st_summary:
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      st_swapordinates: {
        Args: {
          geom: unknown
          ords: unknown
        }
        Returns: unknown
      }
      st_symdifference: {
        Args: {
          geom1: unknown
          geom2: unknown
          gridsize?: number
        }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          zoom: number
          x: number
          y: number
          bounds?: unknown
          margin?: number
        }
        Returns: unknown
      }
      st_touches: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_transform:
        | {
            Args: {
              geom: unknown
              from_proj: string
              to_proj: string
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              from_proj: string
              to_srid: number
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              to_proj: string
            }
            Returns: unknown
          }
      st_triangulatepolygon: {
        Args: {
          g1: unknown
        }
        Returns: unknown
      }
      st_union:
        | {
            Args: {
              "": unknown[]
            }
            Returns: unknown
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
              gridsize: number
            }
            Returns: unknown
          }
      st_voronoilines: {
        Args: {
          g1: unknown
          tolerance?: number
          extend_to?: unknown
        }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: {
          g1: unknown
          tolerance?: number
          extend_to?: unknown
        }
        Returns: unknown
      }
      st_within: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_wkbtosql: {
        Args: {
          wkb: string
        }
        Returns: unknown
      }
      st_wkttosql: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_wrapx: {
        Args: {
          geom: unknown
          wrap: number
          move: number
        }
        Returns: unknown
      }
      st_x: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_xmax: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_xmin: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_y: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_ymax: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_ymin: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_z: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_zmax: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_zmflag: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_zmin: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      text: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      unlockrows: {
        Args: {
          "": string
        }
        Returns: number
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          schema_name: string
          table_name: string
          column_name: string
          new_srid_in: number
        }
        Returns: string
      }
      uuid_generate_v4: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      vector_avg: {
        Args: {
          "": number[]
        }
        Returns: string
      }
      vector_dims:
        | {
            Args: {
              "": string
            }
            Returns: number
          }
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
      vector_norm: {
        Args: {
          "": string
        }
        Returns: number
      }
      vector_out: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      vector_send: {
        Args: {
          "": string
        }
        Returns: string
      }
      vector_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
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
        | "craigslist_dealer"
        | "carvana"
        | "truecar"
        | "vroom"
        | "offerup"
        | "acv"
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
        geom: unknown | null
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown | null
      }
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

