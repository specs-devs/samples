import { execFile } from "child_process";
import { promisify } from "util";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { homedir, tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = resolve(__dirname, "..", "mcp-permission-server.js");
const ARTIFACTS_MCP_SERVER_PATH = resolve(__dirname, "..", "mcp-artifacts-server.js");

const SESSIONS_DIR = process.env.CODEX_SESSIONS_DIR || join(homedir(), ".bridge-codex-sessions");
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const SKIP_PERMISSIONS = process.env.CODEX_SKIP_PERMISSIONS === "true";
const TIMEOUT_MS = 300_000;

const PERMISSION_INSTRUCTION = [
  "IMPORTANT: Before performing ANY file write, file edit, file deletion,",
  "or shell command, you MUST first call the bridge_permission_tool MCP tool.",
  "Pass the tool name and a brief description. Parse the JSON response.",
  'Only proceed if "behavior" is "allow". If "deny", stop and inform the user.',
].join("\n");

// Codex sessions are most reliable when resumed by the explicit
// session id reported by the CLI. We persist that id per conversation
// so follow-ups survive bridge restarts and shared workspaces.
const activeProcesses = new Map();

let _supabaseUrl = "";
let _supabaseAnonKey = "";
let _getAccessToken = async () => "";
let _credentials = { email: "", password: "" };
let _artifactsEnabled = false;

const codexCliDriver = {
  name: "codex",

  configure({ supabaseUrl, supabaseAnonKey, credentials, getAccessToken, artifactsEnabled }) {
    _supabaseUrl = supabaseUrl;
    _supabaseAnonKey = supabaseAnonKey;
    _credentials = credentials ?? { email: "", password: "" };
    _getAccessToken = getAccessToken;
    _artifactsEnabled = artifactsEnabled ?? false;
  },

  async setup() {
    try {
      const { stdout } = await execFileAsync(CODEX_BIN, ["--version"]);
      console.log(`Codex CLI found: ${stdout.trim()}`);
    } catch (err) {
      console.error("Codex CLI not found or not executable. Install from: https://developers.openai.com/codex/cli/overview");
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }

    if (!existsSync(SESSIONS_DIR)) {
      mkdirSync(SESSIONS_DIR, { recursive: true });
      console.log(`Created Codex sessions directory: ${SESSIONS_DIR}`);
    }

    try {
      const pingPromise = execFileAsync(CODEX_BIN, ["login", "status"], {
        timeout: 10_000,
      });
      pingPromise.child.stdin.end();
      await pingPromise;
      console.log("Codex CLI auth check passed.");
    } catch (err) {
      console.error(`Codex CLI auth check failed: ${err.message}`);
      if (err.stdout) console.error(`[Codex CLI Health STDOUT] ${err.stdout}`);
      if (err.stderr) console.error(`[Codex CLI Health STDERR] ${err.stderr}`);
      console.error("Make sure you are logged in (run: codex login).");
      console.error("Starting anyway — messages will fail until auth is resolved.");
    }

    if (SKIP_PERMISSIONS) {
      console.log("[Codex CLI] CODEX_SKIP_PERMISSIONS=true — will use --dangerously-bypass-approvals-and-sandbox");
    } else {
      console.log("[Codex CLI] MCP permission routing enabled — permissions will be forwarded to Lens UI");
    }
  },

  /**
   * @param {string} conversationId
   * @param {string} message
   * @param {string|null} targetSession
   * @param {string|null} [workspace]
   * @param {Array<{data: string, dimension?: {width: number, height: number}}>|null} [images]
   * @param {string|null} [model]
   * @returns {Promise<string>}
   */
  async sendMessage(conversationId, message, targetSession, workspace = null, images = null, model = null) {
    const sessionId = getSessionId(conversationId, targetSession);

    if (SKIP_PERMISSIONS) {
      return runWithSkipPermissions(conversationId, message, sessionId, workspace, images, model);
    }

    return runWithMcpPermissions(conversationId, message, sessionId, workspace, images, model);
  },

  abort(conversationId) {
    const child = activeProcesses.get(conversationId);
    if (child) {
      child.kill("SIGINT");
      activeProcesses.delete(conversationId);
      cleanupPermissionRules(conversationId);
      return true;
    }
    return false;
  },
};

function getConversationDir(conversationId) {
  const dir = join(SESSIONS_DIR, conversationId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getSessionIdPath(conversationId) {
  return join(getConversationDir(conversationId), "codex-session-id.txt");
}

function readStoredSessionId(conversationId) {
  try {
    const sessionId = readFileSync(getSessionIdPath(conversationId), "utf8").trim();
    return sessionId || null;
  } catch (_) {
    return null;
  }
}

function writeStoredSessionId(conversationId, sessionId) {
  if (!sessionId) return;
  writeFileSync(getSessionIdPath(conversationId), `${sessionId}\n`, { mode: 0o600 });
}

function clearStoredSessionId(conversationId) {
  try {
    unlinkSync(getSessionIdPath(conversationId));
  } catch (_) {}
}

function getSessionId(conversationId, targetSession = null) {
  if (targetSession) {
    writeStoredSessionId(conversationId, targetSession);
    return targetSession;
  }
  return readStoredSessionId(conversationId);
}

function parseSessionId(stderr) {
  const match = stderr?.match(/^session id:\s*(\S+)\s*$/m);
  return match?.[1] ?? null;
}

function persistSessionId(conversationId, stderr, fallbackSessionId = null) {
  const sessionId = parseSessionId(stderr) ?? fallbackSessionId;
  if (sessionId) {
    writeStoredSessionId(conversationId, sessionId);
  }
}

function isMissingSessionError(err) {
  const combined = [err?.message, err?.stderr, err?.stdout].filter(Boolean).join("\n");
  return combined.includes("no rollout found for thread id");
}

function cleanupPermissionRules(conversationId) {
  try {
    const rulesPath = join(tmpdir(), `bridge-perms-${conversationId}.json`);
    unlinkSync(rulesPath);
  } catch (_) {}
}

function writeImageTempFiles(images, conversationId) {
  const paths = [];
  for (let i = 0; i < images.length; i++) {
    const imgPath = join(tmpdir(), `bridge-img-${conversationId}-${Date.now()}-${i}.png`);
    writeFileSync(imgPath, Buffer.from(images[i].data, "base64"));
    paths.push(imgPath);
  }
  return paths;
}

function cleanupImageFiles(paths) {
  for (const p of paths) {
    try { unlinkSync(p); } catch (_) {}
  }
}

async function runWithSkipPermissions(conversationId, message, sessionId, workspace, images = null, model = null) {
  const convDir = getConversationDir(conversationId);
  const outputPath = join(tmpdir(), `codex-output-${conversationId}-${Date.now()}.txt`);

  const imagePaths = images ? writeImageTempFiles(images, conversationId) : [];
  const imageArgs = imagePaths.flatMap((p) => ["--image", p]);
  const modelArgs = model ? ["--model", model] : [];
  const workDirArgs = workspace ? ["--cd", workspace] : [];

  const args = sessionId
    ? [
        "exec", "resume", sessionId,
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        ...modelArgs,
        ...imageArgs,
        "--output-last-message", outputPath,
        message,
      ]
    : [
        "exec",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        ...modelArgs,
        ...workDirArgs,
        ...imageArgs,
        "--output-last-message", outputPath,
        message,
      ];

  try {
    const execPromise = execFileAsync(CODEX_BIN, args, {
      cwd: convDir,
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    execPromise.child.stdin.end();
    activeProcesses.set(conversationId, execPromise.child);

    const { stdout, stderr } = await execPromise;

    persistSessionId(conversationId, stderr, sessionId);

    if (stderr) {
      console.error(`[Codex CLI stderr] ${stderr.substring(0, 500)}`);
    }

    if (existsSync(outputPath)) {
      return readFileSync(outputPath, "utf8").trim();
    }
    return stdout.trim();
  } catch (err) {
    console.error(`[Codex CLI ERROR] Command failed: ${err.message}`);
    if (err.stdout) console.error(`[Codex CLI STDOUT on Error] ${err.stdout}`);
    if (err.stderr) console.error(`[Codex CLI STDERR on Error] ${err.stderr}`);

    if (sessionId && isMissingSessionError(err)) {
      clearStoredSessionId(conversationId);
      return runWithSkipPermissions(conversationId, message, null, workspace, images, model);
    }

    if (err.killed) {
      throw new Error("Codex CLI timed out after 5 minutes");
    }
    throw new Error(`Codex CLI error: ${err.message}`);
  } finally {
    activeProcesses.delete(conversationId);
    cleanupImageFiles(imagePaths);
    try { unlinkSync(outputPath); } catch (_) {}
  }
}

function pushConfigOverride(args, key, value) {
  args.push("--config", `${key}=${value}`);
}

function buildMcpConfigArgs(conversationId, accessToken) {
  const args = [];

  pushConfigOverride(args, "mcp_servers.bridge-auth.command", JSON.stringify("node"));
  pushConfigOverride(args, "mcp_servers.bridge-auth.args", JSON.stringify([MCP_SERVER_PATH]));

  const authEnv = {
    BRIDGE_SUPABASE_URL: _supabaseUrl,
    BRIDGE_SUPABASE_ANON_KEY: _supabaseAnonKey,
    BRIDGE_ACCESS_TOKEN: accessToken,
    BRIDGE_CONVERSATION_ID: conversationId,
    BRIDGE_AUTH_EMAIL: _credentials.email,
    BRIDGE_AUTH_PASSWORD: _credentials.password,
  };

  for (const [key, value] of Object.entries(authEnv)) {
    if (value === undefined || value === null) continue;
    pushConfigOverride(args, `mcp_servers.bridge-auth.env.${key}`, JSON.stringify(value));
  }

  if (_artifactsEnabled) {
    pushConfigOverride(args, "mcp_servers.bridge-artifacts.command", JSON.stringify("node"));
    pushConfigOverride(args, "mcp_servers.bridge-artifacts.args", JSON.stringify([ARTIFACTS_MCP_SERVER_PATH]));
    pushConfigOverride(
      args,
      "mcp_servers.bridge-artifacts.env.BRIDGE_CONVERSATION_ID",
      JSON.stringify(conversationId),
    );
  }

  return args;
}

async function runWithMcpPermissions(conversationId, message, sessionId, workspace, images = null, model = null) {
  const accessToken = await _getAccessToken();
  const convDir = getConversationDir(conversationId);
  const outputPath = join(tmpdir(), `codex-output-${conversationId}-${Date.now()}.txt`);

  const prefixedMessage = `${PERMISSION_INSTRUCTION}\n\n${message}`;

  const imagePaths = images ? writeImageTempFiles(images, conversationId) : [];
  const imageArgs = imagePaths.flatMap((p) => ["--image", p]);
  const modelArgs = model ? ["--model", model] : [];
  const workDirArgs = workspace ? ["--cd", workspace] : [];
  const mcpConfigArgs = buildMcpConfigArgs(conversationId, accessToken);

  const args = sessionId
    ? [
        "exec", "resume", sessionId,
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        ...modelArgs,
        ...mcpConfigArgs,
        ...imageArgs,
        "--output-last-message", outputPath,
        prefixedMessage,
      ]
    : [
        "exec",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        ...modelArgs,
        ...workDirArgs,
        ...mcpConfigArgs,
        ...imageArgs,
        "--output-last-message", outputPath,
        prefixedMessage,
      ];

  try {
    const execPromise = execFileAsync(CODEX_BIN, args, {
      cwd: convDir,
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    execPromise.child.stdin.end();
    activeProcesses.set(conversationId, execPromise.child);

    const { stdout, stderr } = await execPromise;

    persistSessionId(conversationId, stderr, sessionId);

    if (stderr) {
      console.error(`[Codex CLI stderr] ${stderr.substring(0, 500)}`);
    }

    if (existsSync(outputPath)) {
      return readFileSync(outputPath, "utf8").trim();
    }
    return stdout.trim();
  } catch (err) {
    console.error(`[Codex CLI ERROR] Command failed: ${err.message}`);
    if (err.stdout) console.error(`[Codex CLI STDOUT on Error] ${err.stdout}`);
    if (err.stderr) console.error(`[Codex CLI STDERR on Error] ${err.stderr}`);

    if (sessionId && isMissingSessionError(err)) {
      clearStoredSessionId(conversationId);
      return runWithMcpPermissions(conversationId, message, null, workspace, images, model);
    }

    if (err.killed) {
      throw new Error("Codex CLI timed out after 5 minutes");
    }
    throw new Error(`Codex CLI error: ${err.message}`);
  } finally {
    activeProcesses.delete(conversationId);
    cleanupImageFiles(imagePaths);
    try { unlinkSync(outputPath); } catch (_) {}
  }
}

export default codexCliDriver;
