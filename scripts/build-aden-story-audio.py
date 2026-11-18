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
