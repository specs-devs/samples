import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const UnpairBody = z.object({
  agent_id: z.string().uuid().optional(),
  device_email: z.string().email().optional(),
  device_password: z.string().optional(),
});

async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

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

  const rawBody = await req.json().catch(() => ({}));
  const parsed = UnpairBody.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const body = parsed.data;
  const targetAgentId = body.agent_id;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    const { device_email, device_password } = body;

    if (!targetAgentId || !device_email || !device_password) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { data: fallbackAgent, error: fallbackErr } = await supabaseAdmin
      .from("bridge_agents")
      .select("id, device_email, device_password_hash")
      .eq("id", targetAgentId)
      .eq("device_email", device_email)
      .single();

    if (fallbackErr || !fallbackAgent || !fallbackAgent.device_password_hash) {
      return new Response("Unauthorized", { status: 401 });
    }

    const providedHash = await hashPassword(device_password);
    if (!timingSafeEqual(providedHash, fallbackAgent.device_password_hash)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const deleteAll = user && !user.app_metadata?.is_device && !targetAgentId;

  if (deleteAll) {
    const { data: agents, error: agentsError } = await supabaseAdmin
      .from("bridge_agents")
      .select("id, device_user_id")
      .eq("owner_id", user.id);

    if (agentsError || !agents || agents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No paired agents found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const errors: string[] = [];
    for (const agent of agents) {
      if (agent.device_user_id) {
        await supabaseAdmin.auth.admin.deleteUser(agent.device_user_id);
      }
      const { error: delErr } = await supabaseAdmin
        .from("bridge_agents")
        .delete()
        .eq("id", agent.id);
      if (delErr) {
        console.error(`[unpair_bridge] delete failed for ${agent.id}:`, delErr.message);
        errors.push(agent.id);
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ error: "Failed to delete some agents", failed_ids: errors }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, deleted: agents.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  let query = supabaseAdmin.from("bridge_agents").select("id, device_user_id");

  if (!user || user.app_metadata?.is_device) {
    const email = user?.email ?? body.device_email;
    query = query.eq("device_email", email).single();
  } else {
    query = query.eq("owner_id", user.id).eq("id", targetAgentId).single();
  }

  const { data: agent, error: agentError } = await query;

  if (agentError || !agent) {
    return new Response(
      JSON.stringify({ error: "No paired agent found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  if (agent.device_user_id) {
    await supabaseAdmin.auth.admin.deleteUser(agent.device_user_id);
  }

  const { error: agentErr } = await supabaseAdmin
    .from("bridge_agents")
    .delete()
    .eq("id", agent.id);

  if (agentErr) {
    console.error("[unpair_bridge] delete failed:", agentErr.message);
    return new Response(
      JSON.stringify({ error: "Failed to delete agent" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { "Content-Type": "application/json" } }
  );
});
