'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');

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

test('compile and exercise the real Unreal atlas projection and save migration rules',
    {skip: process.platform === 'win32'}, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-atlas-rules-'));
  try {
    const exe = path.join(temp, 'verify');
    const cpp = `
      #include "VPAdenAtlasProjection.h"
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
