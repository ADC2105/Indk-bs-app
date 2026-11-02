import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role klient. Omgår RLS. Må kun bruges server-side (Server Actions,
 * Route Handlers, scripts) – aldrig eksponeres til browseren.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
