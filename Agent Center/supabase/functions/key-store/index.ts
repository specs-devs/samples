import { createClient } from "npm:@supabase/supabase-js@2.33.0";
import { randomFillSync, createCipheriv } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "npm:zod@3.23.8";

const KeyStoreBody = z.object({
  name: z.string().max(100).optional(),
  api_key: z.string().min(1).max(500),
});
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const MASTER_KEY = Deno.env.get("KEY_ENC_KEY");
if (!MASTER_KEY) throw new Error("Missing KEY_ENC_KEY env var");
function encrypt(text) {
  const iv = randomFillSync(new Uint8Array(12));
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(MASTER_KEY, "base64"), iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    iv,
    tag,
    encrypted
  ]).toString("base64");
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
Deno.serve(async (req)=>{
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({
      error: "Missing authorization"
    }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: user, error } = await supabase.auth.getUser(token);
    if (error || !user.user) return json({
      error: "Unauthorized"
    }, 401);
    const uid = user.user.id;
    const rawBody = await req.json();
    if (req.method === "POST") {
      const parsed = KeyStoreBody.safeParse(rawBody);
      if (!parsed.success) {
        return json({ error: "Invalid request body" }, 400);
      }
      const { name, api_key } = parsed.data;
      const encrypted = encrypt(api_key);
      const { error: dbErr } = await supabase.from("cursor_api_keys").upsert({
        user_id: uid,
        name: name || "default",
        api_key_encrypted: encrypted,
        is_active: true
      }, {
        onConflict: "user_id"
      });
      if (dbErr) {
        console.error("key-store DB error", dbErr.message);
        return json({ error: "Failed to store key" }, 500);
      }
      return json({
        ok: true
      });
    }
    return json({
      error: "Method not supported"
    }, 405);
  } catch (err) {
    console.error("key-store error", err);
    return json({
      error: "Internal server error"
    }, 500);
  }
});
