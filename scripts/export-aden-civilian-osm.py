"""Extract a bounded, civilian OpenStreetMap geometry source layer."""

import argparse
import hashlib
import json
import math
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

from rasterio.warp import transform


ROAD_TYPES = {"residential", "living_street", "unclassified", "tertiary",
              "tertiary_link", "secondary", "primary", "primary_link"}
BUILDING_TYPES = {"yes", "house", "residential", "apartments", "detached",
                  "terrace", "retail", "commercial"}
ACCESS = {"", "yes", "designated", "permissive", "public"}
COPYRIGHT = "© OpenStreetMap contributors, available under ODbL 1.0"
LICENSE = "https://opendatacommons.org/licenses/odbl/1-0/"


def tags(element):
    return {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}


def outside_scope(values):
    return ("military" in values or "aeroway" in values or "government" in values
            or values.get("landuse") == "military" or values.get("boundary") == "military"
            or values.get("office") == "government"
            or values.get("amenity") in {"police", "prison", "courthouse", "fire_station"}
            or values.get("building") in {"military", "government", "bunker"})


def bounds(points, pad=0):
    x, y = zip(*points)
    return min(x)-pad, min(y)-pad, max(x)+pad, max(y)+pad


def intersects(a, b):
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def square_metres(points):
    x0, y0 = points[0]
    return abs(sum((a-x0)*(d-y0)-(c-x0)*(b-y0)
                   for (a, b), (c, d) in zip(points, points[1:]))) / 2


def export(source, acquired):
    if source.stat().st_size > 25 * 1024 * 1024:
        raise ValueError("Use a bounded public map extract of at most 25 MiB.")
    root = ET.parse(source).getroot()
    region = root.find("bounds")
    if root.tag != "osm" or root.attrib.get("version") != "0.6" or region is None:
        raise ValueError("A bounded OpenStreetMap 0.6 extract is required.")
    box = [float(region.attrib[key]) for key in ("minlon", "minlat", "maxlon", "maxlat")]
    if (not all(math.isfinite(value) for value in box) or
            not (44.75 <= box[0] < box[2] <= 45.2 and 12.6 <= box[1] < box[3] <= 13.0)):
        raise ValueError("The declared bounds must be inside the Aden source window.")
    nodes = {node.attrib["id"]: (float(node.attrib["lon"]), float(node.attrib["lat"]))
             for node in root.findall("node")}
    if not nodes:
        raise ValueError("The extract contains no map nodes.")
    longitudes, latitudes = zip(*nodes.values())
    east, north = transform("EPSG:4326", "EPSG:32638", longitudes, latitudes)
    meters = dict(zip(nodes, zip(east, north)))
    ways = {
        way.attrib["id"]: (tags(way), [node.attrib["ref"] for node in way.findall("nd")])
        for way in root.findall("way")
    }
    omitted = [bounds([meters[ref] for ref in refs if ref in meters], 80)
               for values, refs in ways.values() if outside_scope(values)
               and any(ref in meters for ref in refs)]
    for element in root.findall("relation"):
        if outside_scope(tags(element)):
            points = [meters[ref] for member in element.findall("member")
                      if member.attrib["type"] == "way"
                      for ref in ways.get(member.attrib["ref"], ({}, []))[1] if ref in meters]
            if points:
                omitted.append(bounds(points, 80))
    for element in root.findall("node"):
        if outside_scope(tags(element)):
            omitted.append(bounds([meters[element.attrib["id"]]], 80))

    features = []
    for values, refs in ways.values():
        if (len(refs) < 2 or not all(ref in nodes for ref in refs) or outside_scope(values)
                or any(values.get(key, "") not in ACCESS for key in ("access", "vehicle", "motor_vehicle"))):
            continue
        gps = [nodes[ref] for ref in refs]
        if not all(box[0] <= lon <= box[2] and box[1] <= lat <= box[3] for lon, lat in gps):
            continue
        highway, building = values.get("highway"), values.get("building")
        if highway not in ROAD_TYPES and building not in BUILDING_TYPES:
            continue
        local = [meters[ref] for ref in refs]
        footprint = bounds(local)
        if any(intersects(footprint, limit) for limit in omitted):
            continue
        if highway in ROAD_TYPES and values.get("area") != "yes":
            geometry = {"type": "LineString", "coordinates": gps}
            properties = {"layer": "street", "class": highway}
        elif (building in BUILDING_TYPES and len(set(refs)) >= 3 and refs[0] == refs[-1]
              and not any(key in values for key in ("amenity", "office", "man_made", "emergency"))
              and 12 <= square_metres(local) <= 380):
            # Small, unlabelled footprints. No inferred height, interior or occupancy.
            geometry = {"type": "Polygon", "coordinates": [gps]}
            properties = {"layer": "building"}
        else:
            continue
        features.append({"type": "Feature", "properties": properties, "geometry": geometry})
    if not any(feature["properties"]["layer"] == "street" for feature in features):
        raise ValueError("No civilian public streets were retained.")
    with source.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    return {"type": "FeatureCollection", "bbox": box,
            "attribution": COPYRIGHT, "licenseURL": LICENSE, "acquiredDate": acquired.isoformat(),
            "source": "https://api.openstreetmap.org/api/0.6/map?bbox=" + ",".join(map(str, box)),
            "sourceSHA256": checksum, "features": features}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--acquired-date", required=True, type=date.fromisoformat)
    args = parser.parse_args()
    data = export(args.input, args.acquired_date)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(data, stream, separators=(",", ":"), ensure_ascii=False)
        stream.write("\n")
