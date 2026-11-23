'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {readFileSync, mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join, resolve} = require('node:path');
const {gunzipSync} = require('node:zlib');

const project = resolve(__dirname, '../Unreal/Veilpoint');
const runtime = join(project, 'Source/Veilpoint');

test('the montage runs before the first-person crossing and releases at the end of CH01 opening', {
  skip: process.platform === 'win32',
}, () => {
  const scratch = mkdtempSync(join(tmpdir(), 'veilpoint-opening-'));
  try {
    const probe = join(scratch, 'probe');
    const source = [
      '#include "VPAdenPrologueTimeline.h"',
      '#include <cassert>',
      'using namespace VPAdenPrologue;',
      'int main() {',
      '  static_assert(Total == 81.);',
      '  static_assert(StartOf(Cabin) == 45.);',
      '  static_assert(StartOf(Street) == 75.);',
      '  assert(At(-1.).Shot == OldPort && At(81.).Shot == Count);',
      '  assert(At(80.999).Shot == Street);',
      '  for (int i = OldPort; i < Count; ++i) {',
      '    const auto shot = static_cast<EShot>(i);',
      '    const double start = StartOf(shot);',
      '    assert(At(start).Shot == shot);',
      '    assert(At(start + Shots[i].Length - .001).Shot == shot);',
      '    assert(!ShowsNarration(At(start)));',
      '    if (i < NarrationCount) {',
      '      assert(ShowsNarration({shot, Shots[i].VoiceIn}));',
      '      assert(!ShowsNarration({shot, Shots[i].VoiceOut}));',
      '    } else {',
      '      assert(!ShowsNarration({shot, 2.}));',
      '    }',
      '  }',
      '  double position = 0.;',
      '  int visible[Count] = {};',
      '  for (int step = 0; step < 470; ++step) {',
      '    const FFrame frame = At(position);',
      '    if (frame.Shot == Count) break;',
      '    ++visible[frame.Shot];',
      '    position = Advance(position, 1.7);',
      '  }',
      '  for (int i = OldPort; i < Count; ++i) assert(visible[i] >= 29);',
      '  assert(At(position).Shot == Count);',
      '}',
    ].join('\n');
    const build = spawnSync('c++', ['-std=c++17', '-Wshadow', '-Werror', '-I', runtime,
      '-x', 'c++', '-', '-o', probe], {input: source, encoding: 'utf8', timeout: 15000});
    assert.equal(build.status, 0, build.stderr);
    assert.equal(spawnSync(probe, [], {timeout: 4000}).status, 0);
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
});

test('the four voiced takes contain the authored Korean monologue and fit their subtitle cues', () => {
  const folder = join(project, 'ContentSource/AdenOpening');
  const manifest = JSON.parse(readFileSync(join(folder, 'voice.json'), 'utf8'));
  const subtitleSource = readFileSync(join(runtime, 'VPAdenPrologueLines.inl'), 'utf8');
  const lines = [...subtitleSource.matchAll(/^TEXT\(("[^"]+")\),$/gm)].map(match => JSON.parse(match[1]));
  const timing = readFileSync(join(runtime, 'VPAdenPrologueTimeline.h'), 'utf8').split('Shots[] = {')[1].split('};')[0];
  const window = [...timing.matchAll(/\{\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\}/g)]
    .map(match => Number(match[3]) - Number(match[2]));
  assert.equal(manifest.schema, 'veilpoint-aden-opening-voice-v1');
  assert.deepEqual(manifest.takes.map(take => take.text), lines);
  assert.equal(lines.length, 4);
  for (const [index, take] of manifest.takes.entries()) {
    assert.equal(take.asset, 'SW_AdenPrologueVO' + (index + 1));
    const wav = gunzipSync(readFileSync(join(folder, take.asset + '.wav.gz')));
    assert.equal(createHash('sha256').update(wav).digest('hex'), take.sha256);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(24), 16000);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    const duration = wav.readUInt32LE(40) / 32000;
    assert.ok(duration < window[index] - .15 && duration > 2);
    assert.ok(Math.abs(duration - take.seconds) < .001);
  }
});
