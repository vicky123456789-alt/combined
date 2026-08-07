// =============================================================
// daily-stats/index.ts  —  Supabase Edge Function (Cron)
// Calculates total users and active subscribers, then upserts
// into the admin_stats table for the current date.
// =============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

Deno.serve(async (req: Request) => {
  // Edge functions invoked by pg_cron or HTTP require validation
  // For a cron, we might just trust the invocation or check a secret.
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Missing environment variables" }), { status: 500 });
  }

  // Create a Supabase client with the service role key to bypass RLS
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Get total users
    const { count: totalUsers, error: usersError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (usersError) throw usersError;

    // 2. Get active subscribers
    const { count: activeSubscribers, error: subsError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active');

    if (subsError) throw subsError;

    // 3. Upsert today's stats
    const today = new Date().toISOString().split('T')[0];

    const { error: upsertError } = await supabase
      .from('admin_stats')
      .upsert({
        date: today,
        total_users: totalUsers || 0,
        active_subscribers: activeSubscribers || 0
      }, { onConflict: 'date' });

    if (upsertError) throw upsertError;

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        total_users: totalUsers,
        active_subscribers: activeSubscribers
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Failed to run daily stats:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
