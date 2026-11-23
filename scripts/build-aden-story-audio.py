"""Create original illustrative sounds for Unreal's Aden development level."""

import math
import random
import struct
import wave
from pathlib import Path

RATE = 24000


def create(destination: Path):
    destination.mkdir(parents=True, exist_ok=True)
    # Integer Fourier periods make the loop continuous at its boundary.
    rng = random.Random(7051)
    harmonics = [(rng.randint(5, 260), rng.uniform(0, math.tau), rng.uniform(.1, 1)) for _ in range(32)]
    wind = []
    for i in range(6 * RATE):
        t = i / (6 * RATE)
        gust = .62 + .22 * math.cos(math.tau * t) + .14 * math.sin(math.tau * 3 * t + .61)
        wind.append(gust * sum(amplitude * math.sin(math.tau * band * t + phase)
                              for band, phase, amplitude in harmonics) * .012)
    write(destination / "SW_AdenStreetWind.wav", wind)

    for index in range(3):
        rng = random.Random(5200 + index)
        foot = []
        low = 0.
        for i in range(int(RATE * .31)):
            t = i / RATE
            white = rng.uniform(-1., 1.)
            low = .82 * low + .18 * white
            contact = min(1., t * 280.) * math.exp(-t * (29. + index * 3.))
            grain = min(1., t * 60.) * math.exp(-t * 15.)
            thump = math.sin(math.tau * (58. + index * 7.) * t) * .28
            foot.append(contact * (thump + low * .48) + (white - low) * .12 * grain)
        write(destination / f"SW_AdenFoot{index + 1}.wav", foot)

    chime = []
    for i in range(int(RATE * .32)):
        t = i / RATE
        env = min(1., t * 170.) * math.exp(-t * 11.)
        chime.append(env * (.17 * math.sin(math.tau * 590. * t) + .045 * math.sin(math.tau * 885. * t)))
    write(destination / "SW_AdenDossierCue.wav", chime)


def create_prologue_beds(destination: Path):
    """Create the opening's original atmosphere and timed practical cues."""
    destination.mkdir(parents=True, exist_ok=True)
    # Each peak is a cinematic sound cue. The two street pulses and the
    # change of broadcast speaker line up with the motion in the camera rig.
    scenes = [
        ("Port", 9, 52, .08, .075, []),
        ("News", 13, 60, .04, .045, [(6.35, .12, 180)]),
        ("Fighting", 13, 49, .09, .045, [(3.15, .48, 52), (5.35, .40, 66), (8.3, .17, 58)]),
        ("Blackout", 10, 47, .038, .028, [(1.75, .17, 92)]),
        ("Voyage", 12, 41, .12, .094, []),
        ("Landfall", 11, 42, .092, .069, [(5.1, .11, 122), (8.5, .15, 78), (9.7, .18, 98)]),
        ("Street", 6, 71, .062, .108, [(2.35, .11, 104)]),
    ]
    for index, (name, length, mode, wind, hum, events) in enumerate(scenes):
        rng = random.Random(2607 + index)
        samples = []
        low = 0.
        for frame in range(length * RATE):
            time = frame / RATE
            white = rng.uniform(-1., 1.)
            low = .981 * low + .019 * white
            drift = .25 + .75 * math.sin(time * .71 + .9)**2
            motor = math.sin(math.tau * (mode * time + .15 * math.sin(time * 1.1)))
            motor += .32 * math.sin(math.tau * mode * 2 * time)
            gain = min(1., time * 4., (length - time) * 2.)
            if name in {"Landfall", "Street"}:
                motor *= max(.035, 1. - time / length)
            bed = wind * (low * 4.9 + white * .07) * drift + hum * motor * drift
            for start, strength, tone in events:
                dt = time - start
                if 0 <= dt < 1.0:
                    edge = min(1., dt * 130.) * math.exp(-dt * 9.)
                    bed += strength * edge * (math.sin(math.tau * tone * dt) * .68 + low * 1.7 + white * .13)
            samples.append(gain * bed)
        write(destination / f"SW_AdenOpening{name}.wav", samples)
    return [f"SW_AdenOpening{name}" for name, *_ in scenes]


def write(target, samples):
    payload = b"".join(struct.pack("<h", round(32767 * max(-1., min(1., value)))) for value in samples)
    with wave.open(str(target), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(RATE)
        stream.writeframes(payload)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    create(parser.parse_args().destination)
