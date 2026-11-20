"""Embed the registered GLO-30 regional relief used by the Unreal atlas."""

import argparse
import base64
import struct
import zlib
from pathlib import Path

from aden_source_geometry import build


def render(source, header):
    data = build(source)
    region = data["region"]
    dimensions = tuple(region[key] for key in ("x", "z", "spacing", "columns", "rows"))
    if dimensions != (-26624, -21504, 256, 161, 141):
        raise ValueError("Regional raster does not match the Unreal atlas")
    heights = [round(metres * 10) for metres in region["elevations"]]
    if len(heights) != 161 * 141:
        raise ValueError("Incomplete regional terrain")
    payload = struct.pack(f"<{len(heights)}h", *heights)
    encoded = base64.b64encode(zlib.compress(payload, 9)).decode("ascii")
    lines = [
        "// Generated from the pinned GLO-30 source by scripts/build-native-aden-region.py.",
        "#pragma once",
        "namespace VPAdenRegionalData {",
        f'inline constexpr char PilotRevision[] = "{data["revision"]}";',
        "inline constexpr const char* Chunks[] = {",
    ]
    lines += ['    "' + encoded[i:i + 120] + '",' for i in range(0, len(encoded), 120)]
    header.write_text("\n".join([*lines, "};", "}", ""]), encoding="ascii", newline="\n")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("source", type=Path)
    cli.add_argument("header", type=Path)
    args = cli.parse_args()
    render(args.source, args.header)
