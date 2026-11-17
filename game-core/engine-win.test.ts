import { describe, expect, it } from "vitest";
import { advancePhase, reduce } from "./index";
import type { RoomState } from "./index";
import {
  NOW,
  castVotesToEliminate,
  forceNight,
  forceVoting,
  livingPlayers,
  markDead,
  nextVoting,
  playerWithRole,
  readyAll,
  run,
  startedRoom,
  toVoting,
} from "./test-helpers";

function mafiaIds(state: RoomState): string[] {
  return state.players
    .filter((player) => player.faction === "mafia")
    .map((player) => player.id);
}

describe("win conditions", () => {
  it("town wins when the last mafia is voted out", () => {
    let state = toVoting(startedRoom(8));
    const [godfatherId, framerId] = mafiaIds(state);

    state = castVotesToEliminate(state, godfatherId, NOW + 10_000);
    expect(state.phase).toBe("voteResult");
    expect(state.winner).toBeNull();

    state = nextVoting(state, NOW + 20_000);
    state = castVotesToEliminate(state, framerId, NOW + 30_000);

    expect(state.phase).toBe("voteResult");
    expect(state.winner).toEqual({ faction: "town" });
    expect(
      state.alertsByPlayer[state.players[0].id].some(
        (alert) =>
          alert.kind === "win" && alert.detailKey === "Alerts.win.town",
      ),
    ).toBe(true);
  });

  it("mafia wins at parity with living non-mafia", () => {
    let state = toVoting(startedRoom(8));
    const townTargets = state.players
      .filter((player) => player.faction === "town")
      .slice(0, 4);

    for (let index = 0; index < townTargets.length; index += 1) {
      if (index > 0) {
        state = nextVoting(state, NOW + index * 10_000);
      }
      state = castVotesToEliminate(
        state,
        townTargets[index].id,
        NOW + index * 10_000 + 5_000,
      );
    }

    expect(state.phase).toBe("voteResult");
    expect(state.winner).toEqual({ faction: "mafia" });
  });

  it("jester wins when voted out and gameOver follows the result screen", () => {
    let state = toVoting(startedRoom(8));
    const jester = playerWithRole(state, "jester");

    state = castVotesToEliminate(state, jester.id, NOW + 10_000);

    expect(state.phase).toBe("voteResult");
    expect(state.winner).toEqual({
      faction: "neutral",
      playerId: jester.id,
      reason: "jester",
    });

    state = readyAll(state, NOW + 11_000);
    expect(state.phase).toBe("gameOver");
    expect(state.phaseEndsAt).toBeNull();
    expect(state.winner).toEqual({
      faction: "neutral",
      playerId: jester.id,
      reason: "jester",
    });
  });

  it("does not let a jester killed at night win", () => {
    let state = advancePhase(startedRoom(8), NOW + 1_000);
    const godfather = playerWithRole(state, "godfather");
    const jester = playerWithRole(state, "jester");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: jester.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    expect(state.phase).toBe("nightReport");
    expect(state.winner).toBeNull();
    expect(state.eliminatedIds).toContain(jester.id);
  });

  it("prioritises jester over simultaneous mafia parity", () => {
    let state = startedRoom(8);
    const jester = playerWithRole(state, "jester");
    const livingTown = state.players.filter(
      (player) => player.faction === "town",
    );
    const keepAlive = new Set([
      ...mafiaIds(state),
      jester.id,
      livingTown[0].id,
    ]);
    const toRemove = state.players
      .filter((player) => !keepAlive.has(player.id))
      .map((player) => player.id);

    state = forceVoting(markDead(state, toRemove), NOW + 5_000);
    expect(livingPlayers(state)).toHaveLength(4);

    state = castVotesToEliminate(state, jester.id, NOW + 10_000);

    expect(state.winner).toEqual({
      faction: "neutral",
      playerId: jester.id,
      reason: "jester",
    });
  });

  it("sets the winner during nightReport and enters gameOver when it ends", () => {
    let state = startedRoom(8);
    const town = state.players.filter((player) => player.faction === "town");
    const nonJesterTown = town.filter(
      (player) => player.roleId !== "jester",
    );
    const toRemove = nonJesterTown.slice(0, 3).map((player) => player.id);

    state = forceNight(markDead(state, toRemove), NOW + 5_000);
    const godfather = playerWithRole(state, "godfather");
    const victim = state.players.find(
      (player) => player.alive && player.faction === "town",
    );
    if (!victim) {
      throw new Error("Expected a living town player");
    }

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 6_000,
    );
    state = advancePhase(state, NOW + 7_000);

    expect(state.phase).toBe("nightReport");
    expect(state.winner).toEqual({ faction: "mafia" });

    state = advancePhase(state, NOW + 8_000);
    expect(state.phase).toBe("gameOver");
  });

  it("allows no commands after gameOver", () => {
    let state = toVoting(startedRoom(8));
    const jester = playerWithRole(state, "jester");
    state = castVotesToEliminate(state, jester.id, NOW + 10_000);
    state = readyAll(state, NOW + 11_000);
    expect(state.phase).toBe("gameOver");

    expect(
      reduce(state, "p1", { type: "setReady" }, NOW + 12_000),
    ).toMatchObject({ ok: false, error: { code: "WRONG_PHASE" } });
    expect(
      reduce(state, "p1", { type: "startGame" }, NOW + 12_000),
    ).toMatchObject({ ok: false, error: { code: "WRONG_PHASE" } });
    expect(
      reduce(
        state,
        "p1",
        { type: "sendGraveyardMessage", text: "hello" },
        NOW + 12_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "WRONG_PHASE" } });
  });
});
