import { describe, expect, it } from "vitest";
import type { Command, PlayerId, RoomState } from "./index";
import {
  NOW,
  livingPlayers,
  makeRoom,
  playerWithRole,
  run,
  startedRoom,
} from "./test-helpers";

interface Step {
  playerId: PlayerId;
  command: Command;
  now: number;
}

function rolesByPlayer(state: RoomState): Record<PlayerId, string> {
  return Object.fromEntries(
    state.players.map((player) => [player.id, player.roleId]),
  );
}

function replay(initial: RoomState, steps: readonly Step[]): RoomState {
  let state = initial;
  for (const step of steps) {
    state = run(state, step.playerId, step.command, step.now);
  }
  return state;
}

function buildFullGame(): {
  steps: Step[];
  initial: RoomState;
  states: RoomState[];
} {
  const initial = makeRoom(8, { seed: 2024 });
  const steps: Step[] = [];
  const states: RoomState[] = [initial];
  let state = initial;
  let clock = NOW + 1_000;

  const nextNow = (): number => {
    clock += 100;
    return clock;
  };

  const apply = (playerId: PlayerId, command: Command): void => {
    steps.push({ playerId, command, now: nextNow() });
    state = run(state, playerId, command, clock);
    states.push(state);
  };

  const readyLiving = (): void => {
    const ids = state.players
      .filter(
        (player) => player.alive && !state.readyIds.includes(player.id),
      )
      .map((player) => player.id);
    for (const playerId of ids) {
      apply(playerId, { type: "setReady" });
    }
  };

  const voteOut = (targetId: PlayerId): void => {
    const voters = livingPlayers(state);
    const fallback = voters.find((player) => player.id !== targetId);
    if (!fallback) {
      throw new Error("No fallback voter");
    }
    for (const voter of voters) {
      apply(voter.id, {
        type: "castVote",
        targetId: voter.id === targetId ? fallback.id : targetId,
      });
    }
  };

  apply("p1", { type: "startGame" });

  const godfather = playerWithRole(state, "godfather");
  const framer = playerWithRole(state, "framer");
  const detective = playerWithRole(state, "detective");
  const doctor = playerWithRole(state, "doctor");
  // Any living town player works as the protected victim, as long as it is
  // neither the doctor (self-protection is rejected) nor a whisper participant.
  const victim = state.players.find(
    (player) =>
      player.faction === "town" &&
      player.roleId !== "doctor" &&
      player.id !== "p1" &&
      player.id !== "p2",
  );
  if (!victim) {
    throw new Error("Expected an eligible town victim");
  }

  readyLiving();
  expect(state.phase).toBe("night");

  apply(godfather.id, {
    type: "submitNightAction",
    kind: "kill",
    targetId: victim.id,
  });
  apply(framer.id, {
    type: "submitNightAction",
    kind: "frame",
    targetId: detective.id,
  });
  apply(detective.id, {
    type: "submitNightAction",
    kind: "investigate",
    targetId: framer.id,
  });
  apply(doctor.id, {
    type: "submitNightAction",
    kind: "protect",
    targetId: victim.id,
  });
  readyLiving();
  expect(state.phase).toBe("nightReport");
  expect(state.pendingNightResult?.saved).toEqual([victim.id]);

  readyLiving();
  expect(state.phase).toBe("dayDiscussion");

  apply("p1", { type: "sendWhisper", toPlayerId: "p2", text: "Watch the framer." });

  readyLiving();
  expect(state.phase).toBe("voting");

  voteOut(framer.id);
  expect(state.phase).toBe("voteResult");
  expect(state.winner).toBeNull();

  readyLiving();
  expect(state.phase).toBe("night");
  expect(state.round).toBe(2);

  const nightTwoVictim = state.players.find(
    (player) =>
      player.alive && player.faction === "town" && player.id !== godfather.id,
  );
  if (!nightTwoVictim) {
    throw new Error("Expected a living town player");
  }

  apply(godfather.id, {
    type: "submitNightAction",
    kind: "kill",
    targetId: nightTwoVictim.id,
  });
  readyLiving();
  expect(state.phase).toBe("nightReport");

  readyLiving();
  expect(state.phase).toBe("dayDiscussion");
  readyLiving();
  expect(state.phase).toBe("voting");

  voteOut(godfather.id);
  expect(state.phase).toBe("voteResult");
  expect(state.winner).toEqual({ faction: "town" });

  readyLiving();
  expect(state.phase).toBe("gameOver");

  return { steps, initial, states };
}

describe("deterministic replay", () => {
  it("deals the same roles for the same seed", () => {
    const first = startedRoom(8, { seed: 90210 });
    const second = startedRoom(8, { seed: 90210 });

    expect(rolesByPlayer(first)).toEqual(rolesByPlayer(second));
    expect(first.seed).toBe(second.seed);
  });

  it("produces different role assignments across seeds", () => {
    const assignments = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
        JSON.stringify(rolesByPlayer(startedRoom(8, { seed }))),
      ),
    );
    expect(assignments.size).toBeGreaterThan(1);
  });

  it("replays a full 8-player game from start to gameOver", () => {
    const { steps, initial, states } = buildFullGame();
    const replayed = replay(initial, steps);

    expect(replayed.phase).toBe("gameOver");
    expect(replayed.winner).toEqual({ faction: "town" });
    expect(replayed).toEqual(states[states.length - 1]);
    expect(replayed.version).toBe(states[states.length - 1].version);
  });

  it("restores from a structuredClone snapshot and continues identically", () => {
    const { steps, states } = buildFullGame();
    const split = Math.floor(steps.length / 2);
    const snapshot = structuredClone(states[split]);

    const continued = replay(snapshot, steps.slice(split));
    expect(continued).toEqual(states[states.length - 1]);
  });

  it("restores from a JSON round-trip snapshot", () => {
    const { steps, states } = buildFullGame();
    const split = Math.floor(steps.length / 2);
    const snapshot = JSON.parse(
      JSON.stringify(states[split]),
    ) as RoomState;

    const continued = replay(snapshot, steps.slice(split));
    expect(continued).toEqual(states[states.length - 1]);
  });

  it("keeps the deterministic seed after random tie-breaking", () => {
    const { states } = buildFullGame();
    for (let index = 1; index < states.length; index += 1) {
      expect(Number.isInteger(states[index].seed)).toBe(true);
      expect(states[index].seed).toBeGreaterThanOrEqual(0);
    }
  });
});
