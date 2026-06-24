import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const PairBody = z.object({
  pairing_code: z.string().regex(/^\d{6}$/),
});

serve(async (req) => {
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization") },
      },
    }
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rawBody = await req.json();
  const parsed = PairBody.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid pairing code format" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { pairing_code } = parsed.data;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: allowed } = await supabaseAdmin.rpc("check_rate_limit", {
    p_key: `pair:${user.id}`,
    p_window_seconds: 60,
    p_max_requests: 10,
  });
  if (allowed === false) {
    return new Response(
      JSON.stringify({ error: "Too many pairing attempts" }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("bridge_agents")
    .update({ owner_id: user.id })
    .eq("pairing_code", pairing_code)
    .is("owner_id", null)
    .gt("pairing_expires_at", new Date().toISOString())
    .select()
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ error: "Invalid, expired, or already claimed code." }),
      { status: 400 }
    );
  }

  const pairingMetadata = data.pairing_metadata ?? null;

  await supabaseAdmin
    .from("bridge_agents")
    .update({
      pairing_code: null,
      pairing_expires_at: null,
      pairing_metadata: null,
    })
    .eq("id", data.id);

  const responseBody: Record<string, unknown> = {
    success: true,
    agent_id: data.id,
    message: "Successfully paired! Your device is now locked to your account.",
  };

  if (pairingMetadata) {
    responseBody.pairing_metadata = pairingMetadata;
  }

  return new Response(
    JSON.stringify(responseBody),
    { headers: { "Content-Type": "application/json" } }
  );
});
