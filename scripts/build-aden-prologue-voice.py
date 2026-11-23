"""Validate the authored Korean voice takes, or rebuild the offline scratch performance."""

import argparse
import ast
import ctypes
import gzip
import hashlib
import io
import json
import re
import subprocess
import wave
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "Unreal" / "Veilpoint"
SOURCE = PROJECT / "ContentSource" / "AdenOpening"
RUNTIME = PROJECT / "Source" / "Veilpoint"
SCHEMA = "veilpoint-aden-opening-voice-v1"
SAMPLE_RATE = 16000


def cue_plan():
    dialogue = (RUNTIME / "VPAdenPrologueLines.inl").read_text(encoding="utf-8")
    lines = [ast.literal_eval(line.strip()[5:-2]) for line in dialogue.splitlines() if line.strip()]
    table = (RUNTIME / "VPAdenPrologueTimeline.h").read_text(encoding="utf-8").split("Shots[] = {", 1)[1]
    times = re.findall(r"\{\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\}", table.split("};", 1)[0])
    if len(lines) != 4 or len(times) != len(lines):
        raise ValueError("Opening take count and voice windows disagree")
    return [(f"SW_AdenPrologueVO{index}", line, float(timing[2]) - float(timing[1]))
            for index, (line, timing) in enumerate(zip(lines, times), 1)]


def validated_takes():
    manifest = json.loads((SOURCE / "voice.json").read_text(encoding="utf-8"))
    if manifest["schema"] != SCHEMA or len(manifest["takes"]) != len(cue_plan()):
        raise ValueError("Invalid opening voice manifest")
    result = []
    for (name, line, duration), entry in zip(cue_plan(), manifest["takes"]):
        raw = gzip.decompress((SOURCE / (name + ".wav.gz")).read_bytes())
        if entry["asset"] != name or entry["text"] != line or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise ValueError(f"Opening audio or source line has changed for {name}")
        with wave.open(io.BytesIO(raw), "rb") as sound:
            seconds = sound.getnframes() / sound.getframerate()
            if (sound.getframerate(), sound.getnchannels(), sound.getsampwidth()) != (SAMPLE_RATE, 1, 2):
                raise ValueError(f"Unexpected audio format for {name}")
            if not 1.8 < seconds < duration - .15 or abs(entry["seconds"] - seconds) > .001:
                raise ValueError(f"Opening voice does not fit its shot: {name}")
            # Test the take itself so a silent or clipped replacement cannot pass on duration alone.
            pcm = array("h")
            pcm.frombytes(sound.readframes(sound.getnframes()))
            if max(map(abs, pcm)) not in range(4500, 32500) or sum(abs(v) > 350 for v in pcm) < len(pcm) / 4:
                raise ValueError(f"Opening voice is silent, clipped, or incorrectly mastered: {name}")
        result.append((name, raw))
    return result


def synthesize_draft():
    from espeakng_loader import get_data_path, get_library_path

    library = ctypes.CDLL(get_library_path())
    rate = library.espeak_Initialize(2, 0, str(Path(get_data_path()).parent).encode(), 0)
    if rate < 8000 or library.espeak_SetVoiceByName(b"ko+m3") != 0:
        raise RuntimeError("Korean male draft voice could not be initialized")
    for parameter, value in ((1, 168), (2, 91), (3, 43), (4, 29)):
        if library.espeak_SetParameter(parameter, value, 0):
            raise RuntimeError("Draft voice parameter was rejected")
    callback_type = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
    samples = bytearray()

    @callback_type
    def receive(frame, size, events):
        if frame and size > 0:
            samples.extend(ctypes.string_at(frame, size * 2))
        return 0

    library.espeak_SetSynthCallback(receive)
    library.espeak_Synth.argtypes = [
        ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint, ctypes.c_int, ctypes.c_uint,
        ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p
    ]
    takes = []
    SOURCE.mkdir(parents=True, exist_ok=True)
    try:
        for name, line, window in cue_plan():
            samples.clear()
            spoken = ctypes.create_string_buffer(line.replace("\n", " ").encode("utf-8"))
            if library.espeak_Synth(spoken, len(spoken), 0, 1, 0, 1, None, None) != 0:
                raise RuntimeError(f"Could not synthesize {name}")
            pcm = array("h")
            pcm.frombytes(samples)
            audible = [index for index, level in enumerate(pcm) if abs(level) > 220]
            if not audible:
                raise RuntimeError(f"No audible draft for {name}")
            trimmed = pcm[max(0, audible[0] - rate // 20):audible[-1] + rate // 9]
            tempo = max(.79, len(trimmed) / rate / (window - .65))
            if tempo > 1.25:
                raise ValueError(f"Shorten the narration instead of rushing {name}")
            shaped = subprocess.run([
                "ffmpeg", "-v", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0",
                "-af", (f"atempo={tempo:.6f},highpass=f=75,lowpass=f=6800,"
                        "equalizer=f=210:t=q:w=1.3:g=2,acompressor=threshold=.18:ratio=2.5:attack=10:release=105,"
                        "afade=t=in:d=0.03"), "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "pipe:1"
            ], input=trimmed.tobytes(), check=True, stdout=subprocess.PIPE).stdout
            mastered = array("h")
            mastered.frombytes(shaped)
            normal = 23100 / max(map(abs, mastered))
            mastered = array("h", (round(value * normal) for value in mastered))
            target = io.BytesIO()
            with wave.open(target, "wb") as sound:
                sound.setparams((1, 2, SAMPLE_RATE, len(mastered), "NONE", "not compressed"))
                sound.writeframes(mastered.tobytes())
            raw = target.getvalue()
            (SOURCE / (name + ".wav.gz")).write_bytes(gzip.compress(raw, mtime=0))
            takes.append({"asset": name, "text": line, "seconds": round(len(mastered) / SAMPLE_RATE, 6),
                          "sha256": hashlib.sha256(raw).hexdigest()})
    finally:
        library.espeak_Terminate()
    manifest = {"schema": SCHEMA, "performance": "temporary Korean synthetic read",
                "generator": "eSpeak NG ko+m3 / espeakng-loader 0.2.4", "takes": takes}
    (SOURCE / "voice.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--draft", action="store_true")
    if parser.parse_args().draft:
        synthesize_draft()
    print(f"Verified {len(validated_takes())} Korean opening voice takes.")
