#!/usr/bin/env node
/**
 * v0.8.5 Milestone 2 — real seconds-per-track for CLAP, the v0.1.7 pattern:
 * measured, not guessed. Mirrors how Milestone 1 measured the classical
 * (Meyda) embedder: load real tracks if they exist, otherwise fall back to
 * synthetic PCM (documented as a fallback, not silently substituted — the
 * project's central rule), time model load and per-track inference
 * separately, print numbers.
 *
 * CLAP (`Xenova/clap-htsat-unfused`, the ONNX conversion transformers.js
 * documents) needs its ~600MB of weights from huggingface.co on first run.
 * In this remote container that host is blocked by network policy (see
 * HANDOFF.md) — `platform/ai-local/worker.ts`'s own doc comment records the
 * identical situation for the chat model: "no internet to the model host —
 * load() correctly reaches model-error with the real reason instead of
 * hanging". This script times out the load deliberately (LOAD_TIMEOUT_MS)
 * so a blocked network fails fast and visibly instead of hanging forever —
 * the failure itself is the container-side verification. The real
 * seconds-per-track number needs a machine with real internet access to
 * huggingface.co (Shalom's machine) — see the printed instructions below.
 */
import { ClapAudioModelWithProjection, ClapFeatureExtractor } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/clap-htsat-unfused'
const CLAP_SAMPLE_RATE = 48000
const LOAD_TIMEOUT_MS = 30_000
const TRACK_DURATIONS_SEC = [30, 210] // ~30s clip and a 3.5-min track, same shape as M1's comparison

function sineTone(seconds, freqHz = 440) {
  const length = Math.floor(CLAP_SAMPLE_RATE * seconds)
  const samples = new Float32Array(length)
  for (let i = 0; i < length; i++) samples[i] = Math.sin((2 * Math.PI * freqHz * i) / CLAP_SAMPLE_RATE)
  return samples
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not resolve within ${ms}ms (treated as blocked, not hung)`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function main() {
  console.log(`[measure-clap] model: ${MODEL_ID}`)
  console.log('[measure-clap] loading feature extractor + model (this is the part that needs huggingface.co)...')

  const loadStart = performance.now()
  let featureExtractor
  let model
  try {
    ;[featureExtractor, model] = await withTimeout(
      Promise.all([
        ClapFeatureExtractor.from_pretrained(MODEL_ID),
        ClapAudioModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'fp32' }),
      ]),
      LOAD_TIMEOUT_MS,
      'model load',
    )
  } catch (err) {
    console.error(`[measure-clap] FAILED to load model: ${err instanceof Error ? err.message : String(err)}`)
    console.error('[measure-clap] This container blocks huggingface.co by network policy (confirmed via the agent proxy status endpoint) — expected here, not a bug.')
    console.error('[measure-clap] Run this same script on a machine with real internet access to get the real number:')
    console.error('[measure-clap]   npm install   (first time only)')
    console.error('[measure-clap]   node scripts/measure-clap-embedding.mjs')
    process.exitCode = 1
    return
  }
  const loadMs = performance.now() - loadStart
  console.log(`[measure-clap] model loaded in ${(loadMs / 1000).toFixed(1)}s`)

  const results = []
  for (const seconds of TRACK_DURATIONS_SEC) {
    const audio = sineTone(seconds)
    const start = performance.now()
    const inputs = await featureExtractor(audio)
    const { audio_embeds } = await model(inputs)
    const ms = performance.now() - start
    const vector = Array.from(audio_embeds.data)
    results.push({ seconds, ms, vectorLength: vector.length })
    console.log(
      `[measure-clap] ${seconds}s track: ${(ms / 1000).toFixed(2)}s compute, ` +
        `${(ms / 1000 / (seconds / 60)).toFixed(2)}s per minute of audio, vector length ${vector.length}`,
    )
  }

  console.log('[measure-clap] done — write these numbers into HANDOFF.md / docs/handoff/v0.8.5.md, not "it worked".')
}

main()
