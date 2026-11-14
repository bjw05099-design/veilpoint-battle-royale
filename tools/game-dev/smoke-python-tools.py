"""Exercise installed geometry/GIS tools on generated assets and synthetic data."""
import importlib.metadata
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import open3d as o3d
import trimesh
import xatlas
from pyproj import Transformer
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

directory = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist/game-assets/harbor')
scene = trimesh.load_scene(directory/'harbor.glb', process=True)
parts = []
for node in scene.graph.nodes_geometry:
    transform, name = scene.graph[node]
    part = scene.geometry[name].copy()
    part.apply_transform(transform)
    assert np.isfinite(part.vertices).all()
    parts.append(part)
combined = trimesh.util.concatenate(parts)
assert np.allclose(combined.extents, [16, 9.18, 20], atol=.002), combined.extents
legacy = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(combined.vertices),
                                 o3d.utility.Vector3iVector(combined.faces))
ray_scene = o3d.t.geometry.RaycastingScene(nthreads=2)
ray_scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(legacy))
# glTF is Y-up. The central four-metre passage is open in both directions;
# an overhead ray must actually hit the exported ceiling.
rays = o3d.core.Tensor([[0, 1.6, -13, 0, 0, 1], [0, 1.6, 13, 0, 0, -1],
                        [0, 12, 0, 0, -1, 0]], dtype=o3d.core.Dtype.Float32)
hits = ray_scene.cast_rays(rays)['t_hit'].numpy()
assert np.isinf(hits[:2]).all(), hits
assert abs(float(hits[2])-2.82) < .01, hits
cube = trimesh.creation.box()
mapping, indices, uv = xatlas.parametrize(cube.vertices.astype(np.float32), cube.faces.astype(np.uint32))
assert len(mapping) > 0 and indices.shape == cube.faces.shape
assert np.isfinite(uv).all() and (uv >= 0).all() and (uv <= 1).all()
project = Transformer.from_crs('EPSG:4326', 'EPSG:32638', always_xy=True)
restore = Transformer.from_crs('EPSG:32638', 'EPSG:4326', always_xy=True)
point = project.transform(45, 12)
assert np.allclose(restore.transform(*point), [45, 12], atol=1e-8)
heights = np.arange(16, dtype=np.uint16).reshape((4, 4))
with MemoryFile() as memory:
    with memory.open(driver='GTiff', height=4, width=4, count=1, dtype='uint16',
                     crs='EPSG:32638', transform=from_origin(*point, 2, 2)) as dataset:
        dataset.write(heights, 1)
    with memory.open() as dataset:
        assert np.array_equal(dataset.read(1), heights)
        assert dataset.crs.to_epsg() == 32638
versions = {name: importlib.metadata.version(name) for name in
            ['trimesh', 'open3d', 'pyproj', 'rasterio', 'xatlas', 'ruff', 'cmake', 'ninja']}
bin_dir = Path(sys.executable).parent
for name in ['cmake', 'ninja', 'ruff']:
    command = bin_dir/(name+'.exe' if sys.platform == 'win32' else name)
    subprocess.run([str(command), '--version'], check=True, capture_output=True)
evidence = {'schema': 'veilpoint-extended-tools-smoke-v1', 'versions': versions,
            'assetDimensionsMetres': combined.extents.tolist(), 'triangleCount': len(combined.faces),
            'doorwaysOpen': True, 'roofRayHitMetres': float(hits[2]), 'uvAtlasVerified': True,
            'gisSyntheticRoundTripVerified': True, 'actualAdenTerrainImported': False,
            'unrealImportVerified': False}
(directory/'extended-tools.json').write_text(json.dumps(evidence, indent=2)+'\n', encoding='utf-8')
print(json.dumps(evidence, indent=2))
