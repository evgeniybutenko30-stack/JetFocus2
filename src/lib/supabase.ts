import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ziayzdsbyrxwkjggwjwd.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppYXl6ZHNieXJ4d2tqZ2d3andkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MDEzMTIsImV4cCI6MjA4Njk3NzMxMn0.uF3HoQocC8Ngudx2oiLqZ9lBesclPb_3Js1P744H8Xo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
        };
      };
      user_data_sanity: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          value: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          value: unknown;
          created_at?: string;
        };
        Update: {
          key?: string;
          value?: unknown;
        };
      };
    };
  };
};
