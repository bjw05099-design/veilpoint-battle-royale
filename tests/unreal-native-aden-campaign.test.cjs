'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const include = path.resolve(__dirname, '../Unreal/Veilpoint/Source/Veilpoint');

test('the native Aden rules reach the finale through all eight choices with continuous roads and honest checkpoints',
  {skip: process.platform === 'win32'}, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aden-campaign-'));
    try {
      const exe = path.join(dir, 'verify');
      const fixture = `
        #include "VPAdenCampaignMigration.h"
        #include "VPAdenCampaignRoutes.h"
        #include <cassert>
        #include <cmath>
        #include <initializer_list>
        int main() {
          using namespace VPAdenCampaign;
          namespace d = VPAdenDispatch;
          const auto leg = [](FProgress p) { return VPAdenDispatchData::Legs[RouteLeg(p)]; };
          const auto same = [](auto a, auto b) { return a.X == b.X && a.Y == b.Y; };
          for (const int people : {Families, Clinic})
          for (bool lit : {false, true})
          for (const int signal : {RadioOnce, Runners}) {
            FProgress progress;
            int chapters = 1, escorts = 0, mechanisms = 0, decisions = 0;
            double metres = 0.;
            assert(!Interact(progress, false, true));
            for (int beat = Radio; beat < Complete; ++beat) {
              assert(progress.Beat == beat && Valid(progress));
              const auto route = leg(progress);
              assert(route.Length >= 2);
              for (int i = 1; i < route.Length; ++i) {
                const auto a = route.Points[i - 1], b = route.Points[i];
                assert(!same(a, b));
                metres += std::hypot(a.X - b.X, a.Y - b.Y) / 100.;
              }
              const auto type = Mode(beat);
              if (type == EMode::Decide) {
                const auto option = (beat == Junction ? people == Families : signal == RadioOnce)
                  ? EInput::OptionOne : EInput::OptionTwo;
                assert(!Decide(progress, option, false, true));
                assert(!Decide(progress, option, true, false));
                assert(!Interact(progress, true, lit));
                assert(Decide(progress, option, true, true));
                ++decisions;
              } else if (type == EMode::Escort) {
                assert(!FinishEscort(progress, false, true));
                assert(!FinishEscort(progress, true, false));
                assert(!Interact(progress, true, lit));
                assert(FinishEscort(progress, true, true));
                ++escorts;
              } else if (type == EMode::Operate) {
                const double duration = OperationSeconds(beat);
                assert(duration > 0.);
                assert(!FinishOperation(progress, duration - .01, true));
                assert(!FinishOperation(progress, duration, false));
                assert(!Interact(progress, true, lit));
                assert(FinishOperation(progress, duration, true));
                ++mechanisms;
              } else {
                assert(type == EMode::Interact);
                if (beat == ReachSignal) {
                  assert(ValidCheckpoint({progress, SignalWindowMs}));
                  assert(ValidCheckpoint({progress, 0}));
                  assert(!ValidCheckpoint({progress, SignalWindowMs + 1}));
                }
                assert(Interact(progress, true, lit));
              }
              assert(ValidCheckpoint({progress, 0}));
              if (progress.Beat != Complete) {
                const auto next = leg(progress);
                assert(same(route.Points[route.Length - 1], next.Points[0]));
              }
              if (Chapter(progress.Beat) > Chapter(beat)) ++chapters;
            }
            const FProgress end{Complete, people, lit ? Crossing : BackStreet, signal};
            assert(progress == end && Mode(progress.Beat) == EMode::Finished);
            assert(chapters == 12 && escorts == 8 && mechanisms == 5 && decisions == 2);
            assert(metres > 1200. && metres < 3000.);
            assert(!Interact(progress, true, lit));
            assert(!Decide(progress, EInput::OptionOne, true, true));
          }

          FCheckpoint save;
          assert(Migrate(1, {2, 0}, {}, save) && save.Progress.Beat == LeadMara);
          assert(Migrate(2, {3, VPAdenMission::RelaySlip}, {}, save) && save.Progress.Beat == Junction);
          assert(Migrate(3, {3, VPAdenMission::ReturnDebrief}, {d::Verify, d::PublicNotice}, save)
                 && save.Progress.Beat == Pickup && save.Progress.Route == Clinic);
          assert(Migrate(3, {3, VPAdenMission::ReturnDebrief}, {d::Complete, d::Witness}, save)
                 && save.Progress.Beat == RestorePower && save.Progress.Route == Families);
          assert(Migrate(5, {3, VPAdenMission::ReturnDebrief},
                 {d::Complete, d::Witness, d::PublicUpdate, d::FollowupComplete}, save)
                 && save.Progress.Beat == OpenShelter && save.Progress.Passage == BackStreet);
          assert(Migrate(7, {3, VPAdenMission::ReturnDebrief},
                 {d::Complete, d::Witness, d::PublicUpdate, d::FollowupComplete, d::ReceiptComplete, d::ReplyComplete}, save)
                 && save.Progress.Beat == LastStop && save.Progress.Passage == BackStreet);
          assert(!Migrate(6, {3, VPAdenMission::ReturnDebrief},
                 {d::Complete, d::Witness, d::PublicUpdate, d::FollowupComplete, d::ReceiptComplete, d::ReplyComplete}, save));
          assert(!Migrate(7, {2, VPAdenMission::ReturnDebrief}, {}, save));
          assert(!Migrate(8, {}, {}, save));
          assert(!Valid({Radio, Families, NoPassage, NoRelay}));
          assert(!Valid({FinalCall, Families, Crossing, NoRelay}));
          assert(!ValidCheckpoint({{FinalCall, Clinic, BackStreet, Runners}, 1}));
        }
      `;
      const compile = spawnSync('c++', ['-std=c++17', '-Wshadow', '-Werror', '-I', include, '-x', 'c++', '-', '-o', exe],
        {input: fixture, encoding: 'utf8', timeout: 15000});
      assert.equal(compile.status, 0, compile.stderr);
      const run = spawnSync(exe, [], {encoding: 'utf8', timeout: 5000});
      assert.equal(run.status, 0, run.stderr);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

test('the screenplay budgets 720 minutes, anchors CH01 to the Korean briefing, and closes the main story in CH12', () => {
  const screenplay = fs.readFileSync(path.resolve(__dirname, '../docs/ADEN_CAMPAIGN_SCREENPLAY_KO.md'), 'utf8');
  const scenes = [...screenplay.matchAll(/^### CH(\d{2}) · .* — (\d+)분\n([\s\S]*?)(?=^### CH|^## 플레이로|$(?![\s\S]))/gm)];
  assert.deepEqual(scenes.map(scene => +scene[1]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(scenes.reduce((sum, scene) => sum + +scene[2], 0), 720);
  for (const scene of scenes) {
    const budget = [...scene[3].matchAll(/^\d\. \*\*.*? (\d+)분\.\*\*/gm)].map(line => +line[1]);
    assert.equal(budget.length, 4, `CH${scene[1]} scenes`);
    assert.equal(budget.reduce((sum, time) => sum + time, 0), +scene[2], `CH${scene[1]} duration`);
  }
  assert.match(scenes[0][3], /한국, 출국 전[\s\S]*김 요원님/);
  assert.match(scenes.at(-1)[3], /두 차량이 도착[\s\S]*무전기를 건네는[\s\S]*마라 씨는 남으셨고요[\s\S]*들려요/);
});
