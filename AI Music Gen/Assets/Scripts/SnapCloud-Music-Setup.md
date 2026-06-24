# Snap Cloud Music Path — Setup

How the Snap Cloud generation path in `MusicGenerator.ts` works, and the one-time setup
it needs. **No Google credentials** — generation runs through the Remote Service
Gateway; storage and the one edge function run on Snap Cloud.

## Why

The original path requested `lyria-002` through the Remote Service Gateway, which
returns a ~8MB base64 WAV in a single RemoteApi message — over the 4MB gRPC receive
limit on device (`Received message larger than max (8388805 vs. 4194304)`), so the
response never reaches the lens.

**Lyria 3 changes the equation:** `lyria-3-clip-preview` is served through the same
`generateContent` endpoint the lens already uses for Gemini prompts, and returns a
30-second **MP3** (~1MB base64) — comfortably under the limit.

**But SnapOS cannot decode MP3 at runtime.** Verified on device: the downloaded track
loads and "plays", but pushes zero samples into the audio graph (`BufferRingWriter
write: numSamples 0`) — silence. The editor decodes MP3 fine, which is why the bug only
shows on device. The same device plays WAV through the identical RemoteMediaModule path
(DJ Specs ships WAV decks for this reason, and SnapCloudExamples' device-tested storage
flow uploads WAV). Lyria 3 offers no format choice — `generationConfig.audioConfig` and
`responseMimeType: audio/wav` are both rejected with 400 — so the MP3 is transcoded to
WAV server-side by the `transcode-to-wav` edge function.

```
Lens ──RSG Gemini endpoint──▶ lyria-3-clip-preview ──▶ base64 MP3 (~1MB, under cap)
  │
  ├─ Base64.decode → upload MP3 to Snap Cloud Storage      (track persisted)
  │
  ├─ POST transcode-to-wav {bucket, path}  → track_<ts>.wav written next to the MP3
  │
  └─ WAV public URL → loadResourceAsAudioTrackAsset → AudioComponent
```

The storage round-trip is not just for persistence: Lens Studio has no runtime API to
turn raw audio bytes into a playable asset, but `RemoteMediaModule` can load one from a
URL — so Snap Cloud Storage doubles as the audio decoder.

If the edge function is not deployed, the lens logs a warning and falls back to the MP3
URL: playback still works in the editor, but the track is silent on device.

## One-time setup

1. **Supabase project**: Window > Supabase > Import Credentials, then assign the
   `SupabaseProject` asset to the `SnapCloudRequirements` component in the scene.
2. **Bucket**: create a bucket named `generated-music` in the Supabase dashboard
   (Storage → New bucket). Either:
   - make it **public** (simplest — playback uses the public URL), or
   - keep it **private** and add storage policies allowing the authenticated role to
     `insert` and `select` on this bucket (the lens signs in with the Snapchat provider
     and uses a 1-hour signed URL for playback).
3. **Edge function**: deploy `SnapCloud/functions/transcode-to-wav/index.ts` (project
   root, next to `Assets/`). Either paste it into the dashboard (Edge Functions → New
   function, name it exactly `transcode-to-wav`) or use the Supabase CLI:
   `supabase functions deploy transcode-to-wav`. It needs no extra secrets —
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
4. **MusicGenerator inputs**: enable **Use Snap Cloud**, assign **SnapCloudRequirements**;
   defaults for **Lyria Model** (`lyria-3-clip-preview`) and **Storage Bucket**
   (`generated-music`) match this guide.
5. The usual **RSG Google token** (Remote Service Gateway Token plugin) is the only
   other credential — the same one the lens already uses for Gemini.

## Open verification

Whether smart-gate (the RSG backend) passes the `lyria-3-clip-preview` model id through
its Gemini `models` endpoint is unverified — the package sends the model id as a free
string, so nothing blocks it client-side. First run logs the raw response; if the
gateway rejects the model, the ask for the platform team is: *allowlist the Lyria 3
model ids on the existing Gemini generateContent route.*

## Notes

- **Stick to the Clip model**: Lyria 3 Pro generates multi-minute MP3s (~5MB+) that
  would exceed the 4MB limit again. Clip is fixed at 30 seconds.
- **Lyrics for free**: Lyria 3 returns lyrics/structure as text parts alongside the
  audio; `MusicGenerator` logs them — they could be surfaced in the UI later.
- **Persistence**: tracks accumulate in the bucket as `music/track_<timestamp>.mp3`
  plus a `track_<timestamp>.wav` written by the edge function (~5–6MB per 30s clip —
  the WAV is what the lens actually plays). A signed URL expiring only invalidates
  the link, never the file.
- **Fallback**: untoggle **Use Snap Cloud** to use the original inline `lyria-002`
  path once the platform raises the RemoteApi message limit.

## Optional: track library table

To make saved tracks browsable (prompt, path, date):

```sql
create table public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  prompt text not null,
  storage_path text not null
);
alter table public.music_tracks enable row level security;
create policy "authenticated can insert" on public.music_tracks
  for insert to authenticated with check (true);
create policy "authenticated can read" on public.music_tracks
  for select to authenticated using (true);
```

Then after a successful upload in `MusicGenerator.generateViaSnapCloud`:

```ts
await supabase.from("music_tracks").insert({prompt: prompt, storage_path: path})
```
