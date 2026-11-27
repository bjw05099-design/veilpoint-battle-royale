'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {gunzipSync, inflateSync} = require('node:zlib');

const root = path.join(__dirname, '../Unreal/Veilpoint');
const include = path.join(root, 'Source/Veilpoint');

test('Aden field pin is local and samples the sourced playable terrain mesh', () => {
  const controller = fs.readFileSync(path.join(include, 'VPPlayerController.cpp'), 'utf8');
  const world = fs.readFileSync(path.join(include, 'VPAdenSourceWorld.cpp'), 'utf8');
  const pin = controller.slice(controller.indexOf('void AVPPlayerController::PlaceAdenPin()'),
    controller.indexOf('bool AVPPlayerController::GetAdenRoutePreview'));
  assert.match(pin, /AdenAtlasPage != 1/);
  assert.match(pin, /Centre\(AdenFieldCrop[\s\S]*?TraceAtlasGround\(Point, Floor\)\) SetAdenPin\(TOptional<FVector>\(Floor\)\)/);
  assert.doesNotMatch(pin, /TryInteraction|PersistStoryCheckpoint|Server/);
  assert.match(world, /TraceAtlasGround[\s\S]*?Playable\.Contains\(Point\)[\s\S]*?TerrainCollision->LineTraceComponent/);
});

test('atlas drawing and pointer pins share projection and reuse unchanged road and footprint strokes', () => {
  const controller = fs.readFileSync(path.join(include, 'VPPlayerController.cpp'), 'utf8');
  const hud = fs.readFileSync(path.join(include, 'VPAdenHUD.cpp'), 'utf8');
  assert.match(controller, /PointAtPixel\(VPAdenAtlas::ScreenMap[\s\S]*?TraceAtlasGround\(Point, Floor\)/);
  assert.match(hud, /ScreenMap\(Crop, Canvas->ClipX, Canvas->ClipY\)/);
  assert.match(hud, /AdenStrokeSource\.Get\(\) != Source \|\| !\(AdenStrokeExtent == Strokes\)[\s\S]*?VisitAtlasLines/);
});

test('native road classes retain the complete order and values of the archived civilian centre lines', () => {
  const raw = gunzipSync(fs.readFileSync(path.join(root, 'ContentSource/Aden/aden-civilian-pilot.geojson.gz')));
  const roads = JSON.parse(raw).features.filter(({geometry, properties}) =>
    geometry.type === 'LineString' && properties.layer === 'street');
  const header = fs.readFileSync(path.join(include, 'VPAdenRoadClassData.h'), 'utf8');
  assert.ok(header.includes(createHash('sha256').update(raw).digest('hex')));
  const native = [...header.matchAll(/EHighway::(\w+)/g)].map(([, name]) => name);
  const pascal = value => value.split('_').map(part => part[0].toUpperCase() + part.slice(1)).join('');
  assert.equal(roads.length, 183);
  assert.equal(new Set(native).size, 7);
  assert.deepEqual(native, roads.map(road => pascal(road.properties.class)));
});

test('Aden recovery commits only after a walkable terrain hit and capsule overlap rejection', () => {
  const mode = fs.readFileSync(path.join(include, 'VPAdenStoryGameMode.cpp'), 'utf8');
  const method = mode.slice(mode.indexOf('bool AVPAdenStoryGameMode::RestorePosition'),
    mode.indexOf('FVector AVPAdenStoryGameMode::GetObjective'));
  const source = fs.readFileSync(path.join(include, 'VPAdenSourceWorld.cpp'), 'utf8');
  const trace = source.slice(source.indexOf('bool AVPAdenSourceWorld::TraceAtlasGround'),
    source.indexOf('FVPAdenRegionalCheck AVPAdenSourceWorld::VerifyRegionalTiles'));
  assert.match(trace, /TerrainCollision->LineTraceComponent[\s\S]*?\*Surface = Hit/);
  assert.match(method, /TraceAtlasGround\(\{Candidate\.X, Candidate\.Y\}, Ground, &Hit\)[\s\S]*?FloorNormalZ < Movement->GetWalkableFloorZ\(\)/);
  assert.match(method, /OverlapBlockingTestByChannel[\s\S]*?Capsule->GetCollisionObjectType\(\)[\s\S]*?TeleportTo\(Clear, Facing, false, true\)/);
});

test('Aden bookmarks use their own local slot and reload only against the matching ground revision', () => {
  const controller = fs.readFileSync(path.join(include, 'VPPlayerController.cpp'), 'utf8');
  const bookmark = fs.readFileSync(path.join(include, 'VPAdenMapBookmarks.h'), 'utf8');
  const hud = fs.readFileSync(path.join(include, 'VPAdenHUD.cpp'), 'utf8');
  assert.match(bookmark, /class UVPAdenMapBookmarks : public USaveGame/);
  assert.match(controller, /GetNetMode\(\) != NM_Standalone[\s\S]*?Bookmarks->SourceRevision != Source->Revision\(\)/);
  assert.match(controller, /LoadGameFromSlot\(Slot, 0[\s\S]*?TraceAtlasGround\(Point, Ground\)/);
  assert.match(controller, /LocalAdenBookmarkSlot\(Bookmarks->Generation\)[\s\S]*?SaveDataToSlot\(Bytes, Slot, 0\)[\s\S]*?Bytes != Checked/);
  assert.match(controller, /if \(SaveAdenPins\(\)\) return true;[\s\S]*?Value = Previous/);
  assert.match(hud, /GetAdenPinAt\(Id\)[\s\S]*?GetSelectedAdenPin\(\)/);
});

test('Aden lift rejects an occupied swept path before moving and pauses story progress', () => {
  const world = fs.readFileSync(path.join(include, 'VPAdenSourceWorld.cpp'), 'utf8');
  const mode = fs.readFileSync(path.join(include, 'VPAdenStoryGameMode.cpp'), 'utf8');
  assert.match(world, /OverlapAnyTestByObjectType[\s\S]*?SweepSingleByObjectType[\s\S]*?Destination, Rotation, Bodies, Shape, Query\)\) return false;[\s\S]*?SetWorldLocationAndRotation/);
  assert.match(mode, /bOperationObstructed = !UpdateRescueProps\(Fraction\);[\s\S]*?if \(!View->bOperationObstructed\)[\s\S]*?OperationProgress = Requested/);
  assert.match(mode, /if \(OperationStarted >= 0\.\)[\s\S]*?GetRescueBarrier\(RescueBarrierSlot\(Progress\.Beat\)\)[\s\S]*?InspectReach\(Pawn, GetObjective\(\), true, OperatingBarrier\) != EReach::Ready/);
  assert.match(mode, /if \(Reach != EReach::Ready\) return Reach;[\s\S]*?Query\.AddIgnoredComponent\(OperatingBarrier\)[\s\S]*?LineTraceTestByChannel\(Eye, Point, ECC_Visibility, Query\)/);
});

test('Aden detail art is repeatable and all three channels use the separate terrain UVs', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-ground-detail-'));
  try {
    const script = path.join(__dirname, '../scripts/build-aden-ground-detail.py');
    const build = name => {
      const out = path.join(temp, name);
      const python = process.platform === 'win32' ? 'python' : 'python3';
      const result = spawnSync(python, [script, out], {encoding: 'utf8', timeout: 12000});
      assert.equal(result.status, 0, result.error?.message || result.stderr);
      return ['T_AdenGroundNormal', 'T_AdenGroundRoughness', 'T_AdenGroundColorVariation']
        .map(name => fs.readFileSync(path.join(out, name + '.png')));
    };
    const art = build('first');
    assert.deepEqual(art, build('repeat'));
    for (const [index, png] of art.entries()) {
      const channels = index ? 1 : 3;
      assert.equal(png.readUInt32BE(16), 256);
      assert.equal(png.readUInt32BE(20), 256);
      assert.equal(png[25], index ? 0 : 2);
      const data = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));
      const stride = 1 + 256 * channels;
      assert.equal(data.length, 256 * stride);
      let seamX = 0, adjacentX = 0, seamY = 0, adjacentY = 0;
      const diversity = new Set();
      for (let y = 0; y < 256; y++) {
        const row = y * stride;
        assert.equal(data[row], 0);
        seamX += Math.abs(data[row + 1] - data[row + 1 + 255 * channels]);
        adjacentX += Math.abs(data[row + 1] - data[row + 1 + channels]);
        const column = 1 + y * channels;
        seamY += Math.abs(data[column] - data[255 * stride + column]);
        adjacentY += Math.abs(data[column] - data[stride + column]);
        for (let x = 0; x < 256; x++) {
          const at = row + 1 + x * channels;
          diversity.add(data[at]);
          if (index === 0) assert.ok(data[at + 2] >= 200, 'the artistic surface normals always point outward');
          if (index === 1) assert.ok(data[at] >= 194 && data[at] <= 253);
        }
      }
      assert.ok(seamX < adjacentX * 2 + 256);
      assert.ok(seamY < adjacentY * 2 + 256);
      assert.ok(diversity.size > 16);
      if (index === 2) assert.ok(diversity.has(128) && Math.max(...diversity) - Math.min(...diversity) > 80);
    }
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
  const world = fs.readFileSync(path.join(include, 'VPAdenSourceWorld.cpp'), 'utf8');
  const author = fs.readFileSync(path.join(__dirname, '../scripts/ue5-author-aden-ch01.py'), 'utf8');
  assert.match(world, /GroundDetailTileCm = 256\.[\s\S]*?UVs\.Emplace\(Point\.X \/ GroundDetailTileCm, Point\.Y \/ GroundDetailTileCm\)/);
  assert.match(world, /A\.UV1 == B\.UV1[\s\S]*?A\.Tangent\.TangentX == B\.Tangent\.TangentX/);
  assert.match(author, /coordinate_index", 1[\s\S]*?MP_NORMAL[\s\S]*?MP_ROUGHNESS[\s\S]*?MP_BASE_COLOR/);
});

test('Unreal atlas textures carry verified extents and pinned original bytes', () => {
  const maps = path.join(root, 'ContentSource/Aden');
  const manifest = JSON.parse(fs.readFileSync(path.join(maps, 'aden-atlas.json'), 'utf8'));
  assert.equal(manifest.schema, 'veilpoint-native-aden-atlas-v1');
  assert.deepEqual(manifest.layers['aden-atlas-local.png'].boundsCm, [153600, -153600, 512000, 204800]);
  assert.deepEqual(manifest.layers['aden-atlas-detail-relief.png'].boundsCm, manifest.layers['aden-atlas-local.png'].boundsCm);
  assert.deepEqual(manifest.layers['aden-atlas-west.png'].boundsCm, [0, -153600, 153600, 204800]);
  assert.deepEqual(manifest.layers['aden-atlas-region.png'].boundsCm, [-2662400, -2150400, 1433600, 1433600]);
  for (const [name, info] of Object.entries(manifest.layers)) {
    const img = fs.readFileSync(path.join(maps, name));
    assert.equal(createHash('sha256').update(img).digest('hex'), info.pngSha256);
    assert.deepEqual([img.readUInt32BE(16), img.readUInt32BE(20)], info.size);
  }
});

test('Unreal regional mesh carries the full registered 256 metre elevation grid', () => {
  const header = fs.readFileSync(path.join(include, 'VPAdenRegionalData.h'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'ContentSource/Aden/aden-atlas.json'), 'utf8'));
  assert.ok(header.includes(`PilotRevision[] = "${manifest.revision}"`));
  const compressed = header.split('Chunks[] = {')[1].match(/"[A-Za-z0-9+/=]+"/g)
      .map(chunk => chunk.slice(1, -1)).join('');
  const raw = inflateSync(Buffer.from(compressed, 'base64'));
  assert.equal(raw.length, 161 * 141 * 2);
  let highest = 0;
  let seaLevel = 0;
  for (let i = 0; i < raw.length; i += 2) {
    const dm = raw.readInt16LE(i);
    highest = Math.max(highest, dm);
    if (dm === 0) ++seaLevel;
  }
  assert.ok(highest > 2500);
  assert.ok(seaLevel > 500);
});

test('Aden west contains the full centimetre elevation payload for 21 new terrain sectors', () => {
  const header = fs.readFileSync(path.join(include, 'VPAdenWestData.h'), 'utf8');
  const packed = [...header.matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(entry => entry[1]).join('');
  const samples = inflateSync(Buffer.from(packed, 'base64'));
  assert.equal(samples.length, 48 * 113 * 4);
  const profile = Array.from({length: 48}, (_, x) => samples.readInt32LE((22 * 48 + x) * 4));
  assert.ok(Math.min(...profile.slice(16)) > 600);
  assert.ok(Math.max(...profile.slice(16)) - Math.min(...profile.slice(16)) > 300);
});

test('compile and exercise the real Unreal atlas projection and save migration rules',
    {skip: process.platform === 'win32'}, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-atlas-rules-'));
  try {
    const exe = path.join(temp, 'verify');
    const cpp = `
      #include "VPAdenAtlasProjection.h"
      #include "VPAdenDrape.h"
      #include "VPAdenFootprint.h"
      #include "VPAdenRegionalGrid.h"
      #include "VPAdenMissionRules.h"
      #include "VPAdenDispatchRules.h"
      #include <cassert>
      #include <cmath>
      int main() {
        using namespace VPAdenAtlas;
        assert(Local.Width() == 358400 && Region.Width() == 4096000 && Region.Height() == 3584000);
        assert(Playable.Width() == 512000 && Playable.Height() == 358400);
        static_assert(BookmarkLimit == 3 && IsBookmarkSlot(0) && IsBookmarkSlot(2));
        static_assert(!IsBookmarkSlot(-1) && !IsBookmarkSlot(3));
        {
          const auto view = Crop(Playable, Centre(Playable), 2);
          const auto hd = ScreenMap(view, 1440, 900);
          const auto narrow = ScreenMap(view, 500, 480);
          assert(hd.IsValid() && hd.Side && narrow.IsValid() && !narrow.Side);
          assert(!ScreenMap(view, 200, 160).IsValid());
          const auto pixel = FPoint{hd.Map.West + .68 * hd.Map.Width(), hd.Map.North + .32 * hd.Map.Height()};
          FPoint world{};
          assert(PointAtPixel(hd, view, pixel, world));
          const auto anchor = view.Normalized(world);
          const auto zoomed = ZoomAt(Playable, view, world, 3);
          const auto anchored = zoomed.Normalized(world);
          assert(std::abs(anchored.X - anchor.X) < 1.e-9 && std::abs(anchored.Y - anchor.Y) < 1.e-9);
          assert(PointAtPixel(narrow, view, Centre(narrow.Map), world));
          assert(world.X == Centre(view).X && world.Y == Centre(view).Y);
          assert(!PointAtPixel(hd, view, {hd.Map.West - .01, pixel.Y}, world));
          assert(!PointAtPixel(hd, view, {hd.Map.East + .01, pixel.Y}, world));
          const auto edgeZoom = ZoomAt(Playable, Crop(Playable, {Playable.West, Playable.North}, 5),
              {Playable.West, Playable.North}, 2);
          assert(edgeZoom.West == Playable.West && edgeZoom.North == Playable.North);
        }
        const auto split = Crop(Playable, {West.East, 0.}, 3);
        const auto left = Intersection(split, West), right = Intersection(split, Local);
        assert(left.East == right.West && left.Width() + right.Width() == split.Width());
        assert(Intersection(Crop(Playable, {West.West, 0.}, 3), Local).Width() < 0.);
        auto edge = Crop(Local, {Local.West, Local.South}, 3);
        assert(edge.West == Local.West && edge.South == Local.South);
        assert(edge.Width() == 44800 && edge.Height() == 44800);
        auto whole = Crop(Region, {0., 0.}, 0);
        auto point = whole.Normalized({Region.East, Region.South});
        assert(point.X == 1. && point.Y == 1.);
        FPoint from{-5., 5.}, to{15., 5.};
        assert(Clip({0., 0., 10., 10.}, from, to));
        assert(from.X == 0. && to.X == 10. && from.Y == to.Y);
        FPoint outsideA{-2., -1.}, outsideB{8., -1.};
        assert(!Clip({0., 0., 10., 10.}, outsideA, outsideB));
        assert(ScaleBarMetres(Region) == 5000);
        assert(ScaleBarMetres(Local) == 500);
        assert(ScaleBarMetres(Crop(Local, {0., 0.}, MaxZoomLevel)) == 20);
        {
          const auto centred = Crop(Playable, Centre(Playable), 2);
          const auto east = Pan(Playable, centred, {1., 0.});
          assert(east.West - centred.West == centred.Width() / 4. && east.North == centred.North);
          const auto south = Pan(Playable, east, {0., 1.});
          assert(south.North - east.North == centred.Height() / 4. && south.West == east.West);
          assert(south.Width() == centred.Width() && south.Height() == centred.Height());
          auto northwest = centred;
          for (int i = 0; i < 64; ++i) northwest = Pan(Playable, northwest, {-1., -1.});
          assert(northwest.West == Playable.West && northwest.North == Playable.North);
          assert(northwest.Width() == centred.Width() && northwest.Height() == centred.Height());
          const auto recentered = Crop(Playable, Centre(Playable), 2);
          assert(recentered.West == centred.West && recentered.North == centred.North);
          const auto still = Pan(Playable, Playable, {1., 1.});
          assert(still.West == Playable.West && still.South == Playable.South);
          for (const auto screen : {ScreenMap(centred, 1440, 900), ScreenMap(centred, 500, 480)}) {
            const auto grip = Centre(screen.Map);
            const FPoint delta{screen.Map.Width() * .3, -screen.Map.Height() * .2};
            const auto dragged = Drag(Playable, centred, screen, delta);
            assert(dragged.Width() == centred.Width() && dragged.Height() == centred.Height());
            FPoint initial, carried;
            assert(PointAtPixel(screen, centred, grip, initial));
            assert(PointAtPixel(screen, dragged, {grip.X + delta.X, grip.Y + delta.Y}, carried));
            assert(std::abs(initial.X - carried.X) < 1.e-6 && std::abs(initial.Y - carried.Y) < 1.e-6);
            const auto limited = Drag(Playable, centred, screen, {10000., -10000.});
            assert(limited.West == Playable.West && limited.South == Playable.South);
            const auto reversed = Drag(Playable, limited, screen, {-1., 1.});
            assert(reversed.West > limited.West && reversed.South < limited.South);
          }
          assert(Drag(Playable, centred, ScreenMap(centred, 200, 150), {50., 25.}) == centred);
          assert(Drag(Playable, Playable, ScreenMap(Playable, 1440, 900), {50., 25.}) == Playable);
        }
        {
          constexpr FPoint start{Local.East - 300., Local.North + 600.};
          constexpr FPoint goal{Local.East - 18000., Local.North + 15000.};
          FExtent bounds{start.X, start.Y, start.X, start.Y};
          bounds.Include(goal);
          const auto follow = Crop(Local, start, MaxZoomLevel);
          const auto route = FitRoute(Local, bounds, MaxZoomLevel);
          assert(!follow.Contains(goal) && route.Contains(goal) && route.Contains(start));
          assert(route.East == Local.East && route.North == Local.North);
          assert(route.Width() > follow.Width() && std::abs(route.Width() - route.Height()) < 1.e-9);
          const auto full = FitRoute(Local, Local, MaxZoomLevel);
          assert(full.West == Local.West && full.North == Local.North && full.East == Local.East && full.South == Local.South);
        }
        {
          constexpr FExtent view{0., 0., 100., 100.};
          FPoint objective{135., 70.};
          assert(PointAtEdge(view, {30., 40.}, objective, 10.));
          assert(objective.X == 90. && std::abs(objective.Y - (40. + 120. / 7.)) < 1.e-9);
          objective = {-10., -10.};
          assert(PointAtEdge(view, {0., 0.}, objective, 10.));
          assert(objective.X == 10. && objective.Y == 10.);
          objective = {100., 40.};
          assert(!PointAtEdge(view, {30., 40.}, objective, 10.));
          assert(objective.X == 100. && objective.Y == 40.);
          objective = {120., 50.};
          assert(PointAtEdge(view, {160., 20.}, objective, 10.));
          assert(objective.X == 90. && objective.Y == 20.);
          FPoint player{-40., 50.};
          assert(PointAtEdge(view, Centre(view), player, 20.));
          assert(player.X == 20. && player.Y == 50.);
        }
        {
          using namespace VPAdenDrape;
          static_assert(SectorIndex(0, 0) == 0);
          static_assert(SectorIndex(16, 16) == 8);
          static_assert(SectorIndex(111, 111) == 48);
          const auto full = LocalAtlasSectors(Local);
          assert(full.West == 0 && full.North == 0 && full.East == 6 && full.South == 6);
          const auto edgeSector = LocalAtlasSectors({Local.West + 51199., Local.North + 51200.,
                                                   Local.West + 51200., Local.North + 64000.});
          assert(edgeSector.West == 0 && edgeSector.East == 1 && edgeSector.North == 1 && edgeSector.South == 1);
          const auto close = LocalAtlasSectors(Crop(Local, {Local.East, Local.South}, MaxZoomLevel));
          assert(close.West == 6 && close.North == 6 && close.East == 6 && close.South == 6);
          const auto breaks = SegmentBreaks({3., 3.}, {17., 13.}, {0., 0., 20., 20.}, 10.);
          assert(breaks.size() == 6);
          assert(std::abs(breaks[1] - 1. / 6.) < 1.e-9);
          assert(std::abs(breaks[2] - .5) < 1.e-9);
          assert(std::abs(breaks[3] - 7. / 12.) < 1.e-9);
          assert(std::abs(breaks[4] - .7) < 1.e-9);
          const auto corner = SegmentBreaks({5., 5.}, {15., 15.}, {0., 0., 20., 20.}, 10.);
          assert(corner.size() == 3 && corner[1] == .5);
          const auto reversed = SegmentBreaks({17., 13.}, {3., 3.}, {0., 0., 20., 20.}, 10.);
          assert(reversed.size() == breaks.size());
          for (std::size_t i = 0; i < breaks.size(); ++i)
            assert(std::abs(reversed[i] + breaks[breaks.size() - 1 - i] - 1.) < 1.e-9);
          std::array<FPoint, 3> join;
          assert(!BevelJoin({50., 50.}, {0., 0.}, {0., 4.}, join));
          assert(!BevelJoin({50., 50.}, {0., 4.}, {0., 4.}, join));
          assert(!BevelJoin({50., 50.}, {0., 4.}, {0., -4.}, join));
          assert(BevelJoin({50., 50.}, {0., 4.}, {-4., 0.}, join));
          assert(join[1].X == 50. && join[1].Y == 46. && join[2].X == 54. && join[2].Y == 50.);
          assert(BevelJoin({50., 50.}, {0., 4.}, {4., 0.}, join));
          assert(join[1].X == 54. && join[1].Y == 50. && join[2].X == 50. && join[2].Y == 54.);
          double joinArea = 0.;
          DrapeConvex(join, {0., 0., 100., 100.}, 50., [&](const auto& patch, int col, int row) {
            assert(col == 1 && row == 1);
            for (int i = 0; i < patch.Count; ++i) {
              const auto a = patch.Points[i], b = patch.Points[(i + 1) % patch.Count];
              joinArea += (a.X * b.Y - b.X * a.Y) / 2.;
            }
          });
          assert(std::abs(joinArea - 8.) < 1.e-9);
        }
        {
          const std::array<FPoint, 4> strip{{{-10., 10.}, {110., 10.}, {110., 40.}, {-10., 40.}}};
          double area = 0.;
          int patches = 0;
          VPAdenDrape::DrapeConvex(strip, {0., 0., 100., 100.}, 50., [&](const auto& polygon, int col, int row) {
            ++patches;
            assert((col == 0 || col == 1) && row == 0);
            for (int i = 0; i < polygon.Count; ++i) {
              const auto a = polygon.Points[i];
              const auto b = polygon.Points[(i + 1) % polygon.Count];
              assert(a.X >= col * 50. - 1.e-9 && a.X <= (col + 1) * 50. + 1.e-9);
              area += (a.X * b.Y - b.X * a.Y) / 2.;
            }
          });
          assert(patches == 4 && std::abs(area - 3000.) < .0001);
        }
        {
          // The L-shaped footprint spans several terrain cells and has a concave corner.
          using VPAdenFootprint::Cross;
          std::array<FPoint, 8> ring{{{0., 0.}, {25., 0.}, {50., 0.}, {50., 10.},
                                      {10., 10.}, {10., 50.}, {0., 50.}, {0., 0.}}};
          for (int winding = 0; winding < 2; ++winding) {
            const auto triangles = VPAdenFootprint::Triangulate(ring.data(), int(ring.size()));
            assert(triangles.size() == 4);
            double area = 0.;
            for (const auto& indices : triangles) {
              const std::array<FPoint, 3> triangle{ring[indices[0]], ring[indices[1]], ring[indices[2]]};
              VPAdenDrape::DrapeConvex(triangle, {0., 0., 50., 50.}, 10., [&](const auto& patch, int col, int row) {
                for (int i = 0; i < patch.Count; ++i) {
                  const FPoint p = patch.Points[i];
                  assert(p.X <= 10. || p.Y <= 10.);
                  assert(p.X >= col * 10. - 1.e-9 && p.X <= (col + 1) * 10. + 1.e-9);
                  assert(p.Y >= row * 10. - 1.e-9 && p.Y <= (row + 1) * 10. + 1.e-9);
                }
                for (int i = 1; i + 1 < patch.Count; ++i)
                  area += Cross(patch.Points[0], patch.Points[i], patch.Points[i + 1]) / 2.;
              });
            }
            assert(std::abs(area - 900.) < .0001);
            std::reverse(ring.begin(), ring.end());
          }
          const FPoint collinear[] = {{0., 0.}, {5., 0.}, {10., 0.}};
          assert(VPAdenFootprint::Triangulate(collinear, 3).empty());
        }
        {
          using namespace VPAdenRegionalGrid;
          int omitted = 0, stitched = 0, triangles = 0;
          for (int y = 0; y < Rows - 1; ++y) {
            for (int x = 0; x < Columns - 1; ++x) {
              const auto edge = SharedEdge(x, y);
              if (InPlayable(x, y)) {
                assert(edge == EEdge::None);
                ++omitted;
                continue;
              }
              if (edge == EEdge::None) {
                triangles += 2;
                continue;
              }
              ++stitched;
              triangles += Subdivisions + 3;
              const bool horizontal = edge == EEdge::North || edge == EEdge::South;
              const int edgeX = x + (edge == EEdge::East);
              const int edgeY = y + (edge == EEdge::South);
              assert(OnPlayableBorder(edgeX, edgeY));
              assert(OnPlayableBorder(edgeX + horizontal, edgeY + !horizontal));
            }
          }
          assert(omitted == 280 && stitched == 68 && triangles == 44852);
          static_assert(TileCount == 56);
          static_assert(PreferredStep(0, 0) == 4);
          static_assert(PreferredStep(LocalWest / TileCells, LocalNorth / TileCells) == 1);
          const auto slope = [](int x, int y) { return 100. + 7. * x - 31. * y; };
          assert(TileFitError(0, 0, 4, slope) == 0.);
          const auto ridge = [](int x, int y) { return x == 2 && y == 2 ? 700. : 0.; };
          assert(TileFitError(0, 0, 4, ridge) > FitToleranceCm);
          assert(TileFitError(0, 0, 1, ridge) == 0.);
          FSteps steps;
          steps.fill(4);
          steps[TileIndex(1, 0)] = 1;
          steps[TileIndex(0, 1)] = 2;
          assert((PatchEdgeSteps(16, 16, steps) == std::array<int, 4>{4, 1, 2, 4}));
          assert((PatchEdgeSteps(4, 4, steps) == std::array<int, 4>{4, 4, 4, 4}));
          assert(PatchEdgeSteps(20, 16, steps)[3] == 1);
          assert(PatchEdgeSteps(16, 20, steps)[0] == 2);
          for (int y = LocalNorth - 1; y <= LocalSouth; ++y)
            for (int x = LocalWest - 1; x <= LocalEast; ++x)
              assert(PreferredStep(x / TileCells, y / TileCells) == 1);
        }
        {
          namespace d = VPAdenDispatch;
          d::FState session;
          assert(!d::Valid({d::Choose, d::Witness}));
          assert(!d::Valid({d::Verify, d::Unselected}));
          assert(!d::Valid({d::Complete, d::Witness}));
          assert(!d::Valid({d::Publish, d::Witness, d::InternalHandoff}));
          assert(d::Valid(d::Restore(3, {d::Complete, d::Witness})));
          assert(d::Restore(3, {d::Complete, d::Witness}).Disposition == d::PublicUpdate);
          assert(d::Restore(3, {d::Publish, d::Witness}).Disposition == d::Unfiled);
          assert(!d::Valid(d::Restore(4, {d::Complete, d::Witness})));
          assert(d::Advance(session, d::EInput::OptionOne, false) == d::EResult::Ignored);
          assert(d::Advance(session, d::EInput::Interact, false) == d::EResult::Advanced);
          assert(d::Advance(session, d::EInput::Interact, false) == d::EResult::ShowChoice);
          assert(d::Advance(session, d::EInput::OptionTwo, false) == d::EResult::Ignored);
          assert(d::Advance(session, d::EInput::FileInternally, true) == d::EResult::Ignored);
          assert(d::Advance(session, d::EInput::OptionTwo, true) == d::EResult::Advanced);
          assert(session.Route == d::PublicNotice && session.Phase == d::Verify);
          assert(d::Advance(session, d::EInput::Interact, false) == d::EResult::Advanced);
          assert(d::Advance(session, d::EInput::Interact, false) == d::EResult::Advanced);
          assert(d::Advance(session, d::EInput::OptionTwo, true) == d::EResult::Refused);
          assert(session.Phase == d::Publish && session.Disposition == d::Unfiled);
          assert(d::Advance(session, d::EInput::FileInternally, false) == d::EResult::Ignored);
          auto internal = session;
          assert(d::Advance(internal, d::EInput::FileInternally, true) == d::EResult::Advanced);
          assert(internal.Phase == d::Complete && internal.Route == d::PublicNotice);
          assert(d::Restore(4, internal).Disposition == d::InternalHandoff);
          assert(d::Advance(internal, d::EInput::OptionOne, true) == d::EResult::Ignored);
          assert(d::Advance(session, d::EInput::OptionOne, true) == d::EResult::Advanced);
          assert(session.Phase == d::Complete && session.Route == d::PublicNotice && session.Disposition == d::PublicUpdate);
          assert(!d::Valid({d::Publish, d::Witness, d::Unfiled, d::ReturnToLedger}));
          assert(!d::Valid({d::Complete, d::Witness, d::PublicUpdate, d::FollowupComplete + 1}));
          assert(!d::Valid({d::Complete, d::Witness, d::PublicUpdate, d::ReturnToLedger, d::ReceiptAtArchive}));
          assert(!d::Valid({d::Complete, d::Witness, d::PublicUpdate, d::FollowupComplete, d::ReceiptComplete + 1}));
          for (auto finished : {session, internal}) {
            const auto migrated = d::Restore(4, finished);
            assert(migrated.Followup == d::FollowupReady && d::HasObjective(migrated));
            for (int step = d::ReturnToLedger; step <= d::FollowupComplete; ++step) {
              assert(d::Advance(finished, d::EInput::FileInternally, true) == d::EResult::Ignored);
              assert(d::Advance(finished, d::EInput::Interact, false) == d::EResult::Advanced);
              assert(finished.Followup == step && finished.Disposition == migrated.Disposition);
              assert(d::Valid(d::Restore(5, finished)));
            }
            auto legacy = d::Restore(5, finished);
            assert(d::IsReceiptChapter(legacy) && d::IsChapterHandoff(legacy) && d::HasObjective(legacy));
            for (int step = d::ReceiptAtLedger; step <= d::ReceiptComplete; ++step) {
              assert(d::Advance(legacy, d::EInput::OptionOne, true) == d::EResult::Ignored);
              assert(d::Advance(legacy, d::EInput::Interact, false) == d::EResult::Advanced);
              assert(legacy.Receipt == step && legacy.Followup == d::FollowupComplete);
              assert(legacy.Disposition == finished.Disposition && legacy.Route == finished.Route);
              assert(d::Valid(d::Restore(6, legacy)));
              assert(d::IsChapterHandoff(legacy) == (step == d::ReceiptComplete));
            }
            assert(d::HasObjective(legacy) && !d::IsReplyChapter(legacy));
            assert(d::Advance(legacy, d::EInput::Interact, false) == d::EResult::Advanced);
            assert(d::IsReplyChapter(legacy) && legacy.Reply == d::ReplyAtJunction);
            assert(d::Advance(legacy, d::EInput::Interact, false) == d::EResult::Advanced);
            assert(d::IsReplyChoice(legacy));
            const bool isPublic = legacy.Disposition == d::PublicUpdate;
            const auto correct = isPublic ? d::EInput::OptionOne : d::EInput::OptionTwo;
            const auto wrong = isPublic ? d::EInput::OptionTwo : d::EInput::OptionOne;
            assert(d::Advance(legacy, correct, false) == d::EResult::Ignored);
            assert(d::Advance(legacy, d::EInput::Interact, false) == d::EResult::ShowChoice);
            assert(d::Advance(legacy, d::EInput::FileInternally, true) == d::EResult::Ignored);
            assert(d::Advance(legacy, wrong, true) == d::EResult::Refused && legacy.Reply == d::ReplyAtContact);
            assert(d::Advance(legacy, correct, true) == d::EResult::Advanced && legacy.Reply == d::ReplyAtReview);
            assert(d::Advance(legacy, d::EInput::Interact, false) == d::EResult::Advanced);
            assert(legacy.Reply == d::ReplyComplete && d::Valid(d::Restore(d::CheckpointVersion, legacy)));
            assert(!d::HasObjective(legacy) && legacy.Disposition == finished.Disposition && legacy.Route == finished.Route);
            assert(d::Advance(legacy, d::EInput::Interact, false) == d::EResult::Ignored);
            assert(finished.Receipt == d::ReceiptReady);
          }
          assert(!d::Valid({d::Complete, d::Witness, d::PublicUpdate, d::FollowupComplete, d::ReceiptAtArchive, d::ReplyAtContact}));
          assert(!d::Valid({d::Complete, d::Witness, d::PublicUpdate, d::FollowupComplete, d::ReceiptComplete, d::ReplyComplete + 1}));
          assert(VPAdenDrape::FootprintSector({Local.West, Local.North}) == 0);
          assert(VPAdenDrape::FootprintSector({Local.West + 51199., Local.North + 400.}) == 0);
          assert(VPAdenDrape::FootprintSector({Local.West + 51201., Local.North + 400.}) == 1);
          assert(VPAdenDrape::FootprintSector({Local.East, Local.South}) == 48);
        }
        using namespace VPAdenMission;
        static_assert(ValidCheckpoint(1, {2, None}));
        static_assert(!ValidCheckpoint(1, {2, RelaySlip}));
        static_assert(!ValidCheckpoint(2, {0, RelaySlip}));
        static_assert(!ValidCheckpoint(2, {2, ReturnDebrief}));
        static_assert(ValidCheckpoint(2, {3, RelaySlip | ReturnDebrief}));
        static_assert(AvailableNote({1, None}) == RelaySlip);
        static_assert(AvailableNote({2, RelaySlip}) == None);
        static_assert(AvailableNote({3, None}) == ReturnDebrief);
        static_assert(AvailableNote({3, RelaySlip | ReturnDebrief}) == None);
      }
    `;
    const compilation = spawnSync('c++', ['-std=c++17', '-I', include, '-x', 'c++', '-', '-o', exe],
        {input: cpp, encoding: 'utf8', timeout: 15000});
    assert.equal(compilation.status, 0, compilation.stderr);
    const native = spawnSync(exe, [], {encoding: 'utf8', timeout: 4000});
    assert.equal(native.status, 0, native.stderr);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
});
