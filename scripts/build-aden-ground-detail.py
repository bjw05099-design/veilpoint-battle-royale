"""Generate seamless native terrain surface art in a 2.56 metre render tile."""

import argparse
import math
import random
import struct
import zlib
from pathlib import Path

SIZE = 256
OUTPUTS = ("T_AdenGroundNormal", "T_AdenGroundRoughness", "T_AdenGroundColorVariation")


def png(rows, color_type):
    def chunk(name, content):
        crc = zlib.crc32(name + content)
        return struct.pack(">I", len(content)) + name + content + struct.pack(">I", crc)

    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, color_type, 0, 0, 0)
    data = zlib.compress(b"".join(b"\x00" + row for row in rows), 9)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", data) + chunk(b"IEND", b"")


def field():
    rng = random.Random(272311)
    heights = [0.0] * (SIZE * SIZE)
    for lattice, weight in ((8, 0.48), (16, 0.30), (32, 0.16), (64, 0.09)):
        points = [[rng.uniform(-1.0, 1.0) for _ in range(lattice)] for _ in range(lattice)]
        step = SIZE // lattice
        blend = [(i / step) ** 2 * (3 - 2 * i / step) for i in range(step)]
        for y in range(SIZE):
            j, v = divmod(y, step)
            row, below = points[j], points[(j + 1) % lattice]
            for x in range(SIZE):
                i, u = divmod(x, step)
                right = (i + 1) % lattice
                a = row[i] + (row[right] - row[i]) * blend[u]
                b = below[i] + (below[right] - below[i]) * blend[u]
                heights[y * SIZE + x] += (a + (b - a) * blend[v]) * weight
    return heights


def create(output):
    output.mkdir(parents=True, exist_ok=True)
    heights = field()

    def at(x, y):
        return heights[(y % SIZE) * SIZE + (x % SIZE)]

    normals, roughness, colors = [], [], []
    for y in range(SIZE):
        nrow, rrow, crow = bytearray(), bytearray(), bytearray()
        for x in range(SIZE):
            dx, dy = (at(x + 1, y) - at(x - 1, y)) * 1.8, (at(x, y + 1) - at(x, y - 1)) * 1.8
            length = math.sqrt(1.0 + dx * dx + dy * dy)
            nrow.extend(round(127.5 * (1 + value / length)) for value in (-dx, -dy, 1.0))
            height = at(x, y)
            rrow.append(round(255 * max(.76, min(.99, .88 + .13 * height))))
            crow.append(round(255 * max(0., min(1., .5 + .56 * height))))
        normals.append(nrow)
        roughness.append(rrow)
        colors.append(crow)
    paths = [output / (name + ".png") for name in OUTPUTS]
    paths[0].write_bytes(png(normals, 2))
    paths[1].write_bytes(png(roughness, 0))
    paths[2].write_bytes(png(colors, 0))
    return paths


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    for path in create(parser.parse_args().output):
        print(path)
