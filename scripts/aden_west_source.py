"""Extract the native Aden west terrain from the registered projected GLO-30 raster."""

import argparse
import base64
import hashlib
import json
import zlib
from pathlib import Path

import numpy as np
from PIL import Image


def read_west(source):
    manifest = json.loads((source / "ADEN_SOURCE.json").read_bytes())
    if (manifest["horizontalCRS"], manifest["verticalDatum"], manifest["sampleSpacingMetres"],
            manifest["gameZeroUTMMetres"], manifest["vertexExtentUTMMetres"], manifest["packTileWindow"]) != (
            "EPSG:32638", "EGM2008", 32, [500000, 1413120], [473376, 1398784, 514336, 1434624], [3, -3, 7, 7]):
        raise ValueError("Aden west footprint differs from the registered grid")
    raster = source / "aden-public-surface.tif"
    pilot = source / "aden-pilot-heightfield.json"
    for path in (raster, pilot):
        if hashlib.sha256(path.read_bytes()).hexdigest() != manifest["sha256"][path.name]:
            raise ValueError(f"Unverified west terrain input: {path.name}")
    with Image.open(raster) as image:
        if image.size != (1281, 1121) or image.mode != "F":
            raise ValueError("Incorrect Aden raster dimensions or elevation format")
        # Columns 832–880 are X 0–1536m. Row 624 is Y -1536m.
        samples = np.asarray(image)[624:737, 832:881].astype(np.float64)
    if not np.isfinite(samples).all():
        raise ValueError("Missing west elevation")
    cm = np.rint(samples * 100).astype("<i4")
    edge = np.full(113, np.nan)
    for tile in json.loads(pilot.read_bytes())["tiles"]:
        if tile["tx"] == 3:
            row = (tile["tz"] + 3) * 16
            edge[row:row + 17] = np.asarray(tile["samples"])[::17]
    if not np.array_equal(np.rint(edge * 100), cm[:, -1]):
        raise ValueError("Aden west and registered pilot do not share exact seam heights")
    return cm


def write_header(source, header):
    heights = read_west(source)
    body = np.ascontiguousarray(heights[:, :-1]).tobytes()
    encoded = base64.b64encode(zlib.compress(body, 9)).decode("ascii")
    lines = [
        "// Generated from the registered GLO-30 raster by scripts/aden_west_source.py.",
        "#pragma once",
        "namespace VPAdenWestData {",
        "inline constexpr int Columns = 48;",
        "inline constexpr int Rows = 113;",
        "inline constexpr const char* Chunks[] = {",
    ]
    lines.extend(f'    "{encoded[i:i + 120]}",' for i in range(0, len(encoded), 120))
    header.write_text("\n".join([*lines, "};", "}", ""]), encoding="ascii", newline="\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("header", type=Path)
    args = parser.parse_args()
    write_header(args.source, args.header)
