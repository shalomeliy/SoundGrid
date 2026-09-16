"""
GridFix pilot script — real-runtime measurement on real problematic tracks.

Not application code. This lives outside src/ on purpose: it is throwaway
measurement infrastructure for the "real pilot before locking UX" step in
workshop-output/FEATURE_SPEC_GRIDFIX.md, not part of SoundGrid itself.

For each input file, independently (per the approved "two separate tools"
decision — timing-fix and noise-clean never run combined):
  1. Loads the file, detects tempo/beat consistency (a librosa-based proxy
     for confidence — NOT core/beatgrid.ts's actual algorithm, which is
     TypeScript and does phase+BPM together; this pilot approximates it to
     get real numbers without porting that logic to Python).
  2. Timing fix: stretches the whole file to the nearest integer BPM
     (global rate change — this measures the simple case; it does not
     attempt to fix internal variable-tempo drift within one track).
  3. Noise clean: runs noisereduce (non-stationary spectral gating) on an
     unmodified copy.
  4. Writes both outputs to a parallel corrected/ subfolder next to the
     source file (matches the approved file-placement decision), never
     touching the original.
  5. Times every step and re-measures the timing result's tempo/confidence
     to see whether the correction actually landed.

Usage:
    python pilot.py "<path to wav>" ["<path to wav>" ...]

Writes workshop-output/gridfix-pilot/results.json next to this script.
"""

import json
import os
import sys
import time

import librosa
import noisereduce as nr
import numpy as np
import soundfile as sf


def beat_confidence_proxy(mono, sr):
    tempo, beat_frames = librosa.beat.beat_track(y=mono, sr=sr, units="frames")
    tempo = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    if len(beat_times) < 3:
        return tempo, 0.0, len(beat_times)
    ibi = np.diff(beat_times)
    cv = float(np.std(ibi) / np.mean(ibi)) if np.mean(ibi) > 0 else 1.0
    confidence = max(0.0, 1.0 - cv)
    return tempo, confidence, len(beat_times)


# Noise-clean confidence gate (architecture decision, 16/09 — mirrors
# core/beatgrid.ts's `confident` for timing, which this pilot has no
# equivalent for yet). Provisional, like beatgrid.ts's own CONFIDENCE_RATIO
# — recalibrate against the next real pilot run on an actually-noisy file;
# the two clean studio tracks tested so far can only prove the "nothing to
# clean" half of this gate.
NOISE_FLOOR_REDUCTION_MIN_DB = 3.0  # below this: nothing meaningful found/removed
NOISE_FLOOR_REDUCTION_MAX_DB = 20.0  # above this: likely over-subtraction ("musical noise"), not a clean win


def noise_floor_db(mono):
    """10th-percentile short-time RMS, in dB — a noise-floor proxy. `None`
    on a clip too short for a stable percentile, so the caller can fall back
    to `confident: False` instead of trusting a near-meaningless number."""
    rms = librosa.feature.rms(y=mono, frame_length=2048, hop_length=512)[0]
    if len(rms) < 50:
        return None
    rms_db = 20 * np.log10(rms + 1e-10)
    return float(np.percentile(rms_db, 10))


def to_mono(y):
    return librosa.to_mono(y) if y.ndim > 1 else y


def write_stereo(path, y, sr, subtype):
    # soundfile wants (frames, channels); librosa gives (channels, frames)
    data = y.T if y.ndim > 1 else y
    sf.write(path, data, sr, subtype=subtype)


def process_timing(path, out_dir, name, y, sr, subtype):
    t0 = time.time()
    mono = to_mono(y)
    tempo_before, conf_before, nbeats_before = beat_confidence_proxy(mono, sr)
    t_detect = time.time() - t0

    target_bpm = round(tempo_before)
    rate = target_bpm / tempo_before if tempo_before > 0 else 1.0

    t1 = time.time()
    if y.ndim > 1:
        stretched = np.stack(
            [librosa.effects.time_stretch(ch, rate=rate) for ch in y], axis=0
        )
    else:
        stretched = librosa.effects.time_stretch(y, rate=rate)
    t_stretch = time.time() - t1

    out_path = os.path.join(out_dir, f"{name} - timing_fixed.wav")
    t2 = time.time()
    write_stereo(out_path, stretched, sr, subtype)
    t_write = time.time() - t2

    mono_after = to_mono(stretched)
    tempo_after, conf_after, nbeats_after = beat_confidence_proxy(mono_after, sr)

    return {
        "tool": "timing_fix",
        "output_file": out_path,
        "tempo_before_bpm": round(tempo_before, 2),
        "target_bpm": target_bpm,
        "tempo_after_bpm": round(tempo_after, 2),
        "bpm_error_before": round(abs(tempo_before - target_bpm), 3),
        "bpm_error_after": round(abs(tempo_after - target_bpm), 3),
        "confidence_proxy_before": round(conf_before, 3),
        "confidence_proxy_after": round(conf_after, 3),
        "beats_detected_before": nbeats_before,
        "beats_detected_after": nbeats_after,
        "seconds_detect": round(t_detect, 2),
        "seconds_stretch": round(t_stretch, 2),
        "seconds_write": round(t_write, 2),
        "seconds_total": round(t_detect + t_stretch + t_write, 2),
    }


def process_noise(path, out_dir, name, y, sr, subtype):
    mono_before = to_mono(y)

    t0 = time.time()
    if y.ndim > 1:
        cleaned = np.stack(
            [nr.reduce_noise(y=ch, sr=sr, stationary=False) for ch in y], axis=0
        )
    else:
        cleaned = nr.reduce_noise(y=y, sr=sr, stationary=False)
    t_clean = time.time() - t0

    out_path = os.path.join(out_dir, f"{name} - noise_cleaned.wav")
    t1 = time.time()
    write_stereo(out_path, cleaned, sr, subtype)
    t_write = time.time() - t1

    floor_before = noise_floor_db(mono_before)
    floor_after = noise_floor_db(to_mono(cleaned))
    if floor_before is None or floor_after is None:
        reduction_db = None
        confident = False
    else:
        reduction_db = floor_before - floor_after
        confident = NOISE_FLOOR_REDUCTION_MIN_DB <= reduction_db <= NOISE_FLOOR_REDUCTION_MAX_DB

    return {
        "tool": "noise_clean",
        "output_file": out_path,
        "noise_floor_before_db": round(floor_before, 1) if floor_before is not None else None,
        "noise_floor_after_db": round(floor_after, 1) if floor_after is not None else None,
        "noise_floor_reduction_db": round(reduction_db, 1) if reduction_db is not None else None,
        "confident": confident,
        "seconds_clean": round(t_clean, 2),
        "seconds_write": round(t_write, 2),
        "seconds_total": round(t_clean + t_write, 2),
    }


def main(paths):
    results = []
    for path in paths:
        print(f"\n=== {path} ===", flush=True)
        if not os.path.isfile(path):
            print("  FAILED: file not found")
            results.append({"input_file": path, "status": "failed", "reason": "not found"})
            continue

        info = sf.info(path)
        name = os.path.splitext(os.path.basename(path))[0]
        out_dir = os.path.join(os.path.dirname(path), "corrected")
        os.makedirs(out_dir, exist_ok=True)

        t_load0 = time.time()
        try:
            y, sr = librosa.load(path, sr=None, mono=False)
        except Exception as e:
            print(f"  FAILED to load: {e}")
            results.append({"input_file": path, "status": "failed", "reason": str(e)})
            continue
        t_load = time.time() - t_load0

        entry = {
            "input_file": path,
            "status": "ok",
            "duration_sec": round(info.duration, 1),
            "sample_rate": info.samplerate,
            "channels": info.channels,
            "seconds_load": round(t_load, 2),
        }

        try:
            print("  running timing fix...", flush=True)
            entry["timing_fix"] = process_timing(path, out_dir, name, y, sr, info.subtype)
            print(
                f"    {entry['timing_fix']['tempo_before_bpm']} -> "
                f"{entry['timing_fix']['tempo_after_bpm']} BPM "
                f"({entry['timing_fix']['seconds_total']}s)"
            )
        except Exception as e:
            entry["timing_fix"] = {"status": "failed", "reason": str(e)}
            print(f"    FAILED: {e}")

        try:
            print("  running noise clean...", flush=True)
            entry["noise_clean"] = process_noise(path, out_dir, name, y, sr, info.subtype)
            print(f"    done ({entry['noise_clean']['seconds_total']}s)")
        except Exception as e:
            entry["noise_clean"] = {"status": "failed", "reason": str(e)}
            print(f"    FAILED: {e}")

        results.append(entry)

    out_json = os.path.join(os.path.dirname(__file__), "results.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {out_json}")


if __name__ == "__main__":
    main(sys.argv[1:])
