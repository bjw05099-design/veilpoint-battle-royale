"""Generate seamless soil and rock surfaces in 2.56 metre render tiles."""

import argparse
import math
import random
import struct
import zlib
from pathlib import Path

SIZE = 256
SOIL = ("T_AdenGroundNormal", "T_AdenGroundRoughness", "T_AdenGroundColorVariation")
ROCK = ("T_AdenRockNormal", "T_AdenRockRoughness", "T_AdenRockColorVariation")


def png(rows, color_type):
    def chunk(name, content):
        crc = zlib.crc32(name + content)
        return struct.pack(">I", len(content)) + name + content + struct.pack(">I", crc)

    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, color_type, 0, 0, 0)
    data = zlib.compress(b"".join(b"\x00" + row for row in rows), 9)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", data) + chunk(b"IEND", b"")


def field(seed, bands):
    rng = random.Random(seed)
    heights = [0.0] * (SIZE * SIZE)
    for lattice, weight in bands:
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


def write_surface(output, names, heights, relief, rough_base, rough_scale, min_rough, tint_scale):
    def at(x, y):
        return heights[(y % SIZE) * SIZE + (x % SIZE)]

    normals, roughness, colors = [], [], []
    for y in range(SIZE):
        nrow, rrow, crow = bytearray(), bytearray(), bytearray()
        for x in range(SIZE):
            dx = (at(x + 1, y) - at(x - 1, y)) * relief
            dy = (at(x, y + 1) - at(x, y - 1)) * relief
            length = math.sqrt(1.0 + dx * dx + dy * dy)
            nrow.extend(round(127.5 * (1 + value / length)) for value in (-dx, -dy, 1.0))
            height = at(x, y)
            rrow.append(round(255 * max(min_rough, min(.99, rough_base + rough_scale * height))))
            crow.append(round(255 * max(0., min(1., .5 + tint_scale * height))))
        normals.append(nrow)
        roughness.append(rrow)
        colors.append(crow)
    paths = [output / (name + ".png") for name in names]
    paths[0].write_bytes(png(normals, 2))
    paths[1].write_bytes(png(roughness, 0))
    paths[2].write_bytes(png(colors, 0))
    return paths


def create(output):
    output.mkdir(parents=True, exist_ok=True)
    soil = field(272311, ((8, .48), (16, .30), (32, .16), (64, .09)))
    rock = field(814907, ((4, .60), (16, .24), (32, .16), (64, .12)))
    joints = field(317117, ((8, .75), (16, .18)))
    # Fold the broad field into shallow creases, while retaining finer grains.
    rock = [height * .64 + (.28 - abs(joint)) * .72 for height, joint in zip(rock, joints, strict=True)]
    return (write_surface(output, SOIL, soil, 1.8, .88, .13, .76, .56)
            + write_surface(output, ROCK, rock, 4.4, .77, .24, .58, .82))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    for path in create(parser.parse_args().output):
        print(path)
