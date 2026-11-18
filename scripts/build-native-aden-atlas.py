"""Render the pinned public Aden geometry as two Unreal atlas textures."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from aden_source_geometry import build


def relief(samples, width, height, contour_step):
    y, x = np.mgrid[:height, :width]
    px = ((x + .5) * (samples.shape[1] - 1)) / width
    py = ((y + .5) * (samples.shape[0] - 1)) / height
    ix, iy = px.astype(int), py.astype(int)
    u, v = px - ix, py - iy
    a, b = samples[iy, ix], samples[iy, ix + 1]
    c, d = samples[iy + 1, ix], samples[iy + 1, ix + 1]
    value = np.where(u + v <= 1, a + u * (b - a) + v * (c - a),
                     d + (1 - u) * (c - d) + (1 - v) * (b - d))
    gy, gx = np.gradient(value)
    hill = np.clip((gx + gy) * 2.8, -14, 14)
    rows = []
    elevation_bands = [-3., 0.3, 6., 35., 95., 230., 530.]
    color_bands = [(21, 47, 62), (30, 61, 73), (86, 105, 99),
                   (118, 126, 105), (146, 139, 109), (174, 156, 116), (227, 195, 146)]
    contours = (value > contour_step / 2) & (np.abs(value / contour_step - np.rint(value / contour_step))
                                             * contour_step < np.clip((abs(gx) + abs(gy)) * .65, .19, 1.15))
    for channel in range(3):
        color = np.interp(value, elevation_bands, [shade[channel] for shade in color_bands])
        rows.append(np.clip(np.rint(color + hill - contours * 12), 0, 255).astype(np.uint8))
    return Image.fromarray(np.stack(rows, axis=2))


def footprint_texture(data):
    values = np.full((113, 113), np.nan)
    for tile in data["terrain"]["tiles"]:
        x = (tile["tx"] - 3) * 16
        y = (tile["tz"] + 3) * 16
        values[y:y + 17, x:x + 17] = np.asarray(tile["samples"], dtype=float).reshape(17, 17)
    if not np.isfinite(values).all():
        raise ValueError("Incomplete local atlas grid")
    final_size = 768
    image = relief(values, final_size * 2, final_size * 2, 20)
    draw = ImageDraw.Draw(image)
    factor = image.width / 358400
    def uv(points):
        return [(round((x - 153600) * factor), round((y + 153600) * factor)) for x, y in points]
    for ring in data["footprintsCm"]:
        draw.polygon(uv(ring), fill=(72, 64, 55), outline=(132, 113, 85))
    for line in data["roadsCm"]:
        draw.line(uv(line), fill=(106, 82, 53), width=4)
        draw.line(uv(line), fill=(231, 193, 130), width=2)
    return image.resize((final_size, final_size), Image.Resampling.BOX)


def render(source, destination):
    data = build(source)
    region = data["region"]
    if (region["x"], region["z"], region["spacing"], region["columns"], region["rows"]) != (-26624, -21504, 256, 161, 141):
        raise ValueError("Regional atlas extent differs from the Unreal projection")
    destination.mkdir(parents=True, exist_ok=True)
    local = footprint_texture(data)
    broad = relief(np.asarray(region["elevations"], dtype=float).reshape(141, 161), 640, 560, 50)
    layers = [
        ("aden-atlas-local.png", local, [153600, -153600, 512000, 204800]),
        ("aden-atlas-region.png", broad, [-2662400, -2150400, 1433600, 1433600]),
    ]
    proof = {"schema": "veilpoint-native-aden-atlas-v1", "revision": data["revision"], "layers": {}}
    for name, image, bounds in layers:
        target = destination / name
        image = image.quantize(colors=144, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        image.save(target, compress_level=9)
        proof["layers"][name] = {"size": list(image.size), "boundsCm": bounds,
                                 "pixelSha256": hashlib.sha256(image.convert("RGB").tobytes()).hexdigest(),
                                 "pngSha256": hashlib.sha256(target.read_bytes()).hexdigest()}
    (destination / "aden-atlas.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("source", type=Path)
    cli.add_argument("destination", type=Path)
    args = cli.parse_args()
    render(args.source, args.destination)
