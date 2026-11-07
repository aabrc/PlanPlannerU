export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      user_planner_data: {
        Row: {
          device_id: string;
          revision: number;
          state: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          device_id: string;
          revision?: number;
          state: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          device_id?: string;
          revision?: number;
          state?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
