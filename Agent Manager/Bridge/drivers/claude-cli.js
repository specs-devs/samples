import { execFile } from "child_process";
import { promisify } from "util";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { homedir, tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

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

function appendImageReferences(message, imagePaths) {
  if (imagePaths.length === 0) return message;
  const refs = imagePaths.map((p) => `[User uploaded image at ${p}]`).join("\n");
  return `${message}\n\n${refs}`;
}

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_PATH = resolve(__dirname, "..", "mcp-permission-server.js");
const ARTIFACTS_MCP_SERVER_PATH = resolve(__dirname, "..", "mcp-artifacts-server.js");

const SESSIONS_DIR = process.env.CLAUDE_SESSIONS_DIR || join(homedir(), ".bridge-claude-sessions");
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const SKIP_PERMISSIONS = process.env.CLAUDE_SKIP_PERMISSIONS === "true";
const TIMEOUT_MS = 0;

const startedConversations = new Map();
const activeProcesses = new Map();

let _supabaseUrl = "";
let _supabaseAnonKey = "";
let _getAccessToken = async () => "";
let _artifactsEnabled = false;

const claudeCliDriver = {
  name: "claude",

  configure({ supabaseUrl, supabaseAnonKey, getAccessToken, artifactsEnabled }) {
    _supabaseUrl = supabaseUrl;
    _supabaseAnonKey = supabaseAnonKey;
    _getAccessToken = getAccessToken;
    _artifactsEnabled = artifactsEnabled ?? false;
  },

  async setup() {
    try {
      const { stdout } = await execFileAsync(CLAUDE_BIN, ["--version"]);
      console.log(`Claude CLI found: ${stdout.trim()}`);
    } catch (err) {
      console.error(`Claude CLI not found or not executable. Install it with: curl -fsSL https://claude.ai/install.sh | bash`);
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }

    if (!existsSync(SESSIONS_DIR)) {
      mkdirSync(SESSIONS_DIR, { recursive: true });
      console.log(`Created Claude sessions directory: ${SESSIONS_DIR}`);
    }

    try {
      const pingPromise = execFileAsync(CLAUDE_BIN, ["auth", "status"], {
        cwd: SESSIONS_DIR,
        timeout: 10_000,
      });
      pingPromise.child.stdin.end();
      await pingPromise;
      console.log("Claude CLI health check passed.");
    } catch (err) {
      console.error(`Claude CLI health check failed: ${err.message}`);
      if (err.stdout) console.error(`[Claude CLI Health STDOUT] ${err.stdout}`);
      if (err.stderr) console.error(`[Claude CLI Health STDERR] ${err.stderr}`);
      console.error("Make sure you are logged in (run: claude and follow login prompts).");
      console.error("Starting anyway — messages will fail until auth is resolved.");
    }

    if (SKIP_PERMISSIONS) {
      console.log("[Claude CLI] CLAUDE_SKIP_PERMISSIONS=true — will use --dangerously-skip-permissions");
    } else {
      console.log("[Claude CLI] MCP permission routing enabled — permissions will be forwarded to Lens UI");
    }
  },

  /**
   * @param {string} conversationId
   * @param {string} message
   * @param {string|null} _targetSession
   * @param {string|null} [workspace]
   * @param {Array<{data: string, dimension?: {width: number, height: number}}>|null} [images]
   * @param {string|null} [model]
   * @returns {Promise<string>}
   */
  async sendMessage(conversationId, message, _targetSession, workspace = null, images = null, model = null) {
    const isFollowUp = startedConversations.has(conversationId);

    if (SKIP_PERMISSIONS) {
      return runWithSkipPermissions(conversationId, message, isFollowUp, workspace, images, model);
    }

    return runWithMcpPermissions(conversationId, message, isFollowUp, workspace, images, model);
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

async function runWithSkipPermissions(conversationId, message, isFollowUp, workspace, images = null, model = null) {
  const imagePaths = images ? writeImageTempFiles(images, conversationId) : [];
  const prompt = appendImageReferences(message, imagePaths);

  const args = [
    "-p",
    prompt,
    "--output-format",
    "text",
    "--dangerously-skip-permissions",
  ];

  if (model) {
    args.push("--model", model);
  }

  if (isFollowUp) {
    args.push("--resume", conversationId);
  } else {
    args.push("--session-id", conversationId);
  }

  try {
    const execPromise = execFileAsync(CLAUDE_BIN, args, {
      cwd: workspace || SESSIONS_DIR,
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    execPromise.child.stdin.end();
    activeProcesses.set(conversationId, execPromise.child);

    const { stdout, stderr } = await execPromise;

    if (!startedConversations.has(conversationId)) {
      startedConversations.set(conversationId, true);
    }

    if (stderr) {
      console.error(`[Claude CLI stderr] ${stderr.substring(0, 500)}`);
    }

    return stdout.trim();
  } catch (err) {
    const stderrStr = err.stderr ?? "";
    if (!isFollowUp && stderrStr.includes("already in use")) {
      console.log(`[Claude CLI] Session already exists, retrying with --resume`);
      startedConversations.set(conversationId, true);
      return runWithSkipPermissions(conversationId, message, true, workspace, images, model);
    }

    console.error(`[Claude CLI ERROR] Command failed: ${err.message}`);
    if (err.stdout) console.error(`[Claude CLI STDOUT on Error] ${err.stdout}`);
    if (err.stderr) console.error(`[Claude CLI STDERR on Error] ${err.stderr}`);

    if (err.killed) {
      throw new Error("Claude CLI timed out after 5 minutes");
    }
    throw new Error(`Claude CLI error: ${err.message}`);
  } finally {
    activeProcesses.delete(conversationId);
    cleanupImageFiles(imagePaths);
  }
}

function writeMcpConfig(conversationId, accessToken) {
  const config = {
    mcpServers: {
      "bridge-auth": {
        command: "node",
        args: [MCP_SERVER_PATH],
        env: {
          BRIDGE_SUPABASE_URL: _supabaseUrl,
          BRIDGE_SUPABASE_ANON_KEY: _supabaseAnonKey,
          BRIDGE_ACCESS_TOKEN: accessToken,
          BRIDGE_CONVERSATION_ID: conversationId,
        },
      },
    },
  };

  if (_artifactsEnabled) {
    config.mcpServers["bridge-artifacts"] = {
      command: "node",
      args: [ARTIFACTS_MCP_SERVER_PATH],
      env: {
        BRIDGE_CONVERSATION_ID: conversationId,
      },
    };
  }

  const tempPath = join(tmpdir(), `mcp-config-${conversationId}.json`);
  writeFileSync(tempPath, JSON.stringify(config), { mode: 0o600 });
  return tempPath;
}

function cleanupMcpConfig(tempPath) {
  try {
    unlinkSync(tempPath);
  } catch (_) {}
}

function cleanupPermissionRules(conversationId) {
  try {
    const rulesPath = join(tmpdir(), `bridge-perms-${conversationId}.json`);
    unlinkSync(rulesPath);
  } catch (_) {}
}

async function runWithMcpPermissions(conversationId, message, isFollowUp, workspace, images = null, model = null) {
  const accessToken = await _getAccessToken();
  const mcpConfigPath = writeMcpConfig(conversationId, accessToken);

  const imagePaths = images ? writeImageTempFiles(images, conversationId) : [];
  const prompt = appendImageReferences(message, imagePaths);

  const args = [
    "-p",
    prompt,
    "--output-format",
    "text",
    "--mcp-config",
    mcpConfigPath,
    "--permission-prompt-tool",
    "mcp__bridge-auth__bridge_permission_tool",
  ];

  if (model) {
    args.push("--model", model);
  }

  if (isFollowUp) {
    args.push("--resume", conversationId);
  } else {
    args.push("--session-id", conversationId);
  }

  try {
    const execPromise = execFileAsync(CLAUDE_BIN, args, {
      cwd: workspace || SESSIONS_DIR,
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    execPromise.child.stdin.end();
    activeProcesses.set(conversationId, execPromise.child);

    const { stdout, stderr } = await execPromise;

    if (!startedConversations.has(conversationId)) {
      startedConversations.set(conversationId, true);
    }

    if (stderr) {
      console.error(`[Claude CLI stderr] ${stderr.substring(0, 500)}`);
    }

    return stdout.trim();
  } catch (err) {
    const stderrStr = err.stderr ?? "";
    if (!isFollowUp && stderrStr.includes("already in use")) {
      console.log(`[Claude CLI] Session already exists, retrying with --resume`);
      startedConversations.set(conversationId, true);
      return runWithMcpPermissions(conversationId, message, true, workspace, images, model);
    }

    console.error(`[Claude CLI ERROR] Command failed: ${err.message}`);
    if (err.stdout) console.error(`[Claude CLI STDOUT on Error] ${err.stdout}`);
    if (err.stderr) console.error(`[Claude CLI STDERR on Error] ${err.stderr}`);

    if (err.killed) {
      throw new Error("Claude CLI timed out after 5 minutes");
    }
    throw new Error(`Claude CLI error: ${err.message}`);
  } finally {
    activeProcesses.delete(conversationId);
    cleanupImageFiles(imagePaths);
    cleanupMcpConfig(mcpConfigPath);
  }
}

export default claudeCliDriver;
