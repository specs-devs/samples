import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const PollBody = z.object({
  agent_id: z.string().uuid(),
  poll_token: z.string().uuid(),
  cancel: z.boolean().optional(),
});

async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  const rawBody = await req.json();
  const parsed = PollBody.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { agent_id, poll_token, cancel } = parsed.data;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: allowed } = await supabaseAdmin.rpc("check_rate_limit", {
    p_key: `poll:${agent_id}`,
    p_window_seconds: 60,
    p_max_requests: 30,
  });
  if (allowed === false) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data: agent } = await supabaseAdmin
    .from("bridge_agents")
    .select("owner_id, device_email, device_password_hash, device_user_id, poll_token")
    .eq("id", agent_id)
    .single();

  if (!agent || agent.poll_token !== poll_token) {
    return new Response(
      JSON.stringify({ error: "Invalid agent_id or poll_token" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (cancel) {
    await supabaseAdmin
      .from("bridge_agents")
      .delete()
      .eq("id", agent_id);

    return new Response(
      JSON.stringify({ status: "cancelled" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (!agent.owner_id) {
    return new Response(JSON.stringify({ status: "waiting" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (agent.device_email && agent.device_password_hash) {
    await supabaseAdmin
      .from("bridge_agents")
      .update({ poll_token: null, pairing_code: null, pairing_expires_at: null })
      .eq("id", agent_id);

    return new Response(
      JSON.stringify({ status: "already_provisioned" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const deviceEmail = `bridge-${agent_id}@device.local`;
  const devicePassword = crypto.randomUUID();
  const passwordHash = await hashPassword(devicePassword);

  const { data: createdUser } = await supabaseAdmin.auth.admin.createUser({
    email: deviceEmail,
    password: devicePassword,
    email_confirm: true,
    app_metadata: {
      is_device: true,
      owner_id: agent.owner_id,
    },
  });

  await supabaseAdmin
    .from("bridge_agents")
    .update({
      device_email: deviceEmail,
      device_password_hash: passwordHash,
      device_user_id: createdUser?.user?.id ?? null,
      poll_token: null,
      pairing_code: null,
      pairing_expires_at: null,
    })
    .eq("id", agent_id);

  return new Response(
    JSON.stringify({
      status: "approved",
      credentials: {
        email: deviceEmail,
        password: devicePassword,
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
