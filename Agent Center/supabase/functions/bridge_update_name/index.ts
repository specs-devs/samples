import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const UpdateNameBody = z.object({
  agent_id: z.string().uuid(),
  name: z.string().min(1).max(200),
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
  const parsed = UpdateNameBody.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { agent_id, name } = parsed.data;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("bridge_agents")
    .select("owner_id")
    .eq("id", agent_id)
    .single();

  if (agentError || !agent) {
    return new Response(
      JSON.stringify({ error: "Agent not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const ownerIdFromMeta = user.app_metadata?.owner_id;
  if (agent.owner_id !== user.id && agent.owner_id !== ownerIdFromMeta) {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("bridge_agents")
    .update({ name: name.trim() })
    .eq("id", agent_id);

  if (updateError) {
    console.error("[bridge_update_name] update failed:", updateError.message);
    return new Response(
      JSON.stringify({ error: "Failed to update name" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { "Content-Type": "application/json" } }
  );
});
