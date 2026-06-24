import { createClient } from "npm:@supabase/supabase-js@2.35.0";
import { createHmac } from "node:crypto";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
if (!WEBHOOK_SECRET) throw new Error("Missing WEBHOOK_SECRET env var");
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
async function broadcastToUser(userId, event, payload) {
  return new Promise((resolve)=>{
    const channel = supabase.channel(`user:${userId}`, {
      config: {
        broadcast: {
          self: false
        }
      }
    });
    const timeout = setTimeout(()=>{
      console.warn("broadcast timed out for user:", userId);
      supabase.removeChannel(channel);
      resolve();
    }, 5000);
    channel.subscribe(async (status)=>{
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event,
          payload
        });
        console.log("broadcast sent:", event, "to user:", userId);
        clearTimeout(timeout);
        supabase.removeChannel(channel);
        resolve();
      }
    });
  });
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

Deno.serve(async (req)=>{
  try {
    if (req.method !== "POST") return json({
      error: "Method not allowed"
    }, 405);
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return json({ error: "Forbidden" }, 403);

    const raw = await req.text();
    const payload = JSON.parse(raw);
    const agentId = payload.id;
    if (!agentId) {
      return json({
        error: "Missing agent id"
      }, 400);
    }
    const { data: agents, error: agentsErr } = await supabase.from("cursor_agents").select("id, user_id").eq("id", agentId).limit(1);
    if (agentsErr) {
      console.error("DB lookup error:", agentsErr.message);
      return json({ error: "Internal server error" }, 500);
    }
    if (!agents || agents.length === 0) {
      console.error("agent not found in cursor_agents:", agentId);
      return json({
        error: "Unknown agent"
      }, 404);
    }
    const userId = agents[0].user_id;
    const expectedToken = createHmac("sha256", WEBHOOK_SECRET)
      .update(userId)
      .digest("hex");
    if (!timingSafeEqual(token, expectedToken)) {
      return json({ error: "Forbidden" }, 403);
    }
    const update = {
      last_synced_at: new Date().toISOString()
    };
    if (payload.status) update.status = payload.status;
    if (payload.summary) update.summary = payload.summary;
    const { error: updErr } = await supabase.from("cursor_agents").update(update).eq("id", agentId);
    if (updErr) {
      console.error("DB update error:", updErr.message);
      return json({ error: "Failed to update agent" }, 500);
    }
    await broadcastToUser(userId, "agent_status", {
      agentId: "cursor_cloud-agent",
      externalId: agentId,
      provider: "cursor_cloud",
      status: payload.status ?? "UNKNOWN",
      summary: payload.summary,
      timestamp: Date.now()
    });
    return json({ ok: true });
  } catch (err) {
    console.error("webhook error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
