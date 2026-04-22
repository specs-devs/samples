-- Full schema for specs-agent-manager Supabase instance.
-- Run once on a fresh project: supabase db push --profile snap

-- ============================================================
-- bridge_agents – tracks paired bridge devices
-- ============================================================
CREATE TABLE public.bridge_agents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid        REFERENCES auth.users(id),
  pairing_code    text,
  pairing_expires_at timestamptz,
  pairing_metadata jsonb,
  poll_token      uuid,
  status          text        DEFAULT 'offline',
  last_seen_at    timestamptz,
  agent_type      text        NOT NULL DEFAULT 'openclaw',
  name            text,
  device_email    text,
  device_password_hash text,
  device_user_id  uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Only one active (unclaimed) pairing code at a time
CREATE UNIQUE INDEX idx_active_pairing_code
  ON public.bridge_agents (pairing_code)
  WHERE pairing_code IS NOT NULL AND owner_id IS NULL;

ALTER TABLE public.bridge_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Strict user access for bridge_agents"
  ON public.bridge_agents
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- ============================================================
-- cursor_api_keys – encrypted Cursor API keys per user
-- ============================================================
CREATE TABLE public.cursor_api_keys (
  user_id           uuid    PRIMARY KEY,
  name              text    DEFAULT 'default',
  api_key_encrypted text    NOT NULL,
  is_active         boolean DEFAULT true
);

-- Only accessed via service role in edge functions; deny all direct access.
ALTER TABLE public.cursor_api_keys ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- cursor_agents – Cursor cloud agent state synced via webhook
-- ============================================================
CREATE TABLE public.cursor_agents (
  id              text        PRIMARY KEY,
  user_id         uuid        NOT NULL,
  name            text,
  status          text,
  repository      text,
  pr_url          text,
  branch_name     text,
  summary         text,
  created_at      timestamptz DEFAULT now(),
  last_synced_at  timestamptz
);

-- Only accessed via service role in edge functions; deny all direct access.
ALTER TABLE public.cursor_agents ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- rate_limits – sliding-window rate limiting for edge functions
-- ============================================================
CREATE TABLE public.rate_limits (
  key           text        NOT NULL,
  window_start  timestamptz NOT NULL DEFAULT now(),
  request_count int         NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX idx_rate_limits_key_window
  ON public.rate_limits (key, window_start DESC);

-- ============================================================
-- check_rate_limit() – returns true if under the limit
-- ============================================================
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            text,
  p_window_seconds int DEFAULT 60,
  p_max_requests   int DEFAULT 30
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_window_start timestamptz;
  v_count        int;
BEGIN
  v_window_start := date_trunc('second', now())
    - ((EXTRACT(EPOCH FROM now())::int % p_window_seconds) * interval '1 second');

  DELETE FROM rate_limits
    WHERE window_start < now() - (p_window_seconds * 2) * interval '1 second';

  INSERT INTO rate_limits (key, window_start, request_count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;
