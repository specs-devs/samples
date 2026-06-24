import {
  setTimeout,
  clearTimeout,
} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

const BRIDGE_LIVE_STALE_MS = 20_000;
const BRIDGE_LIVE_OFFLINE_MS = 60_000;
const PAUSED_RETRY_MS = 5_000;

const TAG = "[DBG HeartbeatManager]";

export type BridgeConnectionState = "online" | "stale" | "offline";
type BridgeChannelState = "unknown" | "connected" | "disconnected";

interface BridgeHeartbeatRecord {
  dbStatus: "online" | "offline";
  dbLastSeenMs: number | null;
  liveLastSeenMs: number | null;
  channelState: BridgeChannelState;
  channelDisconnectedAtMs: number | null;
}

/**
 * Tracks bridge liveness with the broadcast channel as the primary signal and
 * the `bridge_agents.last_seen_at` heartbeat as a bootstrap/fallback signal.
 */
export class BridgeHeartbeatManager {
  private readonly heartbeatTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly heartbeatRecords = new Map<string, BridgeHeartbeatRecord>();

  constructor(
    private readonly bridgeConnectionMap: Map<string, BridgeConnectionState>,
    private readonly onStateChanged: (
      agentId: string,
      state: BridgeConnectionState,
      previousState?: BridgeConnectionState,
    ) => void,
    private readonly isDestroyed: () => boolean,
    private readonly isPaused: () => boolean,
  ) {}

  syncHeartbeat(
    agentId: string,
    status: "online" | "offline",
    lastSeenAt: string | null,
  ): BridgeConnectionState {
    const record = this.getRecord(agentId);
    record.dbStatus = status;

    const lastSeenMs = this.parseLastSeen(lastSeenAt);
    if (
      lastSeenMs !== null &&
      (record.dbLastSeenMs === null || lastSeenMs > record.dbLastSeenMs)
    ) {
      record.dbLastSeenMs = lastSeenMs;
    }

    const ageS = lastSeenMs !== null ? Math.round((Date.now() - lastSeenMs) / 1000) : null;
    const state = this.refreshState(agentId);
    print(`${TAG} syncHeartbeat ${agentId}: dbStatus=${status} lastSeenAt=${lastSeenAt ?? "null"} age=${ageS !== null ? `${ageS}s` : "null"} channelState=${record.channelState} → ${state}`);
    return state;
  }

  recordBridgeActivity(
    agentId: string,
    observedAt?: string | null,
  ): BridgeConnectionState {
    const record = this.getRecord(agentId);
    const prevLive = record.liveLastSeenMs;
    const liveSeenMs = this.parseLastSeen(observedAt ?? null) ?? Date.now();
    if (
      record.liveLastSeenMs === null ||
      liveSeenMs > record.liveLastSeenMs
    ) {
      record.liveLastSeenMs = liveSeenMs;
    }
    record.channelState = "connected";
    record.channelDisconnectedAtMs = null;
    // A live broadcast IS proof the bridge is online — don't wait for the
    // DB heartbeat round-trip to clear a stale "offline" dbStatus.
    if (record.dbStatus === "offline") {
      record.dbStatus = "online";
    }
    const state = this.refreshState(agentId);
    if (prevLive === null) {
      // Log first live signal only — subsequent ones are noisy (every 5s)
      print(`${TAG} recordBridgeActivity ${agentId}: first live signal received → ${state}`);
    }
    return state;
  }

  syncBroadcastChannel(
    agentId: string,
    connected: boolean,
  ): BridgeConnectionState {
    const record = this.getRecord(agentId);
    const prevChannelState = record.channelState;
    if (connected) {
      record.channelState = "connected";
      record.channelDisconnectedAtMs = null;
    } else {
      record.channelState = "disconnected";
      if (record.channelDisconnectedAtMs === null) {
        record.channelDisconnectedAtMs = Date.now();
      }
    }
    const state = this.refreshState(agentId);
    print(`${TAG} syncBroadcastChannel ${agentId}: ${prevChannelState} → ${record.channelState} → connectionState=${state}`);
    return state;
  }

  markBridgeOffline(agentId: string): BridgeConnectionState {
    const record = this.getRecord(agentId);
    record.dbStatus = "offline";
    this.stopBridgeHeartbeatPoll(agentId);
    this.bridgeConnectionMap.set(agentId, "offline");
    print(`${TAG} markBridgeOffline ${agentId}: explicit offline signal received`);
    return "offline";
  }

  stopBridgeHeartbeatPoll(agentId: string): void {
    const timer = this.heartbeatTimers.get(agentId);
    if (timer) clearTimeout(timer);
    this.heartbeatTimers.delete(agentId);
  }

  removeAgent(agentId: string): void {
    this.stopBridgeHeartbeatPoll(agentId);
    this.heartbeatRecords.delete(agentId);
    this.bridgeConnectionMap.delete(agentId);
  }

  clear(): void {
    for (const timer of this.heartbeatTimers.values()) {
      clearTimeout(timer);
    }
    this.heartbeatTimers.clear();
    this.heartbeatRecords.clear();
    this.bridgeConnectionMap.clear();
  }

  destroy(): void {
    this.clear();
  }

  private getRecord(agentId: string): BridgeHeartbeatRecord {
    const existing = this.heartbeatRecords.get(agentId);
    if (existing) return existing;

    const record: BridgeHeartbeatRecord = {
      dbStatus: "online",
      dbLastSeenMs: null,
      liveLastSeenMs: null,
      channelState: "unknown",
      channelDisconnectedAtMs: null,
    };
    this.heartbeatRecords.set(agentId, record);
    return record;
  }

  private refreshState(agentId: string): BridgeConnectionState {
    this.stopBridgeHeartbeatPoll(agentId);
    const state = this.resolveState(agentId);
    this.bridgeConnectionMap.set(agentId, state);
    this.scheduleNextTransition(agentId);
    return state;
  }

  private scheduleNextTransition(agentId: string): void {
    const targetAt = this.nextTransitionAt(agentId);
    if (targetAt === null) return;
    const now = Date.now();
    const delayS = Math.round(Math.max(0, targetAt - now) / 1000);

    print(`${TAG} scheduleNextTransition ${agentId}: next transition in ${delayS}s`);
    this.heartbeatTimers.set(
      agentId,
      setTimeout(
        () => this.advanceState(agentId),
        Math.max(0, targetAt - now),
      ),
    );
  }

  private advanceState(agentId: string): void {
    this.heartbeatTimers.delete(agentId);
    if (this.isDestroyed()) return;

    if (this.isPaused()) {
      print(`${TAG} advanceState ${agentId}: paused — retrying in ${PAUSED_RETRY_MS}ms`);
      this.heartbeatTimers.set(
        agentId,
        setTimeout(() => this.advanceState(agentId), PAUSED_RETRY_MS),
      );
      return;
    }

    const previousState = this.bridgeConnectionMap.get(agentId);
    const nextState = this.resolveState(agentId);
    const record = this.heartbeatRecords.get(agentId);
    const liveAgeS = record?.liveLastSeenMs != null ? Math.round((Date.now() - record.liveLastSeenMs) / 1000) : null;
    const dbAgeS = record?.dbLastSeenMs != null ? Math.round((Date.now() - record.dbLastSeenMs) / 1000) : null;
    print(`${TAG} advanceState ${agentId}: timer fired ${previousState ?? "?"} → ${nextState} (liveAge=${liveAgeS !== null ? `${liveAgeS}s` : "null"} dbAge=${dbAgeS !== null ? `${dbAgeS}s` : "null"} channelState=${record?.channelState ?? "?"})`);

    this.bridgeConnectionMap.set(agentId, nextState);

    if (previousState !== nextState) {
      this.onStateChanged(agentId, nextState, previousState);
    }

    this.scheduleNextTransition(agentId);
  }

  private resolveState(agentId: string): BridgeConnectionState {
    const record = this.heartbeatRecords.get(agentId);
    if (!record) return "stale";

    if (record.dbStatus === "offline") return "offline";

    if (record.channelState === "disconnected") {
      const disconnectedBaseMs =
        record.liveLastSeenMs ??
        record.channelDisconnectedAtMs ??
        record.dbLastSeenMs;
      if (disconnectedBaseMs === null) return "stale";
      const ageMs = Date.now() - disconnectedBaseMs;
      if (ageMs >= BRIDGE_LIVE_OFFLINE_MS) {
        return "offline";
      }
      return "stale";
    }

    const liveSeenMs = record.liveLastSeenMs ?? record.dbLastSeenMs;
    if (liveSeenMs === null) return "stale";

    const ageMs = Date.now() - liveSeenMs;
    if (ageMs >= BRIDGE_LIVE_OFFLINE_MS) {
      return "offline";
    }
    if (ageMs >= BRIDGE_LIVE_STALE_MS) {
      return "stale";
    }
    return "online";
  }

  private nextTransitionAt(agentId: string): number | null {
    const record = this.heartbeatRecords.get(agentId);
    if (!record || record.dbStatus === "offline") return null;

    const now = Date.now();

    if (record.channelState === "disconnected") {
      const disconnectedBaseMs =
        record.liveLastSeenMs ??
        record.channelDisconnectedAtMs ??
        record.dbLastSeenMs;
      if (disconnectedBaseMs === null) return null;
      if (now < disconnectedBaseMs + BRIDGE_LIVE_OFFLINE_MS) {
        return disconnectedBaseMs + BRIDGE_LIVE_OFFLINE_MS;
      }
      return null;
    }

    const liveSeenMs = record.liveLastSeenMs ?? record.dbLastSeenMs;
    if (liveSeenMs === null) return null;
    if (now < liveSeenMs + BRIDGE_LIVE_STALE_MS) {
      return liveSeenMs + BRIDGE_LIVE_STALE_MS;
    }
    if (now < liveSeenMs + BRIDGE_LIVE_OFFLINE_MS) {
      return liveSeenMs + BRIDGE_LIVE_OFFLINE_MS;
    }
    return null;
  }

  private parseLastSeen(lastSeenAt: string | null): number | null {
    if (!lastSeenAt) return null;
    const lastSeenMs = new Date(lastSeenAt).getTime();
    return Number.isFinite(lastSeenMs) ? lastSeenMs : null;
  }
}
