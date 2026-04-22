import chalk from "chalk";

const STATE_ICONS = {
  idle: "😴",
  thinking: "🧠",
  responding: "💬",
  awaiting_permission: "🔐",
  offline: "💀",
};

const STATUS_DOT = {
  online: chalk.green("●"),
  reconnecting: chalk.yellow("●"),
  offline: chalk.red("●"),
};

const AGENT_COLORS = [
  chalk.cyanBright,
  chalk.magentaBright,
  chalk.yellowBright,
  chalk.greenBright,
  chalk.blueBright,
];

const MAX_CONVS_DISPLAY = 8;

function formatElapsed(ms) {
  if (ms < 1000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function timestamp() {
  const d = new Date();
  return [
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join(":");
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(str, len) {
  if (!str) return "";
  if (str.length <= len) return str;
  return str.substring(0, len - 1) + "…";
}

export class Dashboard {
  constructor() {
    this.agents = new Map();
    this.startTime = Date.now();
    this.headerLines = 0;
    this.totalRows = 0;
    this.refreshTimer = null;
    this._colorIdx = 0;
    this._resizeHandler = null;
    this._navHandler = null;

    // Navigation state
    this._selectedAgentId = null;
    this._selectedConvIdx = 0;

    // Callbacks set by the consumer
    this.onQuit = null;
    this.onBack = null;
    this.onOpenConversation = null;

    // Suspended while main menu is shown (agents still running)
    this.suspended = false;
  }

  addAgent(agentId, name, type) {
    const color = AGENT_COLORS[this._colorIdx % AGENT_COLORS.length];
    this._colorIdx++;
    const shortLabel = name.split(/\s+/)[0].substring(0, 10);
    this.agents.set(agentId, {
      name,
      type,
      shortLabel,
      color,
      status: "offline",
      messagesIn: 0,
      messagesOut: 0,
      lastHeartbeat: null,
      heartbeatOk: true,
      lastClientSeen: null,
      conversations: new Map(),    // active conversations (state != idle)
      allConversations: new Map(), // all known conversations for browsing
    });
    // Default to first agent added
    if (this._selectedAgentId === null) {
      this._selectedAgentId = agentId;
    }
  }

  setAgentStatus(agentId, status) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.status = status;
    this.renderHeader();
  }

  setConversationState(agentId, conversationId, state) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    if (state === "idle") {
      agent.conversations.delete(conversationId);
    } else {
      const existing = agent.conversations.get(conversationId);
      agent.conversations.set(conversationId, {
        state,
        startedAt: existing?.startedAt ?? Date.now(),
      });
    }
    // Keep allConversations in sync with latest state
    const known = agent.allConversations.get(conversationId);
    if (known) {
      known.state = state === "idle" ? null : state;
      known.lastActivity = Date.now();
    }
    this.renderHeader();
  }

  /** Register a conversation title so it appears in the browser list. */
  setConversationTitle(agentId, conversationId, title, lastActivity = Date.now()) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const existing = agent.allConversations.get(conversationId);
    agent.allConversations.set(conversationId, {
      id: conversationId,
      title: title ?? "New Chat",
      state: existing?.state ?? null,
      lastActivity,
    });
    this.renderHeader();
  }

  recordMessage(agentId, direction) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    if (direction === "in") agent.messagesIn++;
    else agent.messagesOut++;
    this.renderHeader();
  }

  setHeartbeat(agentId, ok) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.heartbeatOk = ok;
    if (ok) agent.lastHeartbeat = Date.now();
    this.renderHeader();
  }

  setClientPresence(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.lastClientSeen = Date.now();
    this.renderHeader();
  }

  setup() {
    this.suspended = false;
    this.totalRows = process.stdout.rows || 24;
    this.headerLines = this._computeHeaderLines();

    process.stdout.write("\x1B[2J\x1B[H");
    process.stdout.write("\x1B[?25l");
    process.stdout.write(`\x1B[${this.headerLines + 1};${this.totalRows}r`);

    this.renderHeader();
    process.stdout.write(`\x1B[${this.headerLines + 1};1H`);

    this.refreshTimer = setInterval(() => this.renderHeader(), 1_000);

    this._resizeHandler = () => {
      this.totalRows = process.stdout.rows || 24;
      this.headerLines = this._computeHeaderLines();
      process.stdout.write(`\x1B[${this.headerLines + 1};${this.totalRows}r`);
      this.renderHeader();
    };
    process.stdout.on("resize", this._resizeHandler);

    // Keyboard navigation
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      this._navHandler = (data) => {
        const key = data.toString();
        if (key === "q" || key === "Q" || key === "\x03") {
          this.onQuit?.();
        } else if (key === "b" || key === "B") {
          this.onBack?.();
        } else if (key === "\x1B[A") {
          // Up arrow: move selection up; -1 selects the back button (if present)
          const minIdx = this.onBack ? -1 : 0;
          this._selectedConvIdx = Math.max(minIdx, this._selectedConvIdx - 1);
          this.renderHeader();
        } else if (key === "\x1B[B") {
          // Down arrow: move selection down
          const convs = this._getSortedConvs(this._selectedAgentId);
          const max = Math.min(convs.length, MAX_CONVS_DISPLAY) - 1;
          this._selectedConvIdx = Math.min(Math.max(0, max), this._selectedConvIdx + 1);
          this.renderHeader();
        } else if (key === "\t") {
          // Tab: cycle through agents
          this._cycleAgent();
        } else if (key === "\r" || key === "\n") {
          // Enter: back button or open selected conversation in CLI
          if (this._selectedConvIdx === -1) {
            this.onBack?.();
          } else {
            this._openSelected();
          }
        }
      };
      process.stdin.on("data", this._navHandler);
    } else {
      process.on("SIGINT", () => this.onQuit?.());
    }
  }

  teardown() {
    this.suspended = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this._resizeHandler) {
      process.stdout.removeListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._navHandler) {
      process.stdin.removeListener("data", this._navHandler);
      this._navHandler = null;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.stdout.write("\x1B[r");
    process.stdout.write("\x1B[?25h");
    process.stdout.write(`\x1B[${this.totalRows};1H\n`);
  }

  _computeHeaderLines() {
    const selectedAgent = this.agents.get(this._selectedAgentId);
    const selectedConvCount = selectedAgent
      ? Math.min(selectedAgent.allConversations.size, MAX_CONVS_DISPLAY)
      : 0;
    const selectedConvLines = Math.max(selectedConvCount, 1); // at least "no conversations"
    const otherAgentCount = Math.max(0, this.agents.size - 1);

    // 2 back button (when shown) + 4 title box + 1 spacer
    // selected agent: 1 status + 1 separator + selectedConvLines + 1 spacer
    // each other agent: 1 status + 1 summary + 1 spacer
    const backLines = this.onBack ? 2 : 0;
    const needed = backLines + 4 + 1 + (1 + 1 + selectedConvLines + 1) + otherAgentCount * 3 + 2;
    const maxHeader = Math.floor(this.totalRows * 0.6);
    return Math.max(Math.min(needed, maxHeader), 8);
  }

  renderHeader() {
    if (this.suspended) return;
    const out = process.stdout;
    out.write("\x1B[s");

    const now = Date.now();
    let row = 1;
    const cols = out.columns || 80;

    const writeLine = (content) => {
      if (row > this.headerLines) return;
      out.write(`\x1B[${row};1H\x1B[K${content}`);
      row++;
    };

    if (this.onBack) {
      const backSelected = this._selectedConvIdx === -1;
      const backLine = backSelected
        ? `  ${chalk.cyan("▶")} ${chalk.cyan("[b]")} ${chalk.bold.cyan("← Back to menu")}`
        : `    ${chalk.dim("[b]")} ${chalk.cyan("← Back to menu")}`;
      writeLine(backLine);
      writeLine("");
    }

    writeLine(`  ${chalk.cyan("╭─────────────────────────────────────╮")}`);
    writeLine(`  ${chalk.cyan("│")}  👓  ${chalk.bold("Spectacles Agent Bridge")}        ${chalk.cyan("│")}`);
    writeLine(`  ${chalk.cyan("╰─────────────────────────────────────╯")}`);
    writeLine("");

    // Render selected agent expanded, others compact
    for (const [agentId, agent] of this.agents) {
      const isSelected = agentId === this._selectedAgentId;
      const dot = STATUS_DOT[agent.status] ?? STATUS_DOT.offline;
      const counts = `${chalk.dim("↑")}${agent.messagesIn} ${chalk.dim("↓")}${agent.messagesOut}`;
      const statusLabel = agent.status.charAt(0).toUpperCase() + agent.status.slice(1);

      let icon = STATE_ICONS.idle;
      if (agent.status === "offline") {
        icon = STATE_ICONS.offline;
      } else if (agent.conversations.size > 0) {
        for (const [, c] of agent.conversations) {
          if (c.state === "awaiting_permission") { icon = STATE_ICONS.awaiting_permission; break; }
          if (c.state === "thinking") icon = STATE_ICONS.thinking;
          if (c.state === "responding" && icon === STATE_ICONS.idle) icon = STATE_ICONS.responding;
        }
      }

      const clientDot = this._clientDot(agent, now);

      if (isSelected) {
        const tabHint = this.agents.size > 1 ? chalk.dim("  [tab: switch]") : "";
        writeLine(`  ${icon} ${agent.color(agent.name.padEnd(22))} ${dot} ${statusLabel}  ${counts}  ${clientDot}${tabHint}`);
        writeLine(`  ${chalk.dim("─".repeat(Math.min(cols - 4, 50)))}`);

        const convs = this._getSortedConvs(agentId);
        if (convs.length === 0) {
          writeLine(`     ${chalk.dim("no conversations yet")}`);
        } else {
          const display = convs.slice(0, MAX_CONVS_DISPLAY);
          const titleWidth = Math.max(20, cols - 50);
          for (let i = 0; i < display.length; i++) {
            const conv = display[i];
            const cursor = i === this._selectedConvIdx ? chalk.cyan("▶") : " ";
            const shortId = chalk.dim(conv.id.substring(0, 8));
            const title = truncate(conv.title ?? "New Chat", titleWidth);
            const stateIcon = conv.state ? (STATE_ICONS[conv.state] ?? "") : " ";
            const elapsed = chalk.dim(formatElapsed(now - conv.lastActivity));
            writeLine(`     ${cursor}  ${shortId}  ${title.padEnd(titleWidth)}  ${stateIcon}  ${elapsed}`);
          }
        }
      } else {
        writeLine(`  ${icon} ${agent.color(agent.name.padEnd(22))} ${dot} ${statusLabel}  ${counts}  ${clientDot}`);
        const convs = this._getSortedConvs(agentId);
        const activeCount = agent.conversations.size;
        let summary;
        if (activeCount > 0) {
          summary = `${activeCount} active · ${convs.length} total`;
        } else {
          summary = `${convs.length} conversation${convs.length !== 1 ? "s" : ""}`;
        }
        writeLine(`     ${chalk.dim("└─ " + summary + (this.agents.size > 1 ? "  (tab to focus)" : ""))}`);
      }

      writeLine("");
    }

    while (row < this.headerLines - 1) {
      writeLine("");
    }

    const hb = this._heartbeatLine(now);
    const up = formatUptime(now - this.startTime);
    const navHint = chalk.dim("↑↓ navigate · ⏎ open in CLI · tab: switch · b: menu · q quit");
    writeLine(`  ${hb}  ${chalk.dim("│")}  ${chalk.dim("⏱")}  ${up}  ${chalk.dim("│")}  ${navHint}`);

    writeLine(`  ${chalk.dim("─".repeat(Math.min(cols - 4, 46)))}`);

    out.write("\x1B[u");
  }

  _heartbeatLine(now) {
    let allOk = true;
    let lastBeat = null;
    for (const [, a] of this.agents) {
      if (!a.heartbeatOk) allOk = false;
      if (a.lastHeartbeat && (!lastBeat || a.lastHeartbeat > lastBeat)) lastBeat = a.lastHeartbeat;
    }
    if (allOk && lastBeat) return `${chalk.green("❤")}  OK ${chalk.dim(`(${formatElapsed(now - lastBeat)})`)}`;
    if (lastBeat) return `${chalk.yellow("❤")}  Issue ${chalk.dim(`(${formatElapsed(now - lastBeat)})`)}`;
    return `${chalk.dim("❤")}  ${chalk.dim("waiting...")}`;
  }

  log(agentId, message) {
    if (this.suspended) return;
    const ts = chalk.dim(timestamp());
    let label;
    if (agentId) {
      const agent = this.agents.get(agentId);
      label = agent ? agent.color(agent.shortLabel.padEnd(10)) : chalk.dim("???".padEnd(10));
    } else {
      label = chalk.dim("system".padEnd(10));
    }
    process.stdout.write(`  ${ts}  ${label}  ${message}\n`);
  }

  // ── Navigation helpers ───────────────────────────────────────────

  _getSortedConvs(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return [];
    return [...agent.allConversations.values()].sort(
      (a, b) => b.lastActivity - a.lastActivity,
    );
  }

  _cycleAgent() {
    const ids = [...this.agents.keys()];
    if (ids.length <= 1) return;
    const idx = ids.indexOf(this._selectedAgentId);
    this._selectedAgentId = ids[(idx + 1) % ids.length];
    this._selectedConvIdx = 0;
    this.headerLines = this._computeHeaderLines();
    process.stdout.write(`\x1B[${this.headerLines + 1};${this.totalRows}r`);
    this.renderHeader();
  }

  _clientDot(agent, now) {
    const CLIENT_ONLINE_MS = 20_000;
    const CLIENT_STALE_MS = 60_000;
    if (agent.lastClientSeen === null) return chalk.dim("👓 ● —");
    const age = now - agent.lastClientSeen;
    const elapsed = chalk.dim(formatElapsed(age));
    if (age < CLIENT_ONLINE_MS) return `👓 ${chalk.green("●")} ${elapsed}`;
    if (age < CLIENT_STALE_MS) return `👓 ${chalk.yellow("●")} ${elapsed}`;
    return `👓 ${chalk.dim("●")} ${elapsed}`;
  }

  _openSelected() {
    const convs = this._getSortedConvs(this._selectedAgentId);
    const conv = convs[this._selectedConvIdx];
    if (!conv) return;
    this.onOpenConversation?.(this._selectedAgentId, conv.id);
  }
}
