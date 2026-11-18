"""Bake the registered Aden source into the Unreal runtime's read-only payload."""

import argparse
import base64
import math
import struct
import zlib
from pathlib import Path

from aden_source_geometry import build


def distance_to_edge(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length_sq = dx * dx + dy * dy
    t = 0 if not length_sq else max(0, min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length_sq))
    return math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy))


def corridor(data):
    """Choose an existing centreline with 100 cm of building clearance."""
    roads = data["roadsCm"]
    buildings = [(min(x for x, _ in ring), min(y for _, y in ring),
                  max(x for x, _ in ring), max(y for _, y in ring), ring)
                 for ring in data["footprintsCm"]]
    segments = [(math.dist(a, b), a, b) for road in roads for a, b in zip(road, road[1:])]
    for length, a, b in sorted(segments, key=lambda item: -item[0]):
        for offset in range(300, int(length) - 6300, 400):
            def at(distance):
                t = (offset + distance) / length
                return tuple(round(p + (q - p) * t) for p, q in zip(a, b))
            start, finish = at(0), at(6000)
            checks = [ring for x0, y0, x1, y1, ring in buildings
                      if x0 <= max(start[0], finish[0]) + 100 and x1 >= min(start[0], finish[0]) - 100
                      and y0 <= max(start[1], finish[1]) + 100 and y1 >= min(start[1], finish[1]) - 100]
            def clear(point):
                x, y = point
                if not (153700 <= x <= 511900 and -153500 <= y <= 204700):
                    return False
                for ring in checks:
                    inside = False
                    for u, v in zip(ring, ring[1:] + ring[:1]):
                        if distance_to_edge(point, u, v) < 100:
                            return False
                        if (u[1] > y) != (v[1] > y) and x < u[0] + (v[0] - u[0]) * (y - u[1]) / (v[1] - u[1]):
                            inside = not inside
                    if inside:
                        return False
                return True
            if all(clear(at(d)) for d in range(0, 6001, 25)):
                return [at(d) for d in (0, 1500, 3700, 6000)]
    raise ValueError("No physical path on the sourced public centrelines")


def encode(data):
    tiles = {(tile["tx"], tile["tz"]): tile for tile in data["terrain"]["tiles"]}
    # A single seam-checked vertex grid avoids duplicating 32-metre borders.
    grid = {}
    for tz in range(-3, 4):
        for tx in range(3, 10):
            tile = tiles[tx, tz]
            if tile["gridSize"] != 17 or len(tile["samples"]) != 289:
                raise ValueError("Unexpected native terrain source grid")
            for i, height in enumerate(tile["samples"]):
                key = (16 * (tx - 3) + i % 17, 16 * (tz + 3) + i // 17)
                cm = round(height * 100)
                if grid.setdefault(key, cm) != cm:
                    raise ValueError("Discontinuous original terrain tile edge")
    roads, footprints = data["roadsCm"], data["footprintsCm"]
    def geometry(groups):
        for points in groups:
            yield struct.pack("<H", len(points))
            prev_x, prev_y = 153600, -153600
            for x, y in points:
                yield struct.pack("<ii", x - prev_x, y - prev_y)
                prev_x, prev_y = x, y
    blocks = [b"VPA1", bytes.fromhex(data["revision"]), struct.pack("<II", len(roads), len(footprints))]
    blocks += [struct.pack("<ii", *point) for point in corridor(data)]
    # 32-bit centimetres preserve DEM elevations without quantizing at the
    # candidate's high points or requiring an inferred local vertical datum.
    blocks += [struct.pack("<i", grid[x, y]) for y in range(113) for x in range(113)]
    return b"".join([*blocks, *geometry(roads), *geometry(footprints)])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("header", type=Path)
    args = parser.parse_args()
    raw = encode(build(args.source))
    if len(raw) >= 750000:
        raise ValueError("Native data exceeds the reader's allocation limit")
    encoded = base64.b64encode(zlib.compress(raw, 9)).decode("ascii")
    lines = ['// Generated from the pinned public source by scripts/build-native-aden-source.py.',
             '#pragma once', 'namespace VPAdenEmbedded {',
             f'inline constexpr int Size = {len(raw)};',
             'inline constexpr const char* Chunks[] = {']
    lines += ['    "' + encoded[i:i + 120] + '",' for i in range(0, len(encoded), 120)]
    args.header.write_text("\n".join([*lines, '};', '}', '']), encoding='ascii', newline='\n')


if __name__ == "__main__":
    main()
