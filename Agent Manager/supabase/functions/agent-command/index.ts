import { createClient } from "npm:@supabase/supabase-js@2.33.0";
import { createDecipheriv, createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "npm:zod@3.23.8";

const VALID_ACTIONS = ["launch", "list", "status", "conversation", "followup", "stop", "delete", "models", "repositories"] as const;
const CommandBody = z.object({
  action: z.enum(VALID_ACTIONS),
  params: z.record(z.unknown()).default({}),
});
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const MASTER_KEY = Deno.env.get("KEY_ENC_KEY");
if (!MASTER_KEY) throw new Error("Missing KEY_ENC_KEY env var");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
if (!WEBHOOK_SECRET) throw new Error("Missing WEBHOOK_SECRET env var");
const CURSOR_API = "https://api.cursor.com/v0";
const WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cursor_webhook`;
// ── helpers ──────────────────────────────────────────────────────────
function decryptBuffer(buf) {
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const encrypted = buf.slice(28);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(MASTER_KEY, "base64"), Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted)),
    decipher.final()
  ]).toString("utf8");
}
async function resolveApiKey(uid) {
  const { data, error } = await supabase.from("cursor_api_keys").select("api_key_encrypted").eq("user_id", uid).eq("is_active", true).limit(1).maybeSingle();
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data) throw new Error("No active Cursor API key found");
  const val = data.api_key_encrypted;
  let raw;
  if (typeof val === "string") {
    if (val.startsWith("\\x")) {
      raw = Buffer.from(val.slice(2), "hex");
    } else {
      raw = Buffer.from(val, "base64");
    }
  } else if (val instanceof Uint8Array) {
    raw = val;
  } else {
    raw = Uint8Array.from(Buffer.from(val));
  }
  return decryptBuffer(raw);
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
// ── Cursor API fetch ─────────────────────────────────────────────────
function cursorFetch(apiKey, path, method, body) {
  const headers = {
    Authorization: "Basic " + Buffer.from(`${apiKey}:`).toString("base64"),
    Accept: "application/json"
  };
  const init = {
    method,
    headers
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return fetch(`${CURSOR_API}${path}`, init);
}
function normalize(raw) {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    summary: raw.summary,
    prUrl: raw.target?.prUrl,
    branchName: raw.target?.branchName,
    url: raw.target?.url,
    createdAt: raw.createdAt
  };
}
function buildPrompt(params) {
  const prompt = {
    text: params.prompt
  };
  if (Array.isArray(params.images) && params.images.length > 0) {
    prompt.images = params.images;
  }
  return prompt;
}
// ── action dispatcher ────────────────────────────────────────────────
async function dispatch(apiKey, uid, action, params) {
  switch(action){
    case "launch":
      {
        const source = {};
        if (params.repository) source.repository = params.repository;
        if (params.ref) source.ref = params.ref;
        if (params.prUrl) source.prUrl = params.prUrl;
        const target = {};
        if (params.autoCreatePr !== undefined) target.autoCreatePr = params.autoCreatePr;
        if (params.branchName) target.branchName = params.branchName;
        const webhookToken = createHmac("sha256", WEBHOOK_SECRET)
          .update(uid)
          .digest("hex");
        const launchBody = {
          prompt: buildPrompt(params),
          source,
          webhook: {
            url: `${WEBHOOK_URL}?token=${webhookToken}`
          }
        };
        if (Object.keys(target).length > 0) launchBody.target = target;
        if (params.model) launchBody.model = params.model;
        const resp = await cursorFetch(apiKey, "/agents", "POST", launchBody);
        const raw = await resp.json();
        if (!resp.ok) return json(raw, resp.status);
        const agent = normalize(raw);
        await supabase.from("cursor_agents").upsert({
          id: agent.id,
          user_id: uid,
          name: agent.name,
          status: agent.status,
          repository: raw.source?.repository ?? null,
          pr_url: agent.prUrl ?? null,
          branch_name: agent.branchName ?? null,
          summary: agent.summary ?? null,
          created_at: agent.createdAt
        });
        return json(agent);
      }
    case "list":
      {
        const qs = new URLSearchParams();
        qs.set("limit", String(params.limit || 20));
        if (params.cursor) qs.set("cursor", params.cursor);
        if (params.prUrl) qs.set("prUrl", params.prUrl);
        const resp = await cursorFetch(apiKey, `/agents?${qs}`, "GET");
        const raw = await resp.json();
        if (!resp.ok) return json(raw, resp.status);
        const list = raw.agents;
        return json(list.map(normalize));
      }
    case "status":
      {
        const id = params.instanceId;
        if (!id) return json({
          error: "instanceId required"
        }, 400);
        const resp = await cursorFetch(apiKey, `/agents/${id}`, "GET");
        const raw = await resp.json();
        if (!resp.ok) return json(raw, resp.status);
        return json(normalize(raw));
      }
    case "conversation":
      {
        const id = params.instanceId;
        if (!id) return json({
          error: "instanceId required"
        }, 400);
        const resp = await cursorFetch(apiKey, `/agents/${id}/conversation`, "GET");
        const raw = await resp.json();
        if (!resp.ok) return json(raw, resp.status);
        return json(raw.messages);
      }
    case "followup":
      {
        const id = params.instanceId;
        if (!id) return json({
          error: "instanceId required"
        }, 400);
        if (!params.prompt) return json({
          error: "prompt required"
        }, 400);
        const resp = await cursorFetch(apiKey, `/agents/${id}/followup`, "POST", {
          prompt: buildPrompt(params)
        });
        return json(await resp.json(), resp.status);
      }
    case "stop":
      {
        const id = params.instanceId;
        if (!id) return json({
          error: "instanceId required"
        }, 400);
        const resp = await cursorFetch(apiKey, `/agents/${id}/stop`, "POST");
        return json(await resp.json(), resp.status);
      }
    case "delete":
      {
        const id = params.instanceId;
        if (!id) return json({
          error: "instanceId required"
        }, 400);
        const resp = await cursorFetch(apiKey, `/agents/${id}`, "DELETE");
        return json(await resp.json(), resp.status);
      }
    case "models":
      {
        const resp = await cursorFetch(apiKey, "/models", "GET");
        const raw = await resp.json();
        if (!resp.ok) return json(raw, resp.status);
        return json(raw.models);
      }
    case "repositories":
      {
        const resp = await cursorFetch(apiKey, "/repositories", "GET");
        const raw = await resp.json();
        if (!resp.ok) return json(raw, resp.status);
        return json(raw.repositories);
      }
    default:
      return json({
        error: `Unknown action: ${action}`
      }, 400);
  }
}
// ── entrypoint ───────────────────────────────────────────────────────
Deno.serve(async (req)=>{
  try {
    const authHeader = req.headers.get("authorization");
    const token = (authHeader || "").replace("Bearer ", "");
    if (!token) {
      return json({
        error: "Unauthorized"
      }, 401);
    }
    const { data: user, error } = await supabase.auth.getUser(token);
    if (error || !user.user) {
      return json({
        error: "Unauthorized"
      }, 401);
    }
    const uid = user.user.id;
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `agent-cmd:${uid}`,
      p_window_seconds: 60,
      p_max_requests: 30,
    });
    if (allowed === false) {
      return json({ error: "Too many requests" }, 429);
    }
    const apiKey = await resolveApiKey(uid);
    const rawBody = await req.json();
    const parsed = CommandBody.safeParse(rawBody);
    if (!parsed.success) {
      return json({ error: "Invalid request body" }, 400);
    }
    return dispatch(apiKey, uid, parsed.data.action, parsed.data.params);
  } catch (err) {
    console.error("agent-command error", err);
    return json({
      error: "Internal server error"
    }, 500);
  }
});
