/**
 * Specs Inc. 2026
 * Snap Cloud Edge Function: transcode an MP3 in Storage to WAV, next to the original.
 *
 * Why: Lyria 3 only returns MP3 (audio/mpeg — the generateContent endpoint rejects any
 * audio format request), and SnapOS on device cannot decode MP3: the track "plays" but
 * pushes zero samples into the audio graph (silent). The device does play WAV through
 * the same RemoteMediaModule path, so the lens uploads the MP3 it got from Lyria, calls
 * this function, and plays back the WAV this function writes.
 *
 * Request:  POST { "bucket": "generated-music", "path": "music/track_123.mp3" }
 * Response: 200  { "wavPath": "music/track_123.wav", "sampleRate": 44100, "seconds": 30.1 }
 *           4xx/5xx { "error": "..." }
 *
 * Deploy (Supabase CLI against the Snap Cloud project):
 *   supabase functions deploy transcode-to-wav
 * or paste this file into the dashboard: Edge Functions -> New function.
 */
import {createClient} from "jsr:@supabase/supabase-js@2"
import {MPEGDecoder} from "npm:mpg123-decoder@1.0.3"

function buildWav(channelData: Float32Array[], sampleRate: number): Uint8Array {
  const channels = channelData.length
  const numFrames = channelData[0].length
  const dataSize = numFrames * channels * 2
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[offset + i] = s.charCodeAt(i)
  }
  writeStr(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true) // byte rate
  view.setUint16(32, channels * 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, "data")
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, channelData[c][i]))
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      offset += 2
    }
  }
  return bytes
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {"Content-Type": "application/json"}
  })
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, {error: "POST only"})
  }
  let bucket: string, path: string
  try {
    ;({bucket, path} = await req.json())
    if (!bucket || !path) throw new Error("bucket and path are required")
    if (!path.endsWith(".mp3")) throw new Error("path must point to an .mp3")
  } catch (e) {
    return json(400, {error: `Bad request: ${e instanceof Error ? e.message : e}`})
  }

  // Service role: the function must read/write storage regardless of bucket policies
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const {data: mp3Blob, error: downloadError} = await supabase.storage.from(bucket).download(path)
  if (downloadError) {
    return json(404, {error: `Download failed: ${downloadError.message}`})
  }
  const mp3 = new Uint8Array(await mp3Blob.arrayBuffer())

  const decoder = new MPEGDecoder()
  await decoder.ready
  const {channelData, sampleRate, errors} = decoder.decode(mp3)
  decoder.free()
  if (!channelData || !channelData.length || !channelData[0].length) {
    return json(422, {error: `MP3 decode produced no audio (${JSON.stringify(errors || [])})`})
  }

  const wav = buildWav(channelData, sampleRate)
  const wavPath = path.replace(/\.mp3$/, ".wav")
  const {error: uploadError} = await supabase.storage
    .from(bucket)
    .upload(wavPath, wav, {contentType: "audio/wav", upsert: true})
  if (uploadError) {
    return json(500, {error: `WAV upload failed: ${uploadError.message}`})
  }

  return json(200, {
    wavPath,
    sampleRate,
    seconds: Math.round((channelData[0].length / sampleRate) * 10) / 10
  })
})
