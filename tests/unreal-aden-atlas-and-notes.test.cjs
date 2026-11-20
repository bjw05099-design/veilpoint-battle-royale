'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {inflateSync} = require('node:zlib');

const root = path.join(__dirname, '../Unreal/Veilpoint');
const include = path.join(root, 'Source/Veilpoint');

test('Unreal atlas textures carry verified extents and pinned original bytes', () => {
  const maps = path.join(root, 'ContentSource/Aden');
  const manifest = JSON.parse(fs.readFileSync(path.join(maps, 'aden-atlas.json'), 'utf8'));
  assert.equal(manifest.schema, 'veilpoint-native-aden-atlas-v1');
  assert.deepEqual(manifest.layers['aden-atlas-local.png'].boundsCm, [153600, -153600, 512000, 204800]);
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
      int main() {
        using namespace VPAdenAtlas;
        assert(Local.Width() == 358400 && Region.Width() == 4096000 && Region.Height() == 3584000);
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
          using namespace VPAdenDrape;
          static_assert(SectorIndex(0, 0) == 0);
          static_assert(SectorIndex(16, 16) == 8);
          static_assert(SectorIndex(111, 111) == 48);
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
              if (InPilot(x, y)) {
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
              assert(OnPilotBorder(edgeX, edgeY));
              assert(OnPilotBorder(edgeX + horizontal, edgeY + !horizontal));
            }
          }
          assert(omitted == 196 && stitched == 56 && triangles == 44912);
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
          for (auto finished : {session, internal}) {
            const auto migrated = d::Restore(4, finished);
            assert(migrated.Followup == d::FollowupReady && d::HasObjective(migrated));
            for (int step = d::ReturnToLedger; step <= d::FollowupComplete; ++step) {
              assert(d::Advance(finished, d::EInput::FileInternally, true) == d::EResult::Ignored);
              assert(d::Advance(finished, d::EInput::Interact, false) == d::EResult::Advanced);
              assert(finished.Followup == step && finished.Disposition == migrated.Disposition);
              assert(d::Valid(d::Restore(5, finished)));
            }
            assert(!d::HasObjective(finished));
            assert(d::Advance(finished, d::EInput::Interact, false) == d::EResult::Ignored);
          }
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
