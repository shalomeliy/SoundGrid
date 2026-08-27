/** Downsample an AudioBuffer to interleaved [min, max] pairs, `buckets` long. */
export function computePeaks(buffer: AudioBuffer, buckets = 2000): Float32Array {
  const chan = buffer.numberOfChannels > 1
    ? mixToMono(buffer)
    : buffer.getChannelData(0)
  const out = new Float32Array(buckets * 2)
  const step = chan.length / buckets
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * step)
    const end = Math.min(chan.length, Math.floor((i + 1) * step))
    let min = 1
    let max = -1
    for (let j = start; j < end; j++) {
      const v = chan[j]
      if (v < min) min = v
      if (v > max) max = v
    }
    out[i * 2] = min
    out[i * 2 + 1] = max
  }
  return out
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length
  const out = new Float32Array(len)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) out[i] += data[i]
  }
  const inv = 1 / buffer.numberOfChannels
  for (let i = 0; i < len; i++) out[i] *= inv
  return out
}

/**
 * Rough BPM estimate. Filters to the low end, builds an onset envelope, then
 * scores candidate tempos by autocorrelation of the envelope. Good enough to
 * seed a beatgrid; the user can nudge it.
 */
export function detectBpm(buffer: AudioBuffer, min = 80, max = 180): number | null {
  const sr = buffer.sampleRate
  const mono = buffer.numberOfChannels > 1 ? mixToMono(buffer) : buffer.getChannelData(0)

  // one-pole low-pass ~200Hz to isolate kick energy
  const dt = 1 / sr
  const rc = 1 / (2 * Math.PI * 200)
  const alpha = dt / (rc + dt)
  let lp = 0
  const env: number[] = []
  const frame = Math.floor(sr / 200) // 5ms envelope frames
  let acc = 0
  let n = 0
  for (let i = 0; i < mono.length; i++) {
    lp += alpha * (mono[i] - lp)
    acc += lp * lp
    if (++n === frame) {
      env.push(Math.sqrt(acc / frame))
      acc = 0
      n = 0
    }
  }
  if (env.length < 64) return null

  // difference envelope (onsets only)
  const onsets = new Float32Array(env.length)
  for (let i = 1; i < env.length; i++) {
    const d = env[i] - env[i - 1]
    onsets[i] = d > 0 ? d : 0
  }

  const framesPerSec = 200
  let bestBpm = 0
  let bestScore = -Infinity
  for (let bpm = min; bpm <= max; bpm += 0.5) {
    const lag = Math.round((60 / bpm) * framesPerSec)
    let score = 0
    for (let i = lag; i < onsets.length; i++) {
      score += onsets[i] * onsets[i - lag]
    }
    score /= onsets.length - lag
    if (score > bestScore) {
      bestScore = score
      bestBpm = bpm
    }
  }
  return bestBpm ? Math.round(bestBpm * 10) / 10 : null
}
