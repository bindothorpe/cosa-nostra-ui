import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_CONFIG,
  advancePhase,
  cloneRoomConfig,
  defaultRoleCountsFor,
  project,
  reduce,
} from "./index";
import type { PlayerSummary, RoomConfig, RoomState } from "./index";
import {
  NOW,
  castVotesToEliminate,
  livingPlayers,
  makeRoom,
  markDead,
  playerWithRole,
  readyAll,
  run,
  startedRoom,
  toVoting,
} from "./test-helpers";

function dayRoom(): RoomState {
  let state = startedRoom(8);
  state = advancePhase(state, NOW + 1_000);
  state = advancePhase(state, NOW + 2_000);
  state = advancePhase(state, NOW + 3_000);
  return state;
}

function summaryFor(
  summaries: readonly PlayerSummary[],
  playerId: string,
): PlayerSummary {
  const summary = summaries.find((candidate) => candidate.id === playerId);
  if (!summary) {
    throw new Error(`No summary for ${playerId}`);
  }
  return summary;
}

function configWithoutVoteReveal(): RoomConfig {
  return {
    ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    rolePreset: "custom",
    roleCounts: defaultRoleCountsFor(8) ?? DEFAULT_ROOM_CONFIG.roleCounts,
    revealRoleOnVote: false,
  };
}

describe("projection basics", () => {
  it("uses the supplied server time, not the last update time", () => {
    const state = startedRoom(8);
    const view = project(state, "p1", 1_234_567_890);

    expect(view.serverNow).toBe(1_234_567_890);
    expect(view.serverNow).not.toBe(state.updatedAt);
  });

  it("marks the viewer and reports counts and readiness", () => {
    let state = startedRoom(8);
    state = run(state, "p1", { type: "setReady" }, NOW + 1_000);

    const view = project(state, "p1", NOW + 1_000);
    expect(view.isHost).toBe(true);
    expect(view.you.id).toBe("p1");
    expect(view.you.isYou).toBe(true);
    expect(view.you.roleId).toBe(view.yourRole);
    expect(view.livingCount).toBe(8);
    expect(view.readyIds).toEqual(["p1"]);
    expect(view.waitingCount).toBe(7);
  });

  it("never includes tokens or raw server state", () => {
    const state = startedRoom(8);
    const serialized = JSON.stringify(project(state, "p1", NOW));

    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("token:p1");
    expect(serialized).not.toContain("allPlayers");
    expect(serialized).not.toContain("schemaVersion");
  });

  it("exposes hostConfig only to the host in the lobby", () => {
    const lobby = structuredClone(startedRoom(8));
    lobby.phase = "lobby";

    const hostView = project(lobby, "p1", NOW);
    const guestView = project(lobby, "p2", NOW);

    expect(hostView.hostConfig).toEqual(lobby.config);
    expect("hostConfig" in guestView).toBe(false);
    expect("roleCounts" in guestView.config).toBe(false);

    const inGame = project(startedRoom(8), "p1", NOW);
    expect("hostConfig" in inGame).toBe(false);
  });
});

describe("role visibility matrix", () => {
  it("hides every other role from a town player", () => {
    const state = startedRoom(8);
    const town = playerWithRole(state, "villager");
    const view = project(state, town.id, NOW);

    expect(view.yourRole).toBe(town.roleId);
    expect(view.you.roleId).toBe(town.roleId);
    for (const summary of view.players) {
      if (summary.id === town.id) {
        expect(summary.roleId).toBe(town.roleId);
        expect(summary.faction).toBe(town.faction);
      } else {
        expect(summary.roleId).toBeNull();
        expect(summary.faction).toBeNull();
      }
    }
  });

  it("shows mafia teammates to mafia and hides town and neutral roles", () => {
    const state = startedRoom(8);
    const godfather = playerWithRole(state, "godfather");
    const framer = playerWithRole(state, "framer");
    const villager = playerWithRole(state, "villager");
    const jester = playerWithRole(state, "jester");
    const view = project(state, godfather.id, NOW);

    expect(summaryFor(view.players, framer.id).roleId).toBe("framer");
    expect(summaryFor(view.players, framer.id).faction).toBe("mafia");
    expect(summaryFor(view.players, villager.id).roleId).toBeNull();
    expect(summaryFor(view.players, jester.id).roleId).toBeNull();

    const framerView = project(state, framer.id, NOW);
    expect(summaryFor(framerView.players, godfather.id).roleId).toBe(
      "godfather",
    );
  });

  it("keeps teammate visibility for dead mafia", () => {
    const state = startedRoom(8);
    const godfather = playerWithRole(state, "godfather");
    const framer = playerWithRole(state, "framer");
    const deadFramer = markDead(state, [framer.id]);
    const view = project(deadFramer, framer.id, NOW);

    expect(summaryFor(view.players, godfather.id).roleId).toBe("godfather");
  });

  it("shows a dead town player only their own role", () => {
    let state = advancePhase(startedRoom(8), NOW + 1_000);
    const godfather = playerWithRole(state, "godfather");
    const victim = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    const view = project(state, victim.id, NOW + 3_000);
    expect(view.you.alive).toBe(false);
    expect(view.you.roleId).toBe(victim.roleId);
    for (const summary of view.players) {
      if (summary.id !== victim.id) {
        expect(summary.roleId).toBeNull();
      }
    }
  });

  it("reveals all roles at gameOver for living and dead players", () => {
    let state = toVoting(startedRoom(8));
    const jester = playerWithRole(state, "jester");
    state = castVotesToEliminate(state, jester.id, NOW + 10_000);
    state = readyAll(state, NOW + 11_000);
    expect(state.phase).toBe("gameOver");

    for (const viewer of livingPlayers(state).slice(0, 2)) {
      const view = project(state, viewer.id, NOW + 12_000);
      for (const summary of view.players) {
        expect(summary.roleId).not.toBeNull();
        expect(summary.faction).not.toBeNull();
      }
    }

    const deadView = project(state, jester.id, NOW + 12_000);
    for (const summary of deadView.players) {
      expect(summary.roleId).not.toBeNull();
    }
  });

  it("never reveals night-death roles", () => {
    let state = advancePhase(startedRoom(8), NOW + 1_000);
    const godfather = playerWithRole(state, "godfather");
    const victim = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    const other = playerWithRole(state, "detective");
    const view = project(state, other.id, NOW + 3_000);
    expect(summaryFor(view.players, victim.id).roleId).toBeNull();
    expect(view.nightReport).toEqual({ deaths: [victim.id] });
    expect(Object.keys(view.nightReport ?? {})).toEqual(["deaths"]);
    expect(JSON.stringify(view)).not.toContain("investigations");
  });

  it("reveals a voted-out role when configured", () => {
    let state = toVoting(startedRoom(8));
    const target = playerWithRole(state, "villager");
    state = castVotesToEliminate(state, target.id, NOW + 10_000);

    const viewer = livingPlayers(state)[0];
    const view = project(state, viewer.id, NOW + 10_000);
    expect(summaryFor(view.players, target.id).roleId).toBe("villager");
    expect(summaryFor(view.players, target.id).faction).toBe("town");
  });

  it("hides a voted-out role until gameOver when reveal is disabled", () => {
    let state = toVoting(
      startedRoom(8, { config: configWithoutVoteReveal() }),
    );
    const jester = playerWithRole(state, "jester");
    state = castVotesToEliminate(state, jester.id, NOW + 10_000);

    const viewer = livingPlayers(state)[0];
    const before = project(state, viewer.id, NOW + 10_000);
    expect(summaryFor(before.players, jester.id).roleId).toBeNull();

    state = readyAll(state, NOW + 11_000);
    expect(state.phase).toBe("gameOver");
    const after = project(state, viewer.id, NOW + 12_000);
    expect(summaryFor(after.players, jester.id).roleId).toBe("jester");
  });
});

describe("whisper projection and budget", () => {
  it("shows whisper threads only to their participants", () => {
    let state = dayRoom();
    state = run(
      state,
      "p1",
      { type: "sendWhisper", toPlayerId: "p2", text: "  Meet me at dusk.  " },
      NOW + 4_000,
    );

    const first = project(state, "p1", NOW + 4_000);
    const second = project(state, "p2", NOW + 4_000);
    const third = project(state, "p3", NOW + 4_000);

    expect(first.whispers).toHaveLength(1);
    expect(second.whispers).toHaveLength(1);
    expect(first.whispers[0].messages[0].text).toBe("Meet me at dusk.");
    expect(second.whispers[0].messages[0].fromPlayerId).toBe("p1");
    expect(third.whispers).toEqual([]);

    expect(first.whispersLeft).toBe(2);
    expect(second.whispersLeft).toBe(3);
  });

  it("enforces and resets the daily whisper budget", () => {
    let state = dayRoom();

    for (let index = 0; index < 3; index += 1) {
      state = run(
        state,
        "p1",
        { type: "sendWhisper", toPlayerId: "p2", text: `message ${index}` },
        NOW + 4_000 + index,
      );
    }

    const exceeded = reduce(
      state,
      "p1",
      { type: "sendWhisper", toPlayerId: "p2", text: "one too many" },
      NOW + 5_000,
    );
    expect(exceeded.ok).toBe(false);
    if (!exceeded.ok) {
      expect(exceeded.error.code).toBe("BUDGET_EXHAUSTED");
    }
    expect(project(state, "p1", NOW + 5_000).whispersLeft).toBe(0);

    state = advancePhase(state, NOW + 6_000);
    state = advancePhase(state, NOW + 7_000);
    state = advancePhase(state, NOW + 8_000);
    state = advancePhase(state, NOW + 9_000);
    state = advancePhase(state, NOW + 10_000);
    expect(state.phase).toBe("dayDiscussion");

    state = run(
      state,
      "p1",
      { type: "sendWhisper", toPlayerId: "p2", text: "new day" },
      NOW + 11_000,
    );
    expect(project(state, "p1", NOW + 11_000).whispersLeft).toBe(2);
  });

  it("rejects whispers before the game starts and to the dead", () => {
    const roleReveal = startedRoom(8);
    const result = reduce(
      roleReveal,
      "p1",
      { type: "sendWhisper", toPlayerId: "p2", text: "hello" },
      NOW + 1_000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("WRONG_PHASE");
    }

    const day = dayRoom();
    const dead = markDead(day, ["p2"]);
    const toDead = reduce(
      dead,
      "p1",
      { type: "sendWhisper", toPlayerId: "p2", text: "hello" },
      NOW + 1_000,
    );
    expect(toDead.ok).toBe(false);
    if (!toDead.ok) {
      expect(toDead.error.code).toBe("INVALID_TARGET");
    }
  });

  it("gives dead players no whisper budget", () => {
    const state = markDead(dayRoom(), ["p1"]);
    expect(project(state, "p1", NOW).whispersLeft).toBe(0);
  });
});

describe("graveyard projection", () => {
  it("is empty for living players and visible to the dead", () => {
    let state = advancePhase(startedRoom(8), NOW + 1_000);
    const godfather = playerWithRole(state, "godfather");
    const victim = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);
    state = run(
      state,
      victim.id,
      { type: "sendGraveyardMessage", text: "  Remember my name.  " },
      NOW + 4_000,
    );

    const deadView = project(state, victim.id, NOW + 4_000);
    const livingView = project(state, "p1", NOW + 4_000);

    expect(deadView.graveyard).toHaveLength(1);
    expect(deadView.graveyard[0]).toMatchObject({
      playerId: victim.id,
      text: "Remember my name.",
    });
    expect(livingView.graveyard).toEqual([]);
  });

  it("is read-only and visible to everyone at gameOver", () => {
    let state = advancePhase(startedRoom(8), NOW + 1_000);
    const godfather = playerWithRole(state, "godfather");
    const victim = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);
    state = run(
      state,
      victim.id,
      { type: "sendGraveyardMessage", text: "See you on the other side." },
      NOW + 4_000,
    );

    state = readyAll(state, NOW + 5_000);
    state = readyAll(state, NOW + 6_000);
    const jester = playerWithRole(state, "jester");
    state = castVotesToEliminate(state, jester.id, NOW + 7_000);
    state = readyAll(state, NOW + 8_000);
    expect(state.phase).toBe("gameOver");

    const livingView = project(state, godfather.id, NOW + 9_000);
    expect(livingView.graveyard).toHaveLength(1);
  });

  it("rejects graveyard messages from living players and at gameOver", () => {
    const day = dayRoom();
    const living = reduce(
      day,
      "p1",
      { type: "sendGraveyardMessage", text: "hello" },
      NOW + 1_000,
    );
    expect(living.ok).toBe(false);
    if (!living.ok) {
      expect(living.error.code).toBe("NOT_DEAD");
    }

    const over: RoomState = { ...day, phase: "gameOver" };
    const dead = markDead(over, ["p1"]);
    const atGameOver = reduce(
      dead,
      "p1",
      { type: "sendGraveyardMessage", text: "hello" },
      NOW + 2_000,
    );
    expect(atGameOver.ok).toBe(false);
    if (!atGameOver.ok) {
      expect(atGameOver.error.code).toBe("WRONG_PHASE");
    }
  });
});

describe("alerts and action privacy", () => {
  it("keeps private investigation alerts to the detective", () => {
    let state = advancePhase(startedRoom(8), NOW + 1_000);
    const detective = playerWithRole(state, "detective");
    const framer = playerWithRole(state, "framer");
    const villager = playerWithRole(state, "villager");

    state = run(
      state,
      detective.id,
      { type: "submitNightAction", kind: "investigate", targetId: framer.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    const detectiveView = project(state, detective.id, NOW + 3_000);
    const villagerView = project(state, villager.id, NOW + 3_000);
    const framerView = project(state, framer.id, NOW + 3_000);

    expect(
      detectiveView.alerts.some((alert) => alert.kind === "investigation"),
    ).toBe(true);
    expect(
      villagerView.alerts.some((alert) => alert.kind === "investigation"),
    ).toBe(false);
    expect(
      framerView.alerts.some((alert) => alert.kind === "investigation"),
    ).toBe(false);
  });

  it("reveals only the viewer's own action", () => {
    let state = advancePhase(startedRoom(8), NOW + 1_000);
    const godfather = playerWithRole(state, "godfather");
    const framer = playerWithRole(state, "framer");
    const target = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 2_000,
    );

    const godfatherView = project(state, godfather.id, NOW + 2_000);
    const framerView = project(state, framer.id, NOW + 2_000);
    const townView = project(state, target.id, NOW + 2_000);

    expect(godfatherView.yourAction).toMatchObject({
      kind: "kill",
      targetId: target.id,
    });
    expect(framerView.yourAction).toBeNull();
    expect(townView.yourAction).toBeNull();

    expect(framerView.mafiaKill).toMatchObject({
      actorId: godfather.id,
      targetId: target.id,
    });
    expect(godfatherView.mafiaKill).toMatchObject({
      actorId: godfather.id,
      targetId: target.id,
    });
    expect("mafiaKill" in townView).toBe(false);
  });

  it("hides the vote tally during voting and publishes it at voteResult", () => {
    let state = toVoting(startedRoom(8));
    const [voter, target] = livingPlayers(state);

    state = run(
      state,
      voter.id,
      { type: "castVote", targetId: target.id },
      NOW + 1_000,
    );
    const during = project(state, voter.id, NOW + 1_000);
    expect(during.voteTally).toBeNull();
    expect(during.yourVote).toBe(target.id);

    state = castVotesToEliminate(state, target.id, NOW + 2_000);
    const after = project(state, voter.id, NOW + 2_000);
    expect(after.voteTally).not.toBeNull();
    expect(after.voteTally?.[target.id]).toBe(7);
  });
});

describe("action availability", () => {
  it("computes canStart only for the host in a valid lobby", () => {
    const lobby = makeRoom(8);
    expect(project(lobby, "p1", NOW).canStart).toBe(true);
    expect(project(lobby, "p2", NOW).canStart).toBe(false);
    expect(project(startedRoom(8), "p1", NOW).canStart).toBe(false);
  });

  it("computes canAct for living active roles at night", () => {
    const night = advancePhase(startedRoom(8), NOW + 1_000);
    const godfather = playerWithRole(night, "godfather");
    const villager = playerWithRole(night, "villager");

    expect(project(night, godfather.id, NOW).canAct).toBe(true);
    expect(project(night, villager.id, NOW).canAct).toBe(false);

    const withDeadGodfather = markDead(night, [godfather.id]);
    expect(project(withDeadGodfather, godfather.id, NOW).canAct).toBe(false);
  });

  it("computes canVote for living players during voting", () => {
    const voting = toVoting(startedRoom(8));
    const [voter] = livingPlayers(voting);
    expect(project(voting, voter.id, NOW).canVote).toBe(true);

    const withDead = markDead(voting, [voter.id]);
    expect(project(withDead, voter.id, NOW).canVote).toBe(false);
  });
});
