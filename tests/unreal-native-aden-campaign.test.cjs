'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const include = path.resolve(__dirname, '../Unreal/Veilpoint/Source/Veilpoint');

test('Aden signal notices use the same tick clock as their subtitle expiry', () => {
  const mode = fs.readFileSync(path.join(include, 'VPAdenStoryGameMode.cpp'), 'utf8');
  const beat = mode.slice(mode.indexOf('void AVPAdenStoryGameMode::UpdateBeat'),
    mode.indexOf('VPAdenCampaign::FCheckpoint AVPAdenStoryGameMode::CaptureCheckpoint'));
  assert.match(mode, /DialogueStarted = CueTime >= 0\. \? CueTime : GetWorld\(\)->GetTimeSeconds\(\);/);
  assert.match(beat, /Now >= WindowEndsAt[\s\S]*?SetDialogue\(TEXT\([^\n]+\), Now\);/);
  assert.match(beat, /WindowEndsAt - Now <= SignalWarningMs \* \.001[\s\S]*?SetDialogue\(SignalWarning\(\), Now\);[\s\S]*?Now >= DialogueUntil/);
});

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
          static_assert(HandoffShelter == 9 && BreakContact == 11 && HandoffVolunteers == 16 && HandoffWard == 18);
          const auto leg = [](FProgress p) { return VPAdenDispatchData::Legs[RouteLeg(p)]; };
          const auto same = [](auto a, auto b) { return a.X == b.X && a.Y == b.Y; };
          for (const int people : {Families, Clinic})
          for (bool lit : {false, true})
          for (const int signal : {RadioOnce, Runners}) {
            FProgress progress;
            int chapters = 1, escorts = 0, mechanisms = 0, decisions = 0;
            int handoffs = 0, encounters = 0;
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
                const auto original = progress;
                auto first = original, second = original;
                assert(Decide(first, EInput::OptionOne, true, true));
                assert(Decide(second, EInput::OptionTwo, true, true));
                const auto a = leg(first), b = leg(second);
                assert(!same(a.Points[a.Length - 1], b.Points[b.Length - 1]));
                assert(progress == original);
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
              } else if (type == EMode::Handoff) {
                assert(!BeginEscort(progress));
                assert(!Interact(progress, true, lit));
                assert(!FinishHandoff(progress, false));
                assert(FinishHandoff(progress, true));
                ++handoffs;
              } else if (type == EMode::Encounter) {
                const auto from = route.Points[route.Length - 2], to = route.Points[route.Length - 1];
                assert(std::hypot(from.X - to.X, from.Y - to.Y) > 1400.);
                assert(EncounterSize(progress) == (beat == SecureLane && signal == RadioOnce ? 2 : 1));
                assert(!Interact(progress, true, lit));
                assert(!FinishEncounter(progress, 1, true));
                assert(!FinishEncounter(progress, 0, false));
                assert(FinishEncounter(progress, 0, true));
                ++encounters;
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
            assert(chapters == 12 && escorts == 4 && handoffs == 3 && encounters == 3 && mechanisms == 5 && decisions == 2);
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
          const FProgress timed{ReachSignal, Clinic, NoPassage, NoRelay};
          const FCheckpoint fresh{timed, SignalWindowMs}, fading{timed, SignalWarningMs}, expired{timed, 0};
          assert(RecoveryBackup(fresh, fading) == fading);
          assert(RecoveryBackup(fading, expired) == expired);
          assert(RecoveryBackup(expired, fresh) == expired);
          assert(RecoveryBackup(expired, {{OpenShelter, Clinic, BackStreet, NoRelay}, 0}) == expired);
          const FCheckpoint prior{{RestorePower, Clinic, NoPassage, NoRelay}, 0};
          assert(RecoveryBackup(prior, fresh) == prior);
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

test('the 720-minute screenplay budgets the new activity mix, sets up the alliance, and resolves it in CH12', () => {
  const screenplay = fs.readFileSync(path.resolve(__dirname, '../docs/ADEN_CAMPAIGN_SCREENPLAY_KO.md'), 'utf8')
    .replaceAll('\r\n', '\n');
  const scenes = [...screenplay.matchAll(/^### CH(\d{2}) · .* — (\d+)분\n([\s\S]*?)(?=^### CH|^## 플레이로|$(?![\s\S]))/gm)];
  assert.deepEqual(scenes.map(scene => +scene[1]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(scenes.reduce((sum, scene) => sum + +scene[2], 0), 720);
  for (const scene of scenes) {
    const budget = [...scene[3].matchAll(/^\d\. \*\*.*? (\d+)분\.\*\*/gm)].map(line => +line[1]);
    assert.equal(budget.length, 4, `CH${scene[1]} scenes`);
    assert.equal(budget.reduce((sum, time) => sum + time, 0), +scene[2], `CH${scene[1]} duration`);
  }
  assert.match(scenes[0][3], /한국, 출국 전[\s\S]*김 요원님/);
  assert.match(scenes[1][3], /현장 공조 확인[\s\S]*첫 교전/);
  assert.match(scenes.at(-1)[3], /두 소대가 답한다[\s\S]*무전기를 건네는[\s\S]*마라 씨는 남으셨고요[\s\S]*들려요/);

  const chapterMix = [...screenplay.matchAll(/^\| CH(\d{2}) \| (\d+:\d{2}) \| (\d+:\d{2}) \| (\d+:\d{2}) \| (\d+:\d{2}) \| (\d+:\d{2}) \|$/gm)];
  const seconds = clock => {
    const [minutes, remainder] = clock.split(':').map(Number);
    assert.ok(remainder < 60);
    return minutes * 60 + remainder;
  };
  assert.deepEqual(chapterMix.map(row => row[1]), scenes.map(scene => scene[1]));
  const categoryTotals = [0, 0, 0, 0];
  for (const [index, row] of chapterMix.entries()) {
    const activity = row.slice(2, 6).map(seconds);
    assert.equal(activity.reduce((sum, time) => sum + time), seconds(row[6]), `CH${row[1]} activity budget`);
    assert.equal(seconds(row[6]), +scenes[index][2] * 60);
    activity.forEach((time, category) => { categoryTotals[category] += time; });
  }
  assert.deepEqual(categoryTotals, [55, 12, 25, 8].map(share => 720 * 60 * share / 100));
});
