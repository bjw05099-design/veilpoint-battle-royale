"""Bake the attributed Aden pilot into classic-script data for offline play."""

import argparse
import hashlib
import json
from pathlib import Path

import rasterio
from rasterio.warp import transform


def verified_json(directory, name, expected):
    data = (directory / name).read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Unverified source: {name}")
    return json.loads(data)


def build(directory):
    manifest = json.loads((directory / "ADEN_SOURCE.json").read_bytes())
    if (manifest.get("schema") != "veilpoint-aden-glo30-source-v1"
            or manifest.get("horizontalCRS") != "EPSG:32638"
            or manifest.get("verticalDatum") != "EGM2008"
            or manifest.get("metresPerWorldUnit") != 1):
        raise ValueError("Unexpected Aden coordinate reference or unit")
    vector = manifest["civilianVectorPilot"]
    height = verified_json(directory, "aden-pilot-heightfield.json",
                           manifest["sha256"]["aden-pilot-heightfield.json"])
    source = verified_json(directory, "aden-civilian-pilot.geojson", vector["sha256"])
    if source["licenseURL"] != "https://opendatacommons.org/licenses/odbl/1-0/":
        raise ValueError("Missing ODbL terms")
    ox, on = manifest["gameZeroUTMMetres"]
    left, bottom, right, top = manifest["packExtentUTMMetres"]
    surface = directory / "aden-public-surface.tif"
    if hashlib.sha256(surface.read_bytes()).hexdigest() != manifest["sha256"][surface.name]:
        raise ValueError("Unverified regional elevation raster")
    with rasterio.open(surface) as raster:
        if raster.crs.to_epsg() != 32638 or raster.res != (32, 32):
            raise ValueError("Unexpected regional elevation projection or spacing")
        stride = 8
        if (raster.width - 1) % stride or (raster.height - 1) % stride:
            raise ValueError("Regional extent must align to the source overview grid")
        elevations = raster.read(1)[::stride, ::stride]
        west, north_edge = raster.xy(0, 0)
        region = dict(x=west - ox, z=on - north_edge, spacing=32 * stride,
                      columns=elevations.shape[1], rows=elevations.shape[0],
                      elevations=[round(float(y), 1) for y in elevations.flat])
    roads, footprints = [], []
    for feature in source["features"]:
        geometry = feature["geometry"]
        kind = feature["properties"]["layer"]
        if geometry["type"] == "LineString" and kind == "street":
            points = geometry["coordinates"]
        elif geometry["type"] == "Polygon" and kind == "building" and len(geometry["coordinates"]) == 1:
            points = geometry["coordinates"][0]
            if points[0] != points[-1]:
                raise ValueError("Open footprint ring")
            points = points[:-1]
        else:
            raise ValueError("Unexpected civilian geometry")
        lon, lat = zip(*points)
        east, north = transform("EPSG:4326", "EPSG:32638", lon, lat)
        projected = []
        for x, y in zip(east, north):
            if not (left <= x <= right and bottom <= y <= top):
                raise ValueError("Civilian feature outside the terrain pack")
            point = [round((x - ox) * 100), round((on - y) * 100)]
            if not projected or projected[-1] != point:
                projected.append(point)
        if len(projected) < (3 if kind == "building" else 2):
            raise ValueError("Collapsed projected feature")
        if kind == "building":
            footprints.append(projected)
        else:
            roads.append(projected)
    if (len(roads), len(footprints)) != (vector["streetSegments"], vector["buildingFootprints"]):
        raise ValueError("Civilian layer count differs from the verified source")
    # Identity covers terrain geometry, vectors and their coordinate system.
    # Retrieval dates are metadata and do not invalidate a player's save.
    identity = json.dumps([manifest["gameZeroUTMMetres"], roads, footprints,
                           [[t["tx"], t["tz"], t["gridSize"], t["samples"]] for t in height["tiles"]]],
                          separators=(",", ":")).encode()
    return dict(version=1, revision=hashlib.sha256(identity).hexdigest(), terrain=height, region=region,
                roadsCm=roads, footprintsCm=footprints, acquiredDate=vector["acquiredDate"],
                terrainAttribution=manifest["attribution"], vectorAttribution=source["attribution"])


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
