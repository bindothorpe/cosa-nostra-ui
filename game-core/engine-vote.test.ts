import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_CONFIG,
  advancePhase,
  cloneRoomConfig,
  defaultRoleCountsFor,
  reduce,
} from "./index";
import type { RoomConfig, RoomState, TieRule } from "./index";
import {
  NOW,
  castTiedVotes,
  castVotes,
  castVotesToEliminate,
  livingPlayers,
  player,
  run,
  startedRoom,
  toVoting,
} from "./test-helpers";

function configWithTie(tieRule: TieRule): RoomConfig {
  return {
    ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    rolePreset: "custom",
    roleCounts: defaultRoleCountsFor(8) ?? DEFAULT_ROOM_CONFIG.roleCounts,
    tieRule,
  };
}

function votingRoom(
  tieRule: TieRule,
  seed = 777,
): RoomState {
  return toVoting(
    startedRoom(8, { seed, config: configWithTie(tieRule) }),
  );
}

describe("vote resolution", () => {
  it("records the tally and eliminates a clear majority", () => {
    const voting = toVoting(startedRoom(8));
    const target = livingPlayers(voting)[1];

    const resolved = castVotesToEliminate(voting, target.id, NOW + 10_000);

    expect(resolved.phase).toBe("voteResult");
    expect(player(resolved, target.id).alive).toBe(false);
    expect(player(resolved, target.id).eliminatedAt).toEqual({
      phase: "voting",
      round: 1,
      cause: "vote",
    });
    expect(resolved.voteTally?.[target.id]).toBe(7);
  });

  it("counts no votes as no elimination", () => {
    const voting = toVoting(startedRoom(8));
    const resolved = advancePhase(voting, NOW + 10_000);

    expect(resolved.phase).toBe("voteResult");
    expect(resolved.voteTally).toEqual({});
    expect(resolved.eliminatedIds).toEqual([]);
    expect(resolved.winner).toBeNull();
  });

  it("keeps the last vote from a player", () => {
    let voting = toVoting(startedRoom(8));
    const [voter, firstTarget, secondTarget] = livingPlayers(voting);

    voting = run(
      voting,
      voter.id,
      { type: "castVote", targetId: firstTarget.id },
      NOW + 1_000,
    );
    voting = run(
      voting,
      voter.id,
      { type: "castVote", targetId: secondTarget.id },
      NOW + 2_000,
    );

    expect(voting.votes[voter.id]).toBe(secondTarget.id);
    expect(voting.readyIds.filter((id) => id === voter.id)).toHaveLength(1);
  });

  it("rejects self votes, dead voters, and wrong phases", () => {
    const voting = toVoting(startedRoom(8));
    const [voter, target] = livingPlayers(voting);

    expect(
      reduce(
        voting,
        voter.id,
        { type: "castVote", targetId: voter.id },
        NOW + 1_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_TARGET" } });

    const withDead = structuredClone(voting);
    const dead = withDead.players.find(
      (candidate) => candidate.id !== voter.id,
    );
    if (!dead) throw new Error("expected a dead candidate");
    dead.alive = false;

    expect(
      reduce(
        withDead,
        dead.id,
        { type: "castVote", targetId: target.id },
        NOW + 1_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_ALIVE" } });

    expect(
      reduce(
        startedRoom(8),
        voter.id,
        { type: "castVote", targetId: target.id },
        NOW + 1_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "WRONG_PHASE" } });
  });
});

describe("tie rules", () => {
  it("no-elimination leaves a tie unresolved", () => {
    const voting = votingRoom("no-elimination");
    const [firstTarget, secondTarget] = livingPlayers(voting);

    const resolved = castTiedVotes(
      voting,
      firstTarget.id,
      secondTarget.id,
      NOW + 10_000,
    );

    expect(resolved.phase).toBe("voteResult");
    expect(resolved.eliminatedIds).toEqual([]);
    expect(resolved.winner).toBeNull();
    expect(resolved.voteTally).toEqual({
      [firstTarget.id]: 4,
      [secondTarget.id]: 4,
    });
  });

  it("random picks exactly one tied player with the seeded RNG", () => {
    const first = votingRoom("random", 4242);
    const second = votingRoom("random", 4242);

    const firstTargets = livingPlayers(first).slice(0, 2);
    const secondTargets = livingPlayers(second).slice(0, 2);
    const firstResolved = castTiedVotes(
      first,
      firstTargets[0].id,
      firstTargets[1].id,
      NOW + 10_000,
    );
    const secondResolved = castTiedVotes(
      second,
      secondTargets[0].id,
      secondTargets[1].id,
      NOW + 10_000,
    );

    expect(firstResolved.eliminatedIds).toHaveLength(1);
    expect(firstResolved.eliminatedIds).toEqual(secondResolved.eliminatedIds);
    expect(firstTargets.map((candidate) => candidate.id)).toContain(
      firstResolved.eliminatedIds[0],
    );
    expect(first.seed).not.toBe(firstResolved.seed);
  });

  it("random tie-breaks differently for a different seed", () => {
    const outcomes = new Set<string>();

    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const voting = votingRoom("random", seed);
      const [firstTarget, secondTarget] = livingPlayers(voting);
      const resolved = castTiedVotes(
        voting,
        firstTarget.id,
        secondTarget.id,
        NOW + 10_000,
      );
      outcomes.add(resolved.eliminatedIds[0] ?? "none");
    }

    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("revote returns to voting with tied candidates and one revote maximum", () => {
    const voting = votingRoom("revote");
    const [firstTarget, secondTarget] = livingPlayers(voting);

    const revote = castTiedVotes(
      voting,
      firstTarget.id,
      secondTarget.id,
      NOW + 10_000,
    );
    const lastVoteAt =
      NOW + 10_000 + (livingPlayers(voting).length - 1);

    expect(revote.phase).toBe("voting");
    expect(revote.revoteUsed).toBe(true);
    expect([...(revote.revoteCandidates ?? [])].sort()).toEqual(
      [firstTarget.id, secondTarget.id].sort(),
    );
    expect(revote.votes).toEqual({});
    expect(revote.readyIds).toEqual([]);
    expect(revote.phaseEndsAt).toBe(
      lastVoteAt + revote.config.phaseDurations.voting,
    );

    const secondTie = castTiedVotes(
      revote,
      firstTarget.id,
      secondTarget.id,
      NOW + 20_000,
    );

    expect(secondTie.phase).toBe("voteResult");
    expect(secondTie.eliminatedIds).toEqual([]);
    expect(secondTie.revoteUsed).toBe(true);
  });

  it("revote restricts votes to the tied candidates", () => {
    const voting = votingRoom("revote");
    const [firstTarget, secondTarget, outsider] = livingPlayers(voting);

    const revote = castTiedVotes(
      voting,
      firstTarget.id,
      secondTarget.id,
      NOW + 10_000,
    );
    const outsiderVote = reduce(
      revote,
      firstTarget.id,
      { type: "castVote", targetId: outsider.id },
      NOW + 11_000,
    );

    expect(outsiderVote.ok).toBe(false);
    if (!outsiderVote.ok) {
      expect(outsiderVote.error.code).toBe("INVALID_TARGET");
    }

    const candidateVote = reduce(
      revote,
      firstTarget.id,
      { type: "castVote", targetId: secondTarget.id },
      NOW + 12_000,
    );
    expect(candidateVote.ok).toBe(true);
  });

  it("revote can produce an elimination", () => {
    const voting = votingRoom("revote");
    const [firstTarget, secondTarget] = livingPlayers(voting);

    const revote = castTiedVotes(
      voting,
      firstTarget.id,
      secondTarget.id,
      NOW + 10_000,
    );

    const assignments: Array<readonly [string, string]> =
      livingPlayers(revote).map((voter) => [
        voter.id,
        voter.id === firstTarget.id ? secondTarget.id : firstTarget.id,
      ]);

    const resolved = castVotes(revote, assignments, NOW + 20_000);

    expect(resolved.phase).toBe("voteResult");
    expect(resolved.eliminatedIds).toEqual([firstTarget.id]);
    expect(player(resolved, firstTarget.id).alive).toBe(false);
  });
});
