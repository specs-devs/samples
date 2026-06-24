import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const OPENCLAW_URL = process.env.OPENCLAW_URL || "http://localhost:18789";
const HEALTH_CHECK_RETRY_DELAY_MS = 5_000;
const HEALTH_CHECK_MAX_RETRIES = 5;

function getOpenClawToken() {
  if (process.env.OPENCLAW_TOKEN) return process.env.OPENCLAW_TOKEN;
  try {
    const config = JSON.parse(
      readFileSync(join(homedir(), ".openclaw", "openclaw.json"), "utf8")
    );
    return config?.gateway?.auth?.token ?? null;
  } catch {
    return null;
  }
}

let token = null;
const activeControllers = new Map();

async function ensureChatCompletionsEnabled() {
  try {
    const config = JSON.parse(
      readFileSync(join(homedir(), ".openclaw", "openclaw.json"), "utf8")
    );
    const enabled = config?.gateway?.http?.endpoints?.chatCompletions?.enabled;
    if (enabled) return;
  } catch {
    // config unreadable — try anyway
  }

  console.log("Enabling OpenClaw chat completions endpoint...");
  await execFileAsync("openclaw", [
    "config", "set",
    "gateway.http.endpoints.chatCompletions.enabled", "true",
  ]);
  console.log("Restarting gateway...");
  await execFileAsync("openclaw", ["gateway", "restart"]);
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log("Gateway ready.");
}

async function healthCheck() {
  for (let attempt = 1; attempt <= HEALTH_CHECK_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openclaw:main",
          messages: [{ role: "user", content: "ping" }],
          user: "health-check",
        }),
      });
      if (res.ok) {
        console.log("OpenClaw health check passed.");
        return;
      }
      console.error(`OpenClaw health check attempt ${attempt}/${HEALTH_CHECK_MAX_RETRIES} failed: ${res.status}`);
    } catch (err) {
      console.error(`OpenClaw health check attempt ${attempt}/${HEALTH_CHECK_MAX_RETRIES} failed: ${err.message}`);
    }

    if (attempt < HEALTH_CHECK_MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_RETRY_DELAY_MS));
    }
  }
  console.error("OpenClaw unreachable after retries. Starting anyway — messages will fail until it recovers.");
}

const openclawDriver = {
  name: "openclaw",

  async setup() {
    token = getOpenClawToken();
    if (!token) {
      console.error("Could not find OpenClaw gateway token. Set OPENCLAW_TOKEN in .env or ensure ~/.openclaw/openclaw.json exists.");
      process.exit(1);
    }
    await ensureChatCompletionsEnabled();
    await healthCheck();
  },

  async sendMessage(conversationId, message, targetSession, _workspace = null, _images = null, _model = null) {
    const sessionKey = targetSession ?? `spectacles:${conversationId}`;
    const controller = new AbortController();
    activeControllers.set(conversationId, controller);

    try {
      const res = await fetch(`${OPENCLAW_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openclaw:main",
          messages: [{ role: "user", content: message }],
          user: sessionKey,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`OpenClaw ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    } finally {
      activeControllers.delete(conversationId);
    }
  },

  abort(conversationId) {
    const controller = activeControllers.get(conversationId);
    if (controller) {
      controller.abort();
      activeControllers.delete(conversationId);
      return true;
    }
    return false;
  },
};

export default openclawDriver;
