import { createClient } from "npm:@supabase/supabase-js@2.33.0";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
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
    if (req.method === "POST") {
      const { error: keyErr } = await supabase.from("cursor_api_keys").delete().eq("user_id", uid);
      if (keyErr) {
        console.error("key-delete DB error", keyErr.message);
        return json({ error: "Failed to delete key" }, 500);
      }
      const { error: agentErr } = await supabase.from("cursor_agents").delete().eq("user_id", uid);
      if (agentErr) console.error("Failed to clean up cursor_agents", agentErr);
      return json({
        ok: true
      });
    }
    return json({
      error: "Method not supported"
    }, 405);
  } catch (err) {
    console.error("key-delete error", err);
    return json({
      error: "Internal server error"
    }, 500);
  }
});
