#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir, homedir } from "os";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, "mcp-permission.log");

const CONVERSATION_ID = process.env.BRIDGE_CONVERSATION_ID;

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 300_000;

const PERM_DIR = join(homedir(), ".bridge-data", "permissions");
mkdirSync(PERM_DIR, { recursive: true });

const RULES_FILE = join(tmpdir(), `bridge-perms-${CONVERSATION_ID}.json`);

function loadRules() {
  try {
    if (existsSync(RULES_FILE)) {
      return JSON.parse(readFileSync(RULES_FILE, "utf8"));
    }
  } catch (_) {}
  return { allowed_tools: [] };
}

function saveRule(toolName) {
  if (!CONVERSATION_ID) return;
  const rules = loadRules();
  if (!rules.allowed_tools.includes(toolName)) {
    rules.allowed_tools.push(toolName);
  }
  writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

function saveAllowAll() {
  if (!CONVERSATION_ID) return;
  const rules = loadRules();
  rules.allow_all = true;
  writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

function isToolAllowed(toolName) {
  const rules = loadRules();
  return rules.allow_all === true || rules.allowed_tools.includes(toolName);
}

function log(msg) {
  const line = `[${new Date().toISOString()}] [MCP-Permission] ${msg}\n`;
  process.stderr.write(line);
  try { appendFileSync(LOG_FILE, line); } catch (_) {}
}

log(`Starting MCP permission server (conv=${CONVERSATION_ID ?? "MISSING"})`);
if (!CONVERSATION_ID) {
  log("WARNING: BRIDGE_CONVERSATION_ID not set — session permission rules disabled");
}

function requestPermissionViaFile(tool, description, requestId) {
  const reqPath = join(PERM_DIR, `req-${CONVERSATION_ID}-${requestId}.json`);
  writeFileSync(reqPath, JSON.stringify({ tool, description, timestamp: Date.now(), request_id: requestId }));
}

async function pollForPermissionResponse(requestId) {
  const start = Date.now();
  let pollCount = 0;
  const respPath = join(PERM_DIR, `resp-${CONVERSATION_ID}-${requestId}.json`);
  const reqPath = join(PERM_DIR, `req-${CONVERSATION_ID}-${requestId}.json`);

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    pollCount++;
    try {
      if (existsSync(respPath)) {
        const resp = JSON.parse(readFileSync(respPath, "utf8"));
        if (resp.permission_response) {
          log(`Poll #${pollCount}: got response=${resp.permission_response}`);
          try { unlinkSync(respPath); } catch (_) {}
          try { unlinkSync(reqPath); } catch (_) {}
          return resp.permission_response;
        }
      }
    } catch (err) {
      log(`Poll #${pollCount} error: ${err.message}`);
    }
    if (pollCount <= 3 || pollCount % 10 === 0) {
      log(`Poll #${pollCount}: waiting for response file`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  log("Permission poll timed out, defaulting to deny");
  try { unlinkSync(reqPath); } catch (_) {}
  return "deny";
}

const server = new Server(
  { name: "bridge-permission", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "bridge_permission_tool",
        description:
          "Request permission before performing any file write, file edit, file deletion, or shell command. " +
          "Call this tool BEFORE executing the action. If the response behavior is 'allow', proceed. " +
          "If 'deny', stop and inform the user.",
        inputSchema: {
          type: "object",
          properties: {
            tool_name: {
              type: "string",
              description: "The name of the tool or action requesting permission (e.g. 'write_file', 'shell', 'create_file', 'delete_file')",
            },
            description: {
              type: "string",
              description: "A brief human-readable description of what the action will do",
            },
          },
          required: ["tool_name", "description"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "bridge_permission_tool") {
    return {
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const args = request.params.arguments ?? {};

  log(`Raw args: ${JSON.stringify(args)}`);

  const toolName =
    args.tool_name ?? args.requested_tool ?? args.tool ?? args.name ?? "unknown";
  const toolInput =
    args.input ?? args.command_args ?? args.arguments ?? args.args ?? null;
  const rationale = args.description ?? args.rationale ?? args.reason ?? null;

  const description = rationale
    ?? (typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput))
    ?? `Permission requested for ${toolName}`;

  log(`Permission request: tool=${toolName}, description=${description}`);

  const toolUseId = args.tool_use_id ?? null;

  if (isToolAllowed(toolName)) {
    log(`Auto-approved by session rule (allow_all or tool=${toolName})`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ behavior: "allow", tool_use_id: toolUseId, updatedInput: toolInput }),
      }],
    };
  }

  const requestId = randomUUID();

  try {
    requestPermissionViaFile(toolName, description, requestId);
  } catch (err) {
    log(`Failed to write permission request file: ${err.message}`);
    return {
      content: [{ type: "text", text: `Denied. Reason: Failed to route permission request: ${err.message}` }],
    };
  }

  const decision = await pollForPermissionResponse(requestId);
  log(`Decision: ${decision}`);

  if (decision === "allow" || decision === "allow_session") {
    if (decision === "allow_session") {
      saveAllowAll();
      log(`Saved allow-all session rule (triggered by tool=${toolName})`);
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ behavior: "allow", tool_use_id: toolUseId, updatedInput: toolInput }),
      }],
    };
  }
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ behavior: "deny", tool_use_id: toolUseId, message: "User denied the action." }),
    }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
log("MCP server connected and ready");
