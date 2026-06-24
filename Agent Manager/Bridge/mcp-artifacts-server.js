#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, rmSync } from "fs";
import { join, dirname, extname, basename } from "path";
import { fileURLToPath } from "url";
import { homedir, platform } from "os";
import { execFileSync } from "child_process";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, "mcp-artifacts.log");

const CONVERSATION_ID = process.env.BRIDGE_CONVERSATION_ID;

const ARTIFACTS_DIR = join(homedir(), ".bridge-data", "artifacts");
mkdirSync(ARTIFACTS_DIR, { recursive: true });

const MAX_PAYLOAD_BYTES = 200_000;
const MAX_SCREENSHOT_WIDTH = 1280;
const MAX_CODE_IMAGE_WIDTH = 960;
const JPEG_QUALITY = 60;

function log(msg) {
  const line = `[${new Date().toISOString()}] [MCP-Artifacts] ${msg}\n`;
  process.stderr.write(line);
  try { appendFileSync(LOG_FILE, line); } catch (_) {}
}

log(`Starting MCP artifacts server (conv=${CONVERSATION_ID ?? "MISSING"})`);

function writeArtifact(type, label, base64Data) {
  const filename = `artifact-${CONVERSATION_ID}-${Date.now()}.json`;
  const artifactPath = join(ARTIFACTS_DIR, filename);
  const payload = {
    conversation_id: CONVERSATION_ID,
    type,
    label: label || null,
    data: base64Data,
    timestamp: Date.now(),
  };
  writeFileSync(artifactPath, JSON.stringify(payload));
  log(`Wrote artifact: ${filename} (${type}, ${base64Data.length} chars base64)`);

  if (base64Data.length > MAX_PAYLOAD_BYTES) {
    log(`WARNING: artifact payload exceeds ${MAX_PAYLOAD_BYTES} bytes — may fail Supabase broadcast limit`);
  }

  return filename;
}

function compressAndEncode(imagePath, maxWidth = MAX_SCREENSHOT_WIDTH) {
  const jpgPath = imagePath.replace(/\.\w+$/, ".jpg");
  try {
    execFileSync("sips", [
      "--resampleWidth", String(maxWidth),
      "--setProperty", "format", "jpeg",
      "--setProperty", "formatOptions", String(JPEG_QUALITY),
      imagePath,
      "--out", jpgPath,
    ], { timeout: 10_000 });
  } catch (err) {
    log(`sips compress failed, using original: ${err.message}`);
    const data = readFileSync(imagePath);
    try { unlinkSync(imagePath); } catch (_) {}
    return data.toString("base64");
  }

  if (existsSync(jpgPath)) {
    const data = readFileSync(jpgPath);
    try { unlinkSync(imagePath); } catch (_) {}
    try { unlinkSync(jpgPath); } catch (_) {}
    const b64 = data.toString("base64");
    if (b64.length > MAX_PAYLOAD_BYTES) {
      log(`WARNING: compressed image is ${b64.length} chars base64 — may exceed broadcast limit`);
    }
    log(`Compressed: ${data.length} bytes binary, ${b64.length} chars base64`);
    return b64;
  }

  const data = readFileSync(imagePath);
  try { unlinkSync(imagePath); } catch (_) {}
  return data.toString("base64");
}

function throwScreenRecordingError() {
  throw new Error(
    "Screen Recording permission is not granted. " +
    "Go to System Settings → Privacy & Security → Screen Recording " +
    "and enable the terminal app (Terminal, iTerm2, etc.) that is running the bridge. " +
    "You may need to restart the bridge after granting permission."
  );
}

function captureScreenshot() {
  const os = platform();
  const tmpPath = join(tmpdir(), `bridge-screenshot-${Date.now()}.png`);

  if (os === "darwin") {
    try {
      execFileSync("screencapture", ["-x", tmpPath], {
        timeout: 10_000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : "";
      if (stderr.includes("could not create image") || err.message.includes("could not create image")) {
        throwScreenRecordingError();
      }
      throw new Error(`screencapture failed: ${err.message}`);
    }

    if (!existsSync(tmpPath)) {
      throwScreenRecordingError();
    }

    return compressAndEncode(tmpPath);
  }

  if (os === "linux") {
    try {
      execFileSync("import", ["-window", "root", tmpPath], { timeout: 10_000 });
      return compressAndEncode(tmpPath);
    } catch (err) {
      throw new Error(`Screenshot on Linux failed (requires ImageMagick 'import'): ${err.message}`);
    }
  }

  throw new Error(`Screenshot not supported on platform: ${os}`);
}

// ── Window capture ──────────────────────────────────────────────────────────

function getWindowId(appName) {
  // Use CGWindowListCopyWindowInfo via Swift to get the real CGWindowID,
  // which is what `screencapture -l` requires. Swift has CoreGraphics built in
  // so this works without any pip/pyobjc dependencies. AppleScript's "id of window"
  // returns an AppleScript window ID which is a different namespace and fails
  // for Electron apps like Cursor.
  const swiftScript = `
import CoreGraphics
import Foundation
let app = CommandLine.arguments[1]
if let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
    for w in windows {
        if let owner = w[kCGWindowOwnerName as String] as? String,
           let layer = w[kCGWindowLayer as String] as? Int,
           let id = w[kCGWindowNumber as String] as? Int,
           owner == app && layer == 0 {
            print(id)
            exit(0)
        }
    }
}
exit(1)
`.trim();
  const tmpSwift = join(tmpdir(), `bridge-getwindow-${Date.now()}.swift`);
  writeFileSync(tmpSwift, swiftScript);
  try {
    return execFileSync("swift", [tmpSwift, appName], {
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();
  } finally {
    try { unlinkSync(tmpSwift); } catch {}
  }
}

function captureWindow(appName) {
  let windowId;
  try {
    windowId = getWindowId(appName);
  } catch (err) {
    throw new Error(`Could not find window for "${appName}": ${err.message}`);
  }

  const tmpPath = join(tmpdir(), `bridge-window-${Date.now()}.png`);
  try {
    execFileSync("screencapture", ["-l", windowId, "-x", tmpPath], {
      timeout: 10_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    if (stderr.includes("could not create image") || err.message.includes("could not create image")) {
      throwScreenRecordingError();
    }
    throw new Error(`screencapture -l failed for "${appName}": ${err.message}`);
  }

  if (!existsSync(tmpPath)) {
    throwScreenRecordingError();
  }

  return compressAndEncode(tmpPath);
}

// ── Terminal capture ────────────────────────────────────────────────────────

const TERMINAL_APPS = ["iTerm2", "Terminal", "Alacritty", "Warp"];

function captureTerminal() {
  const errors = [];
  for (const app of TERMINAL_APPS) {
    try {
      return captureWindow(app);
    } catch (err) {
      errors.push(`${app}: ${err.message}`);
    }
  }
  throw new Error(`No terminal window found. Tried: ${errors.join("; ")}`);
}

// ── Code / diff rendering ───────────────────────────────────────────────────

const LANG_TO_EXT = {
  javascript: ".js", typescript: ".ts", python: ".py",
  rust: ".rs", go: ".go", java: ".java", c: ".c",
  cpp: ".cpp", swift: ".swift", ruby: ".rb", shell: ".sh",
  bash: ".sh", diff: ".diff", json: ".json", html: ".html",
  css: ".css", sql: ".sql", yaml: ".yml", markdown: ".md",
  xml: ".xml", toml: ".toml", ini: ".ini", makefile: ".mk",
};

const KEYWORDS = new Set([
  "function", "const", "let", "var", "return", "if", "else", "for", "while",
  "class", "import", "export", "from", "default", "new", "this", "typeof",
  "async", "await", "try", "catch", "throw", "finally", "switch", "case",
  "break", "continue", "do", "in", "of", "instanceof", "void", "delete",
  "yield", "extends", "implements", "interface", "type", "enum", "public",
  "private", "protected", "static", "readonly", "abstract", "override",
  "def", "self", "True", "False", "None", "elif", "except", "raise", "with",
  "as", "pass", "lambda", "print", "fn", "mut", "pub", "use", "mod", "impl",
  "struct", "trait", "where", "match", "loop", "ref", "move",
  "func", "package", "go", "defer", "chan", "select", "range", "map",
  "null", "undefined", "true", "false", "super", "constructor",
]);

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightDiffLine(line) {
  const escaped = escapeHtml(line);
  if (line.startsWith("+++") || line.startsWith("---")) {
    return `<span style="color:#569cd6;font-weight:bold">${escaped}</span>`;
  }
  if (line.startsWith("@@")) {
    return `<span style="color:#c586c0">${escaped}</span>`;
  }
  if (line.startsWith("diff ")) {
    return `<span style="color:#dcdcaa;font-weight:bold">${escaped}</span>`;
  }
  if (line.startsWith("+")) {
    return `<span style="color:#4ec9b0;background:rgba(78,201,176,0.1)">${escaped}</span>`;
  }
  if (line.startsWith("-")) {
    return `<span style="color:#f44747;background:rgba(244,71,71,0.1)">${escaped}</span>`;
  }
  return `<span style="color:#808080">${escaped}</span>`;
}

function highlightCodeLine(line) {
  let result = "";
  let i = 0;
  const len = line.length;

  while (i < len) {
    if (line[i] === "/" && line[i + 1] === "/") {
      result += `<span style="color:#6a9955">${escapeHtml(line.slice(i))}</span>`;
      break;
    }
    if (line[i] === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      result += `<span style="color:#6a9955">${escapeHtml(line.slice(i))}</span>`;
      break;
    }
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < len && line[j] !== quote) {
        if (line[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, len);
      result += `<span style="color:#ce9178">${escapeHtml(line.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (KEYWORDS.has(word)) {
        result += `<span style="color:#569cd6">${escapeHtml(word)}</span>`;
      } else if (j < len && line[j] === "(") {
        result += `<span style="color:#dcdcaa">${escapeHtml(word)}</span>`;
      } else {
        result += escapeHtml(word);
      }
      i = j;
      continue;
    }
    if (/[0-9]/.test(line[i])) {
      let j = i;
      while (j < len && /[0-9._xXa-fA-F]/.test(line[j])) j++;
      result += `<span style="color:#b5cea8">${escapeHtml(line.slice(i, j))}</span>`;
      i = j;
      continue;
    }
    result += escapeHtml(line[i]);
    i++;
  }

  return result;
}

const MAX_RENDER_LINES = 30;

function codeToHtml(code, language, title) {
  const isDiff = language?.toLowerCase() === "diff" ||
    code.startsWith("diff --git") ||
    code.startsWith("--- ");

  const allLines = code.split("\n");
  const truncated = allLines.length > MAX_RENDER_LINES;
  const visibleLines = truncated ? allLines.slice(0, MAX_RENDER_LINES) : allLines;

  const highlightedLines = visibleLines.map((line, idx) => {
    const lineNum = `<span style="color:#858585;display:inline-block;width:4ch;text-align:right;margin-right:1.5ch;user-select:none">${idx + 1}</span>`;
    const content = isDiff ? highlightDiffLine(line) : highlightCodeLine(line);
    return `${lineNum}${content}`;
  });

  if (truncated) {
    highlightedLines.push(
      `<span style="color:#858585;font-style:italic">     ... ${allLines.length - MAX_RENDER_LINES} more lines</span>`,
    );
  }

  const titleBar = title
    ? `<div style="background:#2d2d2d;color:#cccccc;padding:8px 14px;font-size:14px;border-bottom:1px solid #404040;font-family:-apple-system,sans-serif">${escapeHtml(title)}</div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { margin:0; background:#1e1e1e; }
  pre {
    margin:0; padding:12px; color:#d4d4d4;
    font-family:"SF Mono",Menlo,Monaco,monospace;
    font-size:18px; line-height:1.5; white-space:pre;
    overflow:hidden;
  }
</style></head><body>
${titleBar}
<pre>${highlightedLines.join("\n")}</pre>
</body></html>`;
}

function renderHtmlToImage(htmlContent) {
  const htmlPath = join(tmpdir(), `bridge-code-${Date.now()}.html`);
  writeFileSync(htmlPath, htmlContent);

  const outDir = join(tmpdir(), `bridge-ql-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });

  try {
    execFileSync("qlmanage", ["-t", "-s", "1600", "-o", outDir, htmlPath], {
      timeout: 15_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    try { unlinkSync(htmlPath); } catch (_) {}
    try { rmSync(outDir, { recursive: true }); } catch (_) {}
    throw new Error(`HTML render failed: ${err.message}`);
  }

  try { unlinkSync(htmlPath); } catch (_) {}

  const preview = readdirSync(outDir).find((f) => f.endsWith(".png"));
  if (!preview) {
    try { rmSync(outDir, { recursive: true }); } catch (_) {}
    throw new Error("qlmanage produced no preview from HTML");
  }

  const previewPath = join(outDir, preview);
  const b64 = compressAndEncode(previewPath, MAX_CODE_IMAGE_WIDTH);
  try { rmSync(outDir, { recursive: true }); } catch (_) {}
  return b64;
}

function renderCode(code, language, filename) {
  const title = filename ?? (language ? `[${language}]` : null);
  const html = codeToHtml(code, language, title);
  return renderHtmlToImage(html);
}

function renderFilePreview(filePath, startLine, endLine) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  let code;
  let title;

  if (startLine || endLine) {
    const lines = readFileSync(filePath, "utf8").split("\n");
    const start = (startLine ?? 1) - 1;
    const end = endLine ?? lines.length;
    code = lines.slice(start, end).join("\n");
    title = `${basename(filePath)}  L${start + 1}-${end}`;
  } else {
    const allLines = readFileSync(filePath, "utf8").split("\n");
    if (allLines.length > MAX_RENDER_LINES) {
      code = allLines.slice(0, MAX_RENDER_LINES).join("\n");
      title = `${basename(filePath)}  (first ${MAX_RENDER_LINES} of ${allLines.length} lines)`;
    } else {
      code = allLines.join("\n");
      title = basename(filePath);
    }
  }

  const ext = extname(filePath).replace(/^\./, "");
  const language = Object.entries(LANG_TO_EXT).find(
    ([, v]) => v === `.${ext}`,
  )?.[0] ?? ext;

  const html = codeToHtml(code, language, title);
  return renderHtmlToImage(html);
}

// ── Image file reading ──────────────────────────────────────────────────────

function readImageFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ext = extname(filePath).toLowerCase();
  const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".tif"];
  if (!imageExts.includes(ext)) {
    throw new Error(`Unsupported image format: ${ext}. Supported: ${imageExts.join(", ")}`);
  }

  const data = readFileSync(filePath);
  return data.toString("base64");
}

const server = new Server(
  { name: "bridge-artifacts", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "send_screenshot",
        description:
          "Capture a screenshot of the desktop and send it to the user's Spectacles glasses. " +
          "Use this to share visual context of the current screen state with the user.",
        inputSchema: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Optional description of what the screenshot shows",
            },
          },
          required: [],
        },
      },
      {
        name: "send_image",
        description:
          "Send an image file from the filesystem to the user's Spectacles glasses. " +
          "Use this to share diagrams, code screenshots, or other visual artifacts with the user.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute path to the image file to send",
            },
            label: {
              type: "string",
              description: "Optional description of the image",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "send_window",
        description:
          "Capture a specific application window by name and send it to the user's Spectacles. " +
          "Use this when the user asks to see a specific app like Lens Studio, VS Code, Chrome, etc. " +
          "Prefer this over send_screenshot when a specific app is mentioned.",
        inputSchema: {
          type: "object",
          properties: {
            app_name: {
              type: "string",
              description: "The name of the application whose window to capture (e.g. 'Lens Studio', 'Google Chrome', 'Visual Studio Code')",
            },
            label: {
              type: "string",
              description: "Optional description of what the window shows",
            },
          },
          required: ["app_name"],
        },
      },
      {
        name: "send_terminal",
        description:
          "Capture the terminal window and send it to the user's Spectacles. " +
          "Use this when the user asks to see terminal output, command results, or build logs.",
        inputSchema: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Optional description of what the terminal shows",
            },
          },
          required: [],
        },
      },
      {
        name: "send_code",
        description:
          "Render a code snippet or diff as a syntax-highlighted image and send it to the user's Spectacles. " +
          "Use this to show code changes, git diffs, or formatted code. " +
          "Prefer this over send_screenshot when showing code or diffs.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The code or diff text to render",
            },
            language: {
              type: "string",
              description: "Programming language for syntax highlighting (e.g. 'typescript', 'python', 'diff', 'json')",
            },
            filename: {
              type: "string",
              description: "Optional filename — used to infer language from extension if language is not specified",
            },
            label: {
              type: "string",
              description: "Optional description of the code",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "send_file_preview",
        description:
          "Render a source file (or a range of lines) as a syntax-highlighted image and send it to the user's Spectacles. " +
          "Use this when the user asks to see the current state of a file, or specific lines of a file.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute path to the source file to preview",
            },
            start_line: {
              type: "number",
              description: "Optional first line number to include (1-based)",
            },
            end_line: {
              type: "number",
              description: "Optional last line number to include (1-based)",
            },
            label: {
              type: "string",
              description: "Optional description of what the file preview shows",
            },
          },
          required: ["path"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments ?? {};

  log(`Tool call: ${toolName}, args: ${JSON.stringify(args)}`);

  if (toolName === "send_screenshot") {
    try {
      const base64Data = captureScreenshot();
      const filename = writeArtifact("screenshot", args.label ?? null, base64Data);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, artifact: filename, message: "Screenshot sent to Spectacles." }),
        }],
      };
    } catch (err) {
      log(`send_screenshot error: ${err.message}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }],
        isError: true,
      };
    }
  }

  if (toolName === "send_image") {
    const filePath = args.path;
    if (!filePath) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: "Missing required parameter: path" }) }],
        isError: true,
      };
    }
    try {
      const base64Data = readImageFile(filePath);
      const filename = writeArtifact("image", args.label ?? null, base64Data);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, artifact: filename, message: "Image sent to Spectacles." }),
        }],
      };
    } catch (err) {
      log(`send_image error: ${err.message}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }],
        isError: true,
      };
    }
  }

  if (toolName === "send_window") {
    const appName = args.app_name;
    if (!appName) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: "Missing required parameter: app_name" }) }],
        isError: true,
      };
    }
    try {
      const base64Data = captureWindow(appName);
      const filename = writeArtifact("window", args.label ?? `Window: ${appName}`, base64Data);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, artifact: filename, message: `${appName} window sent to Spectacles.` }),
        }],
      };
    } catch (err) {
      log(`send_window error: ${err.message}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }],
        isError: true,
      };
    }
  }

  if (toolName === "send_terminal") {
    try {
      const base64Data = captureTerminal();
      const filename = writeArtifact("terminal", args.label ?? "Terminal", base64Data);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, artifact: filename, message: "Terminal window sent to Spectacles." }),
        }],
      };
    } catch (err) {
      log(`send_terminal error: ${err.message}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }],
        isError: true,
      };
    }
  }

  if (toolName === "send_code") {
    const code = args.code;
    if (!code) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: "Missing required parameter: code" }) }],
        isError: true,
      };
    }
    try {
      const base64Data = renderCode(code, args.language ?? null, args.filename ?? null);
      const filename = writeArtifact("code", args.label ?? "Code", base64Data);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, artifact: filename, message: "Code preview sent to Spectacles." }),
        }],
      };
    } catch (err) {
      log(`send_code error: ${err.message}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }],
        isError: true,
      };
    }
  }

  if (toolName === "send_file_preview") {
    const filePath = args.path;
    if (!filePath) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: "Missing required parameter: path" }) }],
        isError: true,
      };
    }
    try {
      const base64Data = renderFilePreview(filePath, args.start_line ?? null, args.end_line ?? null);
      const label = args.label ?? (args.start_line
        ? `${basename(filePath)}:${args.start_line}-${args.end_line ?? "end"}`
        : basename(filePath));
      const filename = writeArtifact("file_preview", label, base64Data);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, artifact: filename, message: "File preview sent to Spectacles." }),
        }],
      };
    } catch (err) {
      log(`send_file_preview error: ${err.message}`);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
log("MCP artifacts server connected and ready");
