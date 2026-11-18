import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_CONFIG,
  ROLE_IDS,
  advancePhase,
  cloneRoomConfig,
  defaultRoleCountsFor,
  isActiveRole,
  reduce,
  tick,
} from "./index";
import type { RoomConfig, RoomState } from "./index";
import {
  NOW,
  castVotesToEliminate,
  livingPlayers,
  makeRoom,
  player,
  playerWithRole,
  readyAll,
  run,
  startedRoom,
  toVoting,
} from "./test-helpers";

function customConfig(count: number): RoomConfig {
  return {
    ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    rolePreset: "custom",
    roleCounts: defaultRoleCountsFor(count) ?? DEFAULT_ROOM_CONFIG.roleCounts,
  };
}

describe("starting the game", () => {
  it("deals roles, enters roleReveal, and sets the hard timeout", () => {
    const state = startedRoom(8);

    expect(state.phase).toBe("roleReveal");
    expect(state.round).toBe(1);
    expect(state.phaseEndsAt).toBe(
      NOW + 100 + state.config.phaseDurations.roleReveal,
    );
    expect(state.winner).toBeNull();
    expect(state.eliminatedIds).toEqual([]);

    const counts = defaultRoleCountsFor(8);
    for (const roleId of ROLE_IDS) {
      const expected = counts?.[roleId] ?? 0;
      expect(
        state.players.filter((player) => player.roleId === roleId),
      ).toHaveLength(expected);
    }

    for (const player of state.players) {
      expect(player.alive).toBe(true);
      expect(player.faction).toBe(
        roleIdFaction(player.roleId),
      );
    }
  });

  it("recomputes the default composition for the actual joined count", () => {
    const state = startedRoom(9);
    expect(state.config.roleCounts).toEqual(defaultRoleCountsFor(9));
    expect(state.players).toHaveLength(9);
  });

  it("refuses a custom composition that does not sum to the joined count", () => {
    const state = makeRoom(8, { config: customConfig(9) });
    const result = reduce(state, "p1", { type: "startGame" }, NOW + 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ROLE_COUNT_MISMATCH");
    }
  });

  it("refuses to start below 3 players", () => {
    const state = makeRoom(2);
    const result = reduce(state, "p1", { type: "startGame" }, NOW + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_ENOUGH_PLAYERS");
    }
  });
});

function roleIdFaction(roleId: string): string {
  switch (roleId) {
    case "godfather":
    case "consigliere":
    case "framer":
      return "mafia";
    case "jester":
    case "executioner":
      return "neutral";
    default:
      return "town";
  }
}

describe("phase progression", () => {
  it("walks roleReveal -> night -> nightReport -> day -> voting -> voteResult -> night", () => {
    let state = startedRoom(8);

    state = readyAll(state);
    expect(state.phase).toBe("night");
    expect(state.round).toBe(1);
    expect(state.phaseEndsAt).toBe(
      state.updatedAt + state.config.phaseDurations.night,
    );

    state = advancePhase(state, NOW + 10_000);
    expect(state.phase).toBe("nightReport");
    expect(state.pendingNightResult).toEqual({
      deaths: [],
      saved: [],
      investigations: {},
      exactInvestigations: {},
    });
    expect(state.round).toBe(1);
    expect(state.phaseEndsAt).toBe(
      NOW + 10_000 + state.config.phaseDurations.nightReport,
    );

    state = readyAll(state);
    expect(state.phase).toBe("dayDiscussion");
    expect(state.whispersSentThisDay).toEqual(
      Object.fromEntries(state.players.map((player) => [player.id, 0])),
    );

    state = readyAll(state);
    expect(state.phase).toBe("voting");

    const target = livingPlayers(state)[1];
    state = castVotesToEliminate(state, target.id, NOW + 20_000);
    expect(state.phase).toBe("voteResult");
    expect(state.round).toBe(1);

    state = readyAll(state, NOW + 21_000);
    expect(state.phase).toBe("night");
    expect(state.round).toBe(2);
  });

  it("increments the round only when night follows voteResult", () => {
    let state = startedRoom(8);
    state = readyAll(state);
    expect(state.round).toBe(1);
    state = advancePhase(state, NOW + 1_000);
    expect(state.round).toBe(1);
    state = advancePhase(state, NOW + 2_000);
    expect(state.round).toBe(1);
    state = advancePhase(state, NOW + 3_000);
    expect(state.round).toBe(1);
    state = advancePhase(state, NOW + 4_000);
    expect(state.phase).toBe("voteResult");
    expect(state.round).toBe(1);
    state = advancePhase(state, NOW + 5_000);
    expect(state.phase).toBe("night");
    expect(state.round).toBe(2);
  });

  it("does not advance lobby or gameOver", () => {
    const lobby = makeRoom(8);
    expect(advancePhase(lobby, NOW + 1)).toBe(lobby);

    const over: RoomState = { ...startedRoom(8), phase: "gameOver" };
    expect(advancePhase(over, NOW + 1)).toBe(over);
  });

  it("advances only when the hard timeout is reached", () => {
    const state = startedRoom(8);
    expect(tick(state, NOW + 1)).toBe(state);

    const due = state.phaseEndsAt ?? 0;
    const advanced = tick(state, due);
    expect(advanced.phase).toBe("night");
    expect(advanced).not.toBe(state);
  });

  it("resolves a timed-out night with no actions", () => {
    const state = startedRoom(8);
    const night = advancePhase(state, NOW + 1_000);
    const report = tick(night, night.phaseEndsAt ?? 0);

    expect(report.phase).toBe("nightReport");
    expect(report.pendingNightResult?.deaths).toEqual([]);
    expect(report.pendingNightResult?.saved).toEqual([]);
  });

  it("does not mutate the input state when advancing", () => {
    const state = startedRoom(8);
    const snapshot = structuredClone(state);
    advancePhase(state, NOW + 1);
    expect(state).toEqual(snapshot);
  });
});

describe("ready semantics", () => {
  it("lets an active role ready without acting", () => {
    let state = startedRoom(8);
    state = advancePhase(state, NOW + 1_000);
    const godfather = playerWithRole(state, "godfather");

    state = run(state, godfather.id, { type: "setReady" }, NOW + 2_000);

    expect(state.phase).toBe("night");
    expect(state.readyIds).toContain(godfather.id);
    expect(state.nightActions[godfather.id]).toBeUndefined();
    expect(isActiveRole(godfather.roleId)).toBe(true);
  });

  it("lets a passive role ready", () => {
    let state = startedRoom(8);
    state = advancePhase(state, NOW + 1_000);
    const villager = playerWithRole(state, "villager");

    state = run(state, villager.id, { type: "setReady" }, NOW + 2_000);
    expect(state.readyIds).toContain(villager.id);
  });

  it("marks a player ready when they submit a night action", () => {
    let state = startedRoom(8);
    state = advancePhase(state, NOW + 1_000);
    const detective = playerWithRole(state, "detective");
    const target = playerWithRole(state, "villager");

    state = run(
      state,
      detective.id,
      { type: "submitNightAction", kind: "investigate", targetId: target.id },
      NOW + 2_000,
    );

    expect(state.readyIds).toContain(detective.id);
    expect(state.nightActions[detective.id]).toMatchObject({
      kind: "investigate",
      targetId: target.id,
      submittedAt: NOW + 2_000,
    });
  });

  it("keeps the last valid night action", () => {
    let state = startedRoom(8);
    state = advancePhase(state, NOW + 1_000);
    const detective = playerWithRole(state, "detective");
    const [first, second] = state.players.filter(
      (player) => player.alive && player.id !== detective.id,
    );

    state = run(
      state,
      detective.id,
      { type: "submitNightAction", kind: "investigate", targetId: first.id },
      NOW + 2_000,
    );
    state = run(
      state,
      detective.id,
      { type: "submitNightAction", kind: "investigate", targetId: second.id },
      NOW + 3_000,
    );

    expect(state.nightActions[detective.id]?.targetId).toBe(second.id);
    expect(state.readyIds.filter((id) => id === detective.id)).toHaveLength(1);
  });

  it("clears readiness and the phase-local action on unsetReady", () => {
    let state = startedRoom(8);
    state = advancePhase(state, NOW + 1_000);
    const godfather = playerWithRole(state, "godfather");
    const target = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 2_000,
    );
    expect(state.nightActions[godfather.id]).toBeDefined();

    state = run(state, godfather.id, { type: "unsetReady" }, NOW + 3_000);
    expect(state.readyIds).not.toContain(godfather.id);
    expect(state.nightActions[godfather.id]).toBeUndefined();
  });

  it("clears a vote on unsetReady", () => {
    let state = startedRoom(8);
    state = toVoting(state);
    const [voter, target] = livingPlayers(state);

    state = run(
      state,
      voter.id,
      { type: "castVote", targetId: target.id },
      NOW + 4_000,
    );
    expect(state.votes[voter.id]).toBe(target.id);
    expect(state.readyIds).toContain(voter.id);

    state = run(state, voter.id, { type: "unsetReady" }, NOW + 5_000);
    expect(state.votes[voter.id]).toBeUndefined();
    expect(state.readyIds).not.toContain(voter.id);
  });

  it("rejects readiness in the lobby, voting, and gameOver", () => {
    const lobby = makeRoom(8);
    const lobbyResult = reduce(lobby, "p1", { type: "setReady" }, NOW + 1);
    expect(lobbyResult.ok).toBe(false);
    if (!lobbyResult.ok) {
      expect(lobbyResult.error.code).toBe("WRONG_PHASE");
    }

    const voting = toVoting(startedRoom(8));
    const votingResult = reduce(voting, "p1", { type: "setReady" }, NOW + 2);
    expect(votingResult.ok).toBe(false);
    if (!votingResult.ok) {
      expect(votingResult.error.code).toBe("WRONG_PHASE");
    }

    const over: RoomState = { ...startedRoom(8), phase: "gameOver" };
    const overResult = reduce(over, "p1", { type: "setReady" }, NOW + 3);
    expect(overResult.ok).toBe(false);
    if (!overResult.ok) {
      expect(overResult.error.code).toBe("WRONG_PHASE");
    }
  });

  it("excludes dead players from the all-ready check", () => {
    let state = startedRoom(8);
    state = advancePhase(state, NOW + 1_000);

    const godfather = playerWithRole(state, "godfather");
    const victim = playerWithRole(state, "villager");
    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );

    for (const living of livingPlayers(state)) {
      state = run(state, living.id, { type: "setReady" }, NOW + 3_000);
    }
    expect(state.phase).toBe("nightReport");
    expect(player(state, victim.id).alive).toBe(false);
    expect(state.readyIds).toEqual([]);

    const deadReady = reduce(
      state,
      victim.id,
      { type: "setReady" },
      NOW + 4_000,
    );
    expect(deadReady.ok).toBe(false);
    if (!deadReady.ok) {
      expect(deadReady.error.code).toBe("NOT_ALIVE");
    }

    const livingIds = livingPlayers(state).map((candidate) => candidate.id);
    for (const playerId of livingIds) {
      state = run(state, playerId, { type: "setReady" }, NOW + 5_000);
    }
    expect(state.phase).toBe("dayDiscussion");
  });
});

describe("whisper phases", () => {
  it("allows whispers in every in-game phase after role reveal", () => {
    const roleReveal = startedRoom(8);
    const early = reduce(
      roleReveal,
      "p1",
      { type: "sendWhisper", toPlayerId: "p2", text: "Psst." },
      NOW + 1,
    );
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.error.code).toBe("WRONG_PHASE");
    }

    const night = advancePhase(roleReveal, NOW + 1_000);
    const nightReport = advancePhase(night, NOW + 2_000);
    const dayDiscussion = advancePhase(nightReport, NOW + 3_000);
    const voting = advancePhase(dayDiscussion, NOW + 4_000);
    const voteResult = advancePhase(voting, NOW + 5_000);

    const phases: Array<[string, RoomState]> = [
      ["night", night],
      ["nightReport", nightReport],
      ["dayDiscussion", dayDiscussion],
      ["voting", voting],
      ["voteResult", voteResult],
    ];

    for (const [phase, room] of phases) {
      expect(room.phase).toBe(phase);
      const sent = run(
        room,
        "p1",
        {
          type: "sendWhisper",
          toPlayerId: "p2",
          text: "Meet me at the docks.",
        },
        NOW + 6_000,
      );
      expect(sent.phase).toBe(phase);
      expect(sent.whispers).toHaveLength(1);
      expect(sent.whispers[0].messages).toHaveLength(1);
      expect(sent.whispersSentThisDay.p1).toBe(1);
    }

    const lobby = makeRoom(8);
    const lobbyResult = reduce(
      lobby,
      "p1",
      { type: "sendWhisper", toPlayerId: "p2", text: "Psst." },
      NOW + 7_000,
    );
    expect(lobbyResult.ok).toBe(false);
    if (!lobbyResult.ok) {
      expect(lobbyResult.error.code).toBe("WRONG_PHASE");
    }
  });
});
