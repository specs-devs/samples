import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const RegisterBody = z.object({
  agent_type: z.string().max(50).default("openclaw"),
  name: z.string().max(200).nullable().default(null),
  metadata: z.record(z.unknown()).nullable().default(null),
});

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { data: allowed } = await supabaseAdmin.rpc("check_rate_limit", {
    p_key: `register:${clientIp}`,
    p_window_seconds: 60,
    p_max_requests: 5,
  });
  if (allowed === false) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = RegisterBody.safeParse(raw);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { agent_type: agentType, name: agentName, metadata: pairingMetadata } = parsed.data;

  const PAIRING_TTL_MINUTES = 5;
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MINUTES * 60_000).toISOString();
  const pollToken = crypto.randomUUID();

  let data: Record<string, unknown> | null = null;
  let pairingCode = "";
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    pairingCode = (100000 + (buf[0] % 900000)).toString();

    const result = await supabaseAdmin
      .from("bridge_agents")
      .insert([
        {
          pairing_code: pairingCode,
          pairing_expires_at: expiresAt,
          poll_token: pollToken,
          status: "offline",
          agent_type: agentType,
          name: agentName,
          pairing_metadata: pairingMetadata,
        },
      ])
      .select()
      .single();

    if (!result.error) {
      data = result.data;
      break;
    }

    if (attempt === MAX_RETRIES - 1) {
      console.error("register_bridge insert failed:", result.error.message);
      return new Response(JSON.stringify({ error: "Failed to register agent" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({
      agent_id: data!.id,
      pairing_code: pairingCode,
      poll_token: pollToken,
      expires_at: expiresAt,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
