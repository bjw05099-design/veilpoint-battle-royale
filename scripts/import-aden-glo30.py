"""Project the public Copernicus elevation surface onto VEILPOINT's metre grid."""

import argparse
import gzip
import hashlib
import json
import math
from contextlib import ExitStack
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_bounds


TILE_METRES = 512
SAMPLE_METRES = 32
GRID_SIZE = TILE_METRES // SAMPLE_METRES + 1
CRS = "EPSG:32638"
# Projected metres. Game X increases east and game Z increases south.
ANCHOR_EAST, ANCHOR_NORTH = 500000, 1413120
SOURCE = "https://registry.opendata.aws/copernicus-dem/"
NOTICE = ("produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus "
          "Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union "
          "and ESA; all rights reserved")
CITY_WINDOW = (-52, -42, 80, 70)
PILOT_WINDOW = (3, -3, 7, 7)


def extent(window):
    tx, tz, width, height = window
    left = ANCHOR_EAST + tx * TILE_METRES
    top = ANCHOR_NORTH - tz * TILE_METRES
    return left, top - height * TILE_METRES, left + width * TILE_METRES, top


def contains(outer, inner):
    return (outer[0] <= inner[0] and outer[1] <= inner[1]
            and outer[2] >= inner[2] and outer[3] >= inner[3])


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def project_sources(sources, window):
    left, bottom, right, top = extent(window)
    # Convert destination vertices to pixel centres. Shared 512 m borders
    # then refer to the exact same cells, including the outermost vertices.
    half = SAMPLE_METRES / 2
    transform = from_origin(left - half, top + half, SAMPLE_METRES, SAMPLE_METRES)
    pad = SAMPLE_METRES * 2
    lonlat = transform_bounds(CRS, "EPSG:4326", left - pad, bottom - pad,
                              right + pad, top + pad)
    x_steps = window[2] * (GRID_SIZE - 1)
    z_steps = window[3] * (GRID_SIZE - 1)
    result = np.full((z_steps + 1, x_steps + 1), np.nan, dtype="float32")
    with ExitStack() as stack:
        datasets = [stack.enter_context(rasterio.open(path)) for path in sources]
        for dataset in datasets:
            if (dataset.crs.to_epsg() != 4326 or dataset.count != 1
                    or not math.isclose(dataset.res[0], 1 / 3600, abs_tol=1e-10)
                    or not math.isclose(dataset.res[1], 1 / 3600, abs_tol=1e-10)):
                raise ValueError(f"Expected a one-arcsecond WGS84 GeoTIFF: {Path(dataset.name).name}")
        # Mosaic before bilinear reprojection to retain interpolation across
        # the real 45°E source boundary instead of sampling each side alone.
        mosaic, source_transform = merge(datasets, bounds=lonlat, indexes=[1],
                                         dtype="float32", nodata=float("nan"))
        reproject(mosaic[0], result, src_transform=source_transform,
                  src_crs=datasets[0].crs, src_nodata=float("nan"),
                  dst_transform=transform, dst_crs=CRS, dst_nodata=float("nan"),
                  resampling=Resampling.bilinear)
    if not np.isfinite(result).all():
        raise ValueError("The source does not cover the requested extent. Missing elevation was not filled.")
    return result, transform


def tile_document(values, window, pack, acquired):
    tx0, tz0, width, height = pack
    step = GRID_SIZE - 1
    source = {"provider": "Copernicus GLO-30 Public",
              "acquiredDate": acquired.isoformat(), "license": NOTICE,
              "reference": SOURCE, "scope": "public-terrain", "type": "licensed-dem"}
    tiles = []
    for tz in range(tz0, tz0 + height):
        for tx in range(tx0, tx0 + width):
            row = (tz - window[1]) * step
            col = (tx - window[0]) * step
            data = values[row:row + GRID_SIZE, col:col + GRID_SIZE]
            tiles.append({"tx": tx, "tz": tz, "gridSize": GRID_SIZE,
                          "samples": [round(float(value), 2) for value in data.flat],
                          "source": source})
    return {"format": "veilpoint-heightfield-v1",
            "coordinateSystem": "local-metre-unreferenced",
            "title": "Aden public surface | Copernicus GLO-30 | 512 m per tile",
            "tiles": tiles}


def load_civilian_source(path, pack):
    with gzip.open(path, "rb") as stream:
        raw = stream.read(4 * 1024 * 1024 + 1)
    if len(raw) > 4 * 1024 * 1024:
        raise ValueError("Civilian vector source exceeds 4 MiB.")
    data = json.loads(raw)
    if (data.get("type") != "FeatureCollection"
            or data.get("licenseURL") != "https://opendatacommons.org/licenses/odbl/1-0/"
            or not contains(extent(pack), transform_bounds("EPSG:4326", CRS, *data["bbox"]))):
        raise ValueError("Civilian vectors do not register inside the public heightfield pack.")
    counts = {"LineString": 0, "Polygon": 0}
    for feature in data["features"]:
        counts[feature["geometry"]["type"]] += 1
    if not all(counts.values()):
        raise ValueError("The civilian source has no roadway or building features.")
    return raw, {"scope": "public street centerlines and unlabelled small footprints",
                 "reference": data["source"], "acquiredDate": data["acquiredDate"],
                 "licenseURL": data["licenseURL"], "sha256": hashlib.sha256(raw).hexdigest(),
                 "streetSegments": counts["LineString"], "buildingFootprints": counts["Polygon"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("sources", nargs="+", type=Path)
    parser.add_argument("--acquired-date", required=True, type=date.fromisoformat)
    parser.add_argument("--window", nargs=4, type=int, default=CITY_WINDOW,
                        metavar=("TX", "TZ", "WIDTH", "HEIGHT"))
    parser.add_argument("--pack", nargs=4, type=int, default=PILOT_WINDOW,
                        metavar=("TX", "TZ", "WIDTH", "HEIGHT"))
    parser.add_argument("--civilian-source", type=Path,
                        help="Include a frozen civilian-only .geojson.gz inside the requested pack.")
    args = parser.parse_args()
    window, pack = args.window, args.pack
    if (not all(1 <= length <= 100 for length in window[2:]) or
            not all(1 <= length <= 49 for length in pack[2:]) or pack[2] * pack[3] > 49 or
            not contains(extent(window), extent(pack))):
        parser.error("Use a positive city window and a contained pack of at most 49 tiles.")
    if args.output.exists():
        parser.error("Choose a new output directory.")

    values, transform = project_sources(args.sources, window)
    terrain = tile_document(values, window, pack, args.acquired_date)
    vectors = load_civilian_source(args.civilian_source, pack) if args.civilian_source else None
    inputs = [{"file": path.name, "sha256": sha256(path)} for path in args.sources]
    args.output.mkdir(parents=True)
    tiff = args.output / "aden-public-surface.tif"
    with rasterio.open(tiff, "w", driver="GTiff", crs=CRS, transform=transform,
                       width=values.shape[1], height=values.shape[0], count=1,
                       dtype="float32", tiled=True, compress="deflate", predictor=3) as output:
        output.write(values, 1)
        output.update_tags(AREA_OR_POINT="Point", SOURCE=SOURCE, ATTRIBUTION=NOTICE,
                           VERTICAL_DATUM="EGM2008")
    tiles = args.output / "aden-pilot-heightfield.json"
    tiles.write_text(json.dumps(terrain, ensure_ascii=False, separators=(",", ":")) + "\n",
                     encoding="utf-8")
    manifest = {
        "schema": "veilpoint-aden-glo30-source-v1", "horizontalCRS": CRS,
        "verticalDatum": "EGM2008", "sourceType": "digital surface model",
        "sourceReference": SOURCE, "sourceAcquiredUTCDate": args.acquired_date.isoformat(),
        "attribution": NOTICE, "inputSHA256": inputs,
        "gameZeroUTMMetres": [ANCHOR_EAST, ANCHOR_NORTH], "axes": ["east", "south", "up"],
        "metresPerWorldUnit": 1, "sampleSpacingMetres": SAMPLE_METRES,
        "vertexExtentUTMMetres": extent(window), "packExtentUTMMetres": extent(pack),
        "packTileWindow": pack, "surfaceVertices": [values.shape[1], values.shape[0]],
        "elevationRangeMetres": [round(float(values.min()), 2), round(float(values.max()), 2)],
        "noDataVertices": 0, "referenceYearVerified": False,
        "cityBoundaryVerified": False, "cityWideBuildingCoverageVerified": False,
        "sha256": {tiff.name: sha256(tiff), tiles.name: sha256(tiles)},
    }
    if vectors:
        vector_bytes, vector_info = vectors
        (args.output / "aden-civilian-pilot.geojson").write_bytes(vector_bytes)
        manifest["civilianVectorPilot"] = vector_info
    (args.output / "ADEN_SOURCE.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
