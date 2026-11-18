"""Historical offline preview data writer."""

import argparse
import json
from pathlib import Path

from aden_source_geometry import build


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = build(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as stream:
        stream.write("globalThis.VeilpointAdenPlayableData = ")
        json.dump(data, stream, ensure_ascii=True, separators=(",", ":"))
        stream.write(";\n")
