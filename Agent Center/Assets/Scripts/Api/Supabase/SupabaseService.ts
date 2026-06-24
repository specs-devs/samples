import {
  createClient,
  SupabaseClient,
  RealtimeChannel,
  REALTIME_SUBSCRIBE_STATES,
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
  RealtimePostgresChangesPayload,
} from "SupabaseClient.lspkg/supabase-snapcloud";
import {
  setTimeout,
  clearTimeout,
} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { BroadcastEnvelope } from "./SupabaseTypes";

const TAG = "[SupabaseService]";

const HEARTBEAT_INTERVAL_MS = 2500;
const MAX_RECONNECT_DELAY_MS = 30000;
const BASE_RECONNECT_DELAY_MS = 500;
const SIGN_IN_INITIAL_TIMEOUT_MS = 3000;
const SIGN_IN_MAX_TIMEOUT_MS = 8000;

export class SupabaseService {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private userId: string | null = null;
  private accessToken: string | null = null;
  private anonKey: string = "";
  private reconnectAttempts = 0;
  private connected = false;
  private reconnecting = false;
  private channelReadyMap = new Map<RealtimeChannel, Promise<void>>();
  private tokenExpiresAt: number = 0;
  private tableChannelsByName = new Map<string, RealtimeChannel>();
  private tableChannelNames = new Map<RealtimeChannel, string>();
  private tableRecreators = new Map<string, () => RealtimeChannel>();
  private cancelledTableChannels = new Set<string>();
  private tableReconnectAttempts = new Map<string, number>();

  public readonly onBroadcast = new Event<BroadcastEnvelope>();
  public readonly onConnected = new Event<undefined>();
  public readonly onDisconnected = new Event<string>();
  public readonly onError = new Event<string>();

  async init(supabaseProject: SupabaseProject): Promise<boolean> {
    const url = supabaseProject.url.replace(/\/$/, "");
    this.anonKey = supabaseProject.publicToken;

    print(`${TAG} Initializing client...`);
    print(`${TAG} Project URL: ${url}`);

    if (this.client) {
      this.client.removeAllChannels();
      this.channel = null;
      this.connected = false;
      this.tableChannelsByName.clear();
      this.tableChannelNames.clear();
      this.tableRecreators.clear();
      this.tableReconnectAttempts.clear();
      this.cancelledTableChannels.clear();
    }

    const options = {
      realtime: {
        heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      },
    };

    this.client = createClient(url, this.anonKey, options);

    if (!this.client) {
      print(`${TAG} Failed to create client`);
      this.onError.invoke("Failed to create Supabase client");
      return false;
    }

    print(`${TAG} Client created, signing in...`);
    const ok = await this.signIn();
    if (ok) {
      this.subscribeToUserChannel();
    }
    return ok;
  }

  private async signIn(maxAttempts = 4): Promise<boolean> {
    if (!this.client) return false;

    // The Snap Cloud Supabase client injects the Snapchat identity token
    // automatically at the network layer; the token field is intentionally empty.
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const timeout = SIGN_IN_INITIAL_TIMEOUT_MS;
      const { data, error } = await Promise.race([
        this.client.auth.signInWithIdToken({ provider: "snapchat", token: "" }),
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: null,
                error: new Error(`timed out after ${timeout}ms`),
              }),
            timeout,
          ),
        ),
      ]);

      if (error) {
        const msg =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : JSON.stringify(error, Object.getOwnPropertyNames(error));
        print(
          `${TAG} Sign in attempt ${attempt}/${maxAttempts} failed: ${msg}`,
        );
      } else if (data?.session && data.user) {
        this.userId = data.user.id;
        this.accessToken = data.session.access_token;
        const expiresAt = (data.session as unknown as Record<string, unknown>)
          .expires_at;
        this.tokenExpiresAt =
          typeof expiresAt === "number" ? expiresAt * 1000 : 0;
        print(`${TAG} Signed in. User: ${this.userId}`);
        return true;
      } else {
        print(`${TAG} Sign in attempt ${attempt}/${maxAttempts}: no session`);
      }

      if (attempt < maxAttempts) {
        const delay = BASE_RECONNECT_DELAY_MS;
        print(`${TAG} Retrying sign in in ${delay}ms`);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    this.onError.invoke("Sign in failed after retries");
    return false;
  }

  private subscribeToUserChannel(): void {
    if (!this.client || !this.userId) return;
    this.createChannel();
  }

  private createChannel(): void {
    if (!this.client || !this.userId) return;

    if (this.channel) {
      const stale = this.channel;
      this.channel = null;
      this.client.removeChannel(stale);
    }

    const topic = `user:${this.userId}`;

    const ch = this.client.channel(topic, {
      config: {
        broadcast: {
          ack: false,
          self: false,
        },
      },
    });
    this.channel = ch;

    const statusFilter: { event: string } = { event: "agent_status" };
    ch.on(
      "broadcast",
      statusFilter,
      (msg: {
        event: string;
        payload: Record<string, unknown>;
        meta?: { replayed?: boolean; id: string };
      }) => {
        if (this.channel !== ch) return;
        this.emitBroadcast(msg);
      },
    );

    const launchFilter: { event: string } = { event: "agent_launched" };
    ch.on(
      "broadcast",
      launchFilter,
      (msg: {
        event: string;
        payload: Record<string, unknown>;
        meta?: { replayed?: boolean; id: string };
      }) => {
        if (this.channel !== ch) return;
        this.emitBroadcast(msg);
      },
    );

    let subscribeResolved = false;

    ch.subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
      if (this.channel !== ch) return;
      subscribeResolved = true;

      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.reconnecting = false;
        print(`${TAG} Channel subscribed: ${topic}`);
        this.onConnected.invoke(undefined);
      } else if (
        status === REALTIME_SUBSCRIBE_STATES.CLOSED ||
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
      ) {
        this.connected = false;
        print(`${TAG} Channel ${status}: ${topic}`);
        this.onDisconnected.invoke(status);
        this.scheduleReconnect();
      }
    });

    // Watchdog: if the channel never reaches SUBSCRIBED (or error) within 10s,
    // force a reconnect — guards against silent hang in connecting state.
    setTimeout(() => {
      if (!subscribeResolved && this.channel === ch) {
        print(`${TAG} Subscribe watchdog fired, forcing reconnect`);
        this.channel = null;
        this.client?.removeChannel(ch);
        this.scheduleReconnect();
      }
    }, 10000);
  }

  private emitBroadcast(msg: {
    event: string;
    payload: Record<string, unknown>;
    meta?: { replayed?: boolean; id: string };
  }): void {
    print(`[DBG SupabaseService] emitBroadcast: event=${msg.event} payloadKeys=${Object.keys(msg.payload ?? {}).join(",")}`);
    this.onBroadcast.invoke({
      event: msg.event,
      payload: msg.payload ?? {},
      meta: msg.meta
        ? { id: msg.meta.id, replayed: msg.meta.replayed ?? false }
        : undefined,
    });
  }

  async invokeFunction<T = unknown>(
    functionName: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    if (!this.client) {
      throw new Error(`${TAG} Client not initialized`);
    }

    print(`${TAG} Invoking ${functionName}`);

    const { data, error } = await this.client.functions.invoke<T>(
      functionName,
      { body },
    );

    if (error) {
      let serverDetails = "";
      try {
        const ctx = error.context as Response | undefined;
        if (ctx && typeof ctx.text === "function") {
          serverDetails = await ctx.text();
        }
      } catch (e) {
        print(`${TAG} Could not extract error context: ${e}`);
      }

      print(`${TAG} ${functionName} error: ${error.message}`);
      if (serverDetails) {
        print(`${TAG} ${functionName} server response: ${serverDetails}`);
      }

      throw new Error(
        `${TAG} Function ${functionName} failed: ${error.message}${serverDetails ? ` — ${serverDetails}` : ""}`,
      );
    }

    print(`${TAG} ${functionName} succeeded`);
    return data as T;
  }

  async query<T = unknown>(
    table: string,
    options?: {
      columns?: string;
      order?: { column: string; ascending?: boolean };
      limit?: number;
      filter?: { column: string; op: string; value: string };
    },
  ): Promise<T[]> {
    if (!this.client) {
      throw new Error(`${TAG} Client not initialized`);
    }

    let builder = this.client.from(table).select(options?.columns ?? "*");

    if (options?.filter) {
      builder = builder.filter(
        options.filter.column,
        options.filter.op,
        options.filter.value,
      );
    }
    if (options?.order) {
      builder = builder.order(options.order.column, {
        ascending: options.order.ascending ?? false,
      });
    }
    if (options?.limit) {
      builder = builder.limit(options.limit);
    }

    const { data, error } = await builder;

    if (error) {
      throw new Error(`${TAG} Query ${table} failed: ${error.message}`);
    }

    return (data ?? []) as T[];
  }

  async insert<T = unknown>(
    table: string,
    row: Record<string, unknown>,
  ): Promise<T> {
    if (!this.client) {
      throw new Error(`${TAG} Client not initialized`);
    }

    const { data, error } = await this.client
      .from(table)
      .insert(row)
      .select()
      .single();

    if (error) {
      throw new Error(`${TAG} Insert into ${table} failed: ${error.message}`);
    }

    return data as T;
  }

  subscribeToInserts<T extends Record<string, unknown>>(
    channelName: string,
    table: string,
    filter: string | undefined,
    callback: (payload: RealtimePostgresInsertPayload<T>) => void,
  ): RealtimeChannel {
    if (!this.client) {
      throw new Error(`${TAG} Client not initialized`);
    }

    this.cancelledTableChannels.delete(channelName);
    const prior = this.tableChannelsByName.get(channelName);
    if (prior) {
      this.client.removeChannel(prior);
      this.tableChannelNames.delete(prior);
    }

    const pgFilter: {
      event: `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT}`;
      schema: string;
      table?: string;
      filter?: string;
    } = {
      event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
      schema: "public",
      table,
    };
    if (filter) {
      pgFilter.filter = filter;
    }

    const ch = this.client.channel(channelName);
    ch.on(REALTIME_LISTEN_TYPES.POSTGRES_CHANGES, pgFilter, callback);

    this.tableRecreators.set(channelName, () =>
      this.subscribeToInserts<T>(channelName, table, filter, callback),
    );

    ch.subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        print(`${TAG} Table channel subscribed: ${channelName}`);
        this.tableReconnectAttempts.delete(channelName);
      } else if (
        status === REALTIME_SUBSCRIBE_STATES.CLOSED ||
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
      ) {
        print(`${TAG} Table channel ${status}: ${channelName}`);
        this.scheduleTableReconnect(channelName);
      }
    });

    this.tableChannelsByName.set(channelName, ch);
    this.tableChannelNames.set(ch, channelName);
    return ch;
  }

  subscribeToUpdates<T extends Record<string, unknown>>(
    channelName: string,
    table: string,
    filter: string | undefined,
    callback: (payload: RealtimePostgresUpdatePayload<T>) => void,
  ): RealtimeChannel {
    if (!this.client) {
      throw new Error(`${TAG} Client not initialized`);
    }

    this.cancelledTableChannels.delete(channelName);
    const prior = this.tableChannelsByName.get(channelName);
    if (prior) {
      this.client.removeChannel(prior);
      this.tableChannelNames.delete(prior);
    }

    const pgFilter: {
      event: `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE}`;
      schema: string;
      table?: string;
      filter?: string;
    } = {
      event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE,
      schema: "public",
      table,
    };
    if (filter) {
      pgFilter.filter = filter;
    }

    const ch = this.client.channel(channelName);
    ch.on(REALTIME_LISTEN_TYPES.POSTGRES_CHANGES, pgFilter, callback);

    this.tableRecreators.set(channelName, () =>
      this.subscribeToUpdates<T>(channelName, table, filter, callback),
    );

    ch.subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        print(`${TAG} Table channel subscribed: ${channelName}`);
        this.tableReconnectAttempts.delete(channelName);
      } else if (
        status === REALTIME_SUBSCRIBE_STATES.CLOSED ||
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
      ) {
        print(`${TAG} Table channel ${status}: ${channelName}`);
        this.scheduleTableReconnect(channelName);
      }
    });

    this.tableChannelsByName.set(channelName, ch);
    this.tableChannelNames.set(ch, channelName);
    return ch;
  }

  subscribeToDeletes<T extends Record<string, unknown>>(
    channelName: string,
    table: string,
    filter: string | undefined,
    callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  ): RealtimeChannel {
    if (!this.client) {
      throw new Error(`${TAG} Client not initialized`);
    }

    this.cancelledTableChannels.delete(channelName);
    const prior = this.tableChannelsByName.get(channelName);
    if (prior) {
      this.client.removeChannel(prior);
      this.tableChannelNames.delete(prior);
    }

    const pgFilter: {
      event: `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.DELETE}`;
      schema: string;
      table?: string;
      filter?: string;
    } = {
      event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.DELETE,
      schema: "public",
      table,
    };
    if (filter) {
      pgFilter.filter = filter;
    }

    const ch = this.client.channel(channelName);
    ch.on(REALTIME_LISTEN_TYPES.POSTGRES_CHANGES, pgFilter, callback);

    this.tableRecreators.set(channelName, () =>
      this.subscribeToDeletes<T>(channelName, table, filter, callback),
    );

    ch.subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        print(`${TAG} Table channel subscribed: ${channelName}`);
        this.tableReconnectAttempts.delete(channelName);
      } else if (
        status === REALTIME_SUBSCRIBE_STATES.CLOSED ||
        status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
      ) {
        print(`${TAG} Table channel ${status}: ${channelName}`);
        this.scheduleTableReconnect(channelName);
      }
    });

    this.tableChannelsByName.set(channelName, ch);
    this.tableChannelNames.set(ch, channelName);
    return ch;
  }

  removeTableChannel(channel: RealtimeChannel): void {
    const name = this.tableChannelNames.get(channel);
    if (name) {
      this.cancelledTableChannels.add(name);
      this.tableRecreators.delete(name);
      this.tableReconnectAttempts.delete(name);
      const current = this.tableChannelsByName.get(name);
      if (current && current !== channel && this.client) {
        this.client.removeChannel(current);
        this.tableChannelNames.delete(current);
      }
      this.tableChannelsByName.delete(name);
    }
    this.tableChannelNames.delete(channel);
    if (this.client) {
      this.client.removeChannel(channel);
    }
    this.channelReadyMap.delete(channel);
  }

  createBroadcastChannel(
    channelName: string,
    handlers: Array<{
      event: string;
      callback: (payload: Record<string, unknown>) => void;
    }>,
    options?: {
      onStatusChanged?: (status: REALTIME_SUBSCRIBE_STATES) => void;
    },
  ): RealtimeChannel {
    if (!this.client) {
      throw new Error(`${TAG} Client not initialized`);
    }

    const ch = this.client.channel(channelName, {
      config: { broadcast: { ack: false, self: false } },
    });

    for (const handler of handlers) {
      const filter: { event: string } = { event: handler.event };
      ch.on(
        "broadcast",
        filter,
        (msg: { event: string; payload: Record<string, unknown> }) => {
          handler.callback(msg.payload);
        },
      );
    }

    const readyPromise = new Promise<void>((resolve, reject) => {
      const subscriptionTimeout = setTimeout(() => {
        print(
          `${TAG} Broadcast channel subscription timed out: ${channelName}`,
        );
        reject(
          new Error(
            `Broadcast channel subscription timed out: ${channelName}`,
          ),
        );
      }, 10_000);

      ch.subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
        if (options?.onStatusChanged) {
          options.onStatusChanged(status);
        }
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          clearTimeout(subscriptionTimeout);
          print(`${TAG} Broadcast channel subscribed: ${channelName}`);
          resolve();
        } else if (
          status === REALTIME_SUBSCRIBE_STATES.CLOSED ||
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
        ) {
          print(`${TAG} Broadcast channel ${status}: ${channelName}`);
        }
      });
    });

    this.channelReadyMap.set(ch, readyPromise);
    return ch;
  }

  async sendBroadcast(
    channel: RealtimeChannel,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const ready = this.channelReadyMap.get(channel);
    if (ready) {
      try {
        await ready;
      } catch (err) {
        print(`${TAG} Channel not confirmed ready for "${event}": ${err}`);
        return false;
      }
    }

    print(`[DBG SupabaseService] sendBroadcast: event=${event}`);
    try {
      const result = channel.send({ type: "broadcast", event, payload });
      if (result instanceof Promise) {
        const status = await result;
        if (status !== "ok") {
          print(`[DBG SupabaseService] sendBroadcast: event=${event} result=${status} (non-ok)`);
          print(`${TAG} Broadcast send "${event}" result: ${status}`);
          return false;
        }
      }
      print(`[DBG SupabaseService] sendBroadcast: event=${event} sent ok`);
      return true;
    } catch (err) {
      print(`[DBG SupabaseService] sendBroadcast: event=${event} threw error: ${err}`);
      print(`${TAG} Broadcast send "${event}" error: ${err}`);
      return false;
    }
  }

  async sendBroadcastWithRetry(
    channel: RealtimeChannel,
    event: string,
    payload: Record<string, unknown>,
    attempts: number = 3,
    delayMs: number = 500,
  ): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      const sent = await this.sendBroadcast(channel, event, payload);
      if (sent) return true;
      if (i < attempts - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return false;
  }

  private isTokenExpired(): boolean {
    return this.tokenExpiresAt > 0 && Date.now() >= this.tokenExpiresAt;
  }

  private scheduleTableReconnect(channelName: string): void {
    if (this.cancelledTableChannels.has(channelName)) return;

    const attempts =
      (this.tableReconnectAttempts.get(channelName) ?? 0) + 1;
    this.tableReconnectAttempts.set(channelName, attempts);
    const delay = BASE_RECONNECT_DELAY_MS;

    print(
      `${TAG} Table channel reconnecting in ${delay}ms: ${channelName} (attempt ${attempts})`,
    );

    setTimeout(() => {
      if (this.cancelledTableChannels.has(channelName)) return;
      if (!this.client) return;
      const recreate = this.tableRecreators.get(channelName);
      if (recreate) recreate();
    }, delay);
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    const delay = BASE_RECONNECT_DELAY_MS;
    this.reconnectAttempts++;

    print(
      `${TAG} Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    setTimeout(async () => {
      this.reconnecting = false;
      if (this.connected) return;

      // Re-auth if the session token is missing — covers expired or failed initial sign-in.
      if (!this.accessToken || this.isTokenExpired()) {
        const ok = await this.signIn();
        if (!ok) {
          this.scheduleReconnect();
          return;
        }
      }

      this.createChannel();
    }, delay);
  }

  getUserId(): string {
    return this.userId ?? "";
  }

  get isConnected(): boolean {
    return this.connected;
  }

  destroy(): void {
    if (this.channel && this.client) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }
    this.connected = false;
    for (const name of this.tableChannelsByName.keys()) {
      this.cancelledTableChannels.add(name);
    }
    this.tableChannelsByName.clear();
    this.tableChannelNames.clear();
    this.tableRecreators.clear();
    this.tableReconnectAttempts.clear();
    if (this.client) {
      this.client.removeAllChannels();
      this.client = null;
    }
  }
}
