import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_CONFIG,
  ROLE_IDS,
  advancePhase,
  cloneRoomConfig,
  project,
  reduce,
} from "./index";
import type { RoleId, RoomConfig, RoomState } from "./index";
import {
  NOW,
  castVotes,
  castVotesToEliminate,
  forceNight,
  forceVoting,
  markDead,
  player,
  playerWithRole,
  playersWithRole,
  run,
  startedRoom,
} from "./test-helpers";

type RoleOverrides = Partial<Record<RoleId, number>>;

/** Every role key is present so custom configs never leave a role undefined. */
const ZERO_ROLE_COUNTS: Record<RoleId, number> = {
  godfather: 0,
  consigliere: 0,
  framer: 0,
  detective: 0,
  doctor: 0,
  bodyguard: 0,
  roleblocker: 0,
  vigilante: 0,
  mayor: 0,
  villager: 0,
  jester: 0,
  executioner: 0,
};

/** All twelve roles exactly once, so every role is deterministic. */
const ALL_ROLES: RoleOverrides = {
  godfather: 1,
  consigliere: 1,
  framer: 1,
  detective: 1,
  doctor: 1,
  bodyguard: 1,
  roleblocker: 1,
  vigilante: 1,
  mayor: 1,
  villager: 1,
  jester: 1,
  executioner: 1,
};

const EXECUTIONER_CONFIG: RoleOverrides = {
  godfather: 1,
  executioner: 1,
  detective: 1,
  doctor: 1,
  villager: 2,
};

const JESTER_EXECUTIONER_CONFIG: RoleOverrides = {
  godfather: 1,
  executioner: 1,
  jester: 1,
  detective: 1,
  doctor: 1,
};

function customConfig(overrides: RoleOverrides): RoomConfig {
  const roleCounts = {
    ...ZERO_ROLE_COUNTS,
    ...overrides,
  } as Record<RoleId, number>;
  const count = ROLE_IDS.reduce(
    (total, roleId) => total + roleCounts[roleId],
    0,
  );

  return {
    ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
    rolePreset: "custom",
    minPlayers: count,
    maxPlayers: count,
    roleCounts,
  };
}

function roomFor(overrides: RoleOverrides, seed = 42): RoomState {
  const config = customConfig(overrides);
  return startedRoom(config.minPlayers, { seed, config });
}

function nightRoom(overrides: RoleOverrides, seed = 42): RoomState {
  return advancePhase(roomFor(overrides, seed), NOW + 1_000);
}

function alertWithTitle(
  state: RoomState,
  playerId: string,
  titleKey: string,
) {
  return state.alertsByPlayer[playerId]?.find(
    (alert) => alert.titleKey === titleKey,
  );
}

describe("consigliere", () => {
  it("reports the exact role and not a mafia/not-mafia result", () => {
    let state = nightRoom(ALL_ROLES);
    const consigliere = playerWithRole(state, "consigliere");
    const target = playerWithRole(state, "detective");

    state = run(
      state,
      consigliere.id,
      { type: "submitNightAction", kind: "investigate", targetId: target.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    expect(state.pendingNightResult).toEqual({
      deaths: [],
      saved: [],
      investigations: {},
      exactInvestigations: { [consigliere.id]: target.roleId },
    });
    expect(state.pendingNightResult?.exactInvestigations[consigliere.id]).toBe(
      "detective",
    );
    expect(
      state.pendingNightResult?.investigations[consigliere.id],
    ).toBeUndefined();
  });

  it("sees through a framer's frame", () => {
    let state = nightRoom(ALL_ROLES);
    const consigliere = playerWithRole(state, "consigliere");
    const framer = playerWithRole(state, "framer");
    const target = playerWithRole(state, "detective");

    state = run(
      state,
      framer.id,
      { type: "submitNightAction", kind: "frame", targetId: target.id },
      NOW + 2_000,
    );
    state = run(
      state,
      consigliere.id,
      { type: "submitNightAction", kind: "investigate", targetId: target.id },
      NOW + 3_000,
    );
    state = advancePhase(state, NOW + 4_000);

    expect(state.pendingNightResult?.exactInvestigations[consigliere.id]).toBe(
      "detective",
    );
    expect(state.pendingNightResult?.investigations).toEqual({});
  });

  it("receives an exact-role alert", () => {
    let state = nightRoom(ALL_ROLES);
    const consigliere = playerWithRole(state, "consigliere");
    const target = playerWithRole(state, "detective");

    state = run(
      state,
      consigliere.id,
      { type: "submitNightAction", kind: "investigate", targetId: target.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    const alert = alertWithTitle(
      state,
      consigliere.id,
      "Alerts.consigliere.title",
    );
    expect(alert).toMatchObject({
      kind: "investigation",
      titleKey: "Alerts.consigliere.title",
      detailKey: "Alerts.consigliere.body",
      params: { player: target.name, roleId: target.roleId },
    });
    expect(alert?.params?.roleId).toBe(target.roleId);
  });
});

describe("bodyguard", () => {
  it("dies in place of the guarded target", () => {
    let state = nightRoom(ALL_ROLES);
    const godfather = playerWithRole(state, "godfather");
    const bodyguard = playerWithRole(state, "bodyguard");
    const target = playerWithRole(state, "mayor");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 2_000,
    );
    state = run(
      state,
      bodyguard.id,
      { type: "submitNightAction", kind: "guard", targetId: target.id },
      NOW + 3_000,
    );
    state = advancePhase(state, NOW + 4_000);

    expect(state.pendingNightResult).toEqual({
      deaths: [bodyguard.id],
      saved: [target.id],
      investigations: {},
      exactInvestigations: {},
    });
    expect(player(state, target.id).alive).toBe(true);
    expect(player(state, bodyguard.id).alive).toBe(false);
    expect(state.eliminatedIds).toContain(bodyguard.id);
    expect(state.eliminatedIds).not.toContain(target.id);
  });

  it("notifies the bodyguard and the guarded target when the guard triggers", () => {
    let state = nightRoom(ALL_ROLES);
    const godfather = playerWithRole(state, "godfather");
    const bodyguard = playerWithRole(state, "bodyguard");
    const target = playerWithRole(state, "mayor");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 2_000,
    );
    state = run(
      state,
      bodyguard.id,
      { type: "submitNightAction", kind: "guard", targetId: target.id },
      NOW + 3_000,
    );
    state = advancePhase(state, NOW + 4_000);

    expect(
      alertWithTitle(state, bodyguard.id, "Alerts.bodyguard.title"),
    ).toMatchObject({
      kind: "saved",
      titleKey: "Alerts.bodyguard.title",
      detailKey: "Alerts.bodyguard.body",
      params: { player: target.name },
    });
    expect(
      alertWithTitle(state, target.id, "Alerts.guarded.title"),
    ).toMatchObject({
      kind: "saved",
      titleKey: "Alerts.guarded.title",
      detailKey: "Alerts.guarded.body",
    });
  });

  it("lets doctor protection take precedence and keeps the bodyguard alive", () => {
    let state = nightRoom(ALL_ROLES);
    const godfather = playerWithRole(state, "godfather");
    const doctor = playerWithRole(state, "doctor");
    const bodyguard = playerWithRole(state, "bodyguard");
    const target = playerWithRole(state, "mayor");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 2_000,
    );
    state = run(
      state,
      doctor.id,
      { type: "submitNightAction", kind: "protect", targetId: target.id },
      NOW + 3_000,
    );
    state = run(
      state,
      bodyguard.id,
      { type: "submitNightAction", kind: "guard", targetId: target.id },
      NOW + 4_000,
    );
    state = advancePhase(state, NOW + 5_000);

    expect(state.pendingNightResult).toEqual({
      deaths: [],
      saved: [target.id],
      investigations: {},
      exactInvestigations: {},
    });
    expect(player(state, target.id).alive).toBe(true);
    expect(player(state, bodyguard.id).alive).toBe(true);
    expect(alertWithTitle(state, bodyguard.id, "Alerts.bodyguard.title")).toBe(
      undefined,
    );
  });
});

describe("roleblocker", () => {
  it("prevents a blocked godfather from killing", () => {
    let state = nightRoom(ALL_ROLES);
    const roleblocker = playerWithRole(state, "roleblocker");
    const godfather = playerWithRole(state, "godfather");
    const target = playerWithRole(state, "detective");

    state = run(
      state,
      roleblocker.id,
      { type: "submitNightAction", kind: "roleblock", targetId: godfather.id },
      NOW + 2_000,
    );
    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 3_000,
    );
    state = advancePhase(state, NOW + 4_000);

    expect(state.pendingNightResult).toEqual({
      deaths: [],
      saved: [],
      investigations: {},
      exactInvestigations: {},
    });
    expect(player(state, target.id).alive).toBe(true);

    expect(state.alertsByPlayer[godfather.id]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "blocked",
          titleKey: "Alerts.blocked.title",
          detailKey: "Alerts.blocked.body",
        }),
      ]),
    );
  });

  it("prevents a blocked doctor from protecting", () => {
    let state = nightRoom(ALL_ROLES);
    const roleblocker = playerWithRole(state, "roleblocker");
    const doctor = playerWithRole(state, "doctor");
    const godfather = playerWithRole(state, "godfather");
    const target = playerWithRole(state, "detective");

    state = run(
      state,
      roleblocker.id,
      { type: "submitNightAction", kind: "roleblock", targetId: doctor.id },
      NOW + 2_000,
    );
    state = run(
      state,
      doctor.id,
      { type: "submitNightAction", kind: "protect", targetId: target.id },
      NOW + 3_000,
    );
    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 4_000,
    );
    state = advancePhase(state, NOW + 5_000);

    expect(state.pendingNightResult).toEqual({
      deaths: [target.id],
      saved: [],
      investigations: {},
      exactInvestigations: {},
    });
    expect(player(state, target.id).alive).toBe(false);
    expect(state.alertsByPlayer[doctor.id]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "blocked",
          titleKey: "Alerts.blocked.title",
        }),
      ]),
    );
  });
});

describe("vigilante", () => {
  it("kills the target and spends the single shot", () => {
    let state = nightRoom(ALL_ROLES);
    const vigilante = playerWithRole(state, "vigilante");
    const target = playerWithRole(state, "detective");

    expect(state.vigilanteShots[vigilante.id]).toBe(1);

    state = run(
      state,
      vigilante.id,
      { type: "submitNightAction", kind: "shoot", targetId: target.id },
      NOW + 2_000,
    );
    expect(state.vigilanteShots[vigilante.id]).toBe(0);

    state = advancePhase(state, NOW + 3_000);

    expect(state.pendingNightResult?.deaths).toContain(target.id);
    expect(player(state, target.id).alive).toBe(false);
  });

  it("returns BUDGET_EXHAUSTED once the shot is spent", () => {
    let state = nightRoom(ALL_ROLES);
    const vigilante = playerWithRole(state, "vigilante");
    const firstTarget = playerWithRole(state, "detective");

    state = run(
      state,
      vigilante.id,
      { type: "submitNightAction", kind: "shoot", targetId: firstTarget.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    // Start a fresh night: night actions reset, but the spent shot does not.
    state = forceNight(state, NOW + 4_000);
    const secondTarget = playerWithRole(state, "framer");
    expect(state.vigilanteShots[vigilante.id]).toBe(0);
    expect(state.nightActions[vigilante.id]).toBeUndefined();

    const result = reduce(
      state,
      vigilante.id,
      { type: "submitNightAction", kind: "shoot", targetId: secondTarget.id },
      NOW + 5_000,
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "BUDGET_EXHAUSTED",
        messageKey: "Errors.noShotsLeft",
      },
    });
  });

  it("does not consume another shot when re-targeting before resolution", () => {
    let state = nightRoom(ALL_ROLES);
    const vigilante = playerWithRole(state, "vigilante");
    const firstTarget = playerWithRole(state, "detective");
    const secondTarget = playerWithRole(state, "doctor");

    state = run(
      state,
      vigilante.id,
      { type: "submitNightAction", kind: "shoot", targetId: firstTarget.id },
      NOW + 2_000,
    );
    expect(state.vigilanteShots[vigilante.id]).toBe(0);

    state = run(
      state,
      vigilante.id,
      { type: "submitNightAction", kind: "shoot", targetId: secondTarget.id },
      NOW + 3_000,
    );
    expect(state.vigilanteShots[vigilante.id]).toBe(0);
    expect(state.nightActions[vigilante.id]).toMatchObject({
      kind: "shoot",
      targetId: secondTarget.id,
    });

    state = advancePhase(state, NOW + 4_000);

    expect(state.pendingNightResult?.deaths).toContain(secondTarget.id);
    expect(state.pendingNightResult?.deaths).not.toContain(firstTarget.id);
    expect(player(state, firstTarget.id).alive).toBe(true);
    expect(player(state, secondTarget.id).alive).toBe(false);
  });

  it("spends the shot but produces no death when roleblocked", () => {
    let state = nightRoom(ALL_ROLES);
    const roleblocker = playerWithRole(state, "roleblocker");
    const vigilante = playerWithRole(state, "vigilante");
    const target = playerWithRole(state, "detective");

    state = run(
      state,
      roleblocker.id,
      {
        type: "submitNightAction",
        kind: "roleblock",
        targetId: vigilante.id,
      },
      NOW + 2_000,
    );
    state = run(
      state,
      vigilante.id,
      { type: "submitNightAction", kind: "shoot", targetId: target.id },
      NOW + 3_000,
    );

    expect(state.vigilanteShots[vigilante.id]).toBe(0);

    state = advancePhase(state, NOW + 4_000);

    expect(state.pendingNightResult?.deaths).toEqual([]);
    expect(player(state, target.id).alive).toBe(true);
    expect(state.alertsByPlayer[vigilante.id]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "blocked",
          titleKey: "Alerts.blocked.title",
        }),
      ]),
    );
  });
});

describe("mayor", () => {
  it("counts the mayor's vote twice after revealing and changes the leader", () => {
    let state = roomFor(ALL_ROLES);
    state = advancePhase(state, NOW + 1_000);
    state = advancePhase(state, NOW + 2_000);
    state = advancePhase(state, NOW + 3_000);
    expect(state.phase).toBe("dayDiscussion");

    const mayor = playerWithRole(state, "mayor");
    const otherVoter = playerWithRole(state, "detective");
    const leadingTarget = playerWithRole(state, "bodyguard");
    const trailingTarget = playerWithRole(state, "roleblocker");

    state = run(
      state,
      mayor.id,
      { type: "submitDayAction", kind: "reveal" },
      NOW + 3_500,
    );
    expect(state.revealedPlayerIds).toContain(mayor.id);

    state = forceVoting(state, NOW + 4_000);
    state = castVotes(
      state,
      [
        [mayor.id, leadingTarget.id],
        [otherVoter.id, trailingTarget.id],
      ] as const,
      NOW + 5_000,
    );

    expect(state.phase).toBe("voting");
    expect(state.voteTally).toBeNull();

    const resolved = advancePhase(state, NOW + 6_000);

    expect(resolved.phase).toBe("voteResult");
    // Without the revealed mayor's double vote this would be a 1-1 tie.
    expect(resolved.voteTally).toEqual({
      [leadingTarget.id]: 2,
      [trailingTarget.id]: 1,
    });
    expect(player(resolved, leadingTarget.id).alive).toBe(false);
    expect(player(resolved, trailingTarget.id).alive).toBe(true);
  });
});

function dayRoom(overrides: RoleOverrides = ALL_ROLES): RoomState {
  let state = roomFor(overrides);
  state = advancePhase(state, NOW + 1_000);
  state = advancePhase(state, NOW + 2_000);
  state = advancePhase(state, NOW + 3_000);
  if (state.phase !== "dayDiscussion") {
    throw new Error(`Expected dayDiscussion, got ${state.phase}`);
  }
  return state;
}

describe("day actions", () => {
  it("leaves an unrevealed mayor's vote at weight one", () => {
    let state = forceVoting(dayRoom(), NOW + 4_000);
    const mayor = playerWithRole(state, "mayor");
    const otherVoter = playerWithRole(state, "detective");
    const leadingTarget = playerWithRole(state, "bodyguard");
    const trailingTarget = playerWithRole(state, "roleblocker");

    state = castVotes(
      state,
      [
        [mayor.id, leadingTarget.id],
        [otherVoter.id, trailingTarget.id],
      ] as const,
      NOW + 5_000,
    );
    const resolved = advancePhase(state, NOW + 6_000);

    expect(resolved.voteTally).toEqual({
      [leadingTarget.id]: 1,
      [trailingTarget.id]: 1,
    });
    expect(player(resolved, leadingTarget.id).alive).toBe(true);
    expect(player(resolved, trailingTarget.id).alive).toBe(true);
  });

  it("reveals the mayor once, alerts everyone, and removes the day action", () => {
    let state = dayRoom();
    const mayor = playerWithRole(state, "mayor");
    const detective = playerWithRole(state, "detective");

    let detectiveView = project(state, detective.id);
    expect(
      detectiveView.players.find((entry) => entry.id === mayor.id),
    ).toMatchObject({ roleId: null, roleRevealed: false });
    expect(detectiveView.yourDayActions).toEqual([]);
    expect(project(state, mayor.id).yourDayActions).toEqual(["reveal"]);

    state = run(
      state,
      mayor.id,
      { type: "submitDayAction", kind: "reveal" },
      NOW + 4_000,
    );

    expect(state.revealedPlayerIds).toEqual([mayor.id]);
    for (const player of state.players) {
      expect(state.alertsByPlayer[player.id]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            titleKey: "Alerts.reveal.title",
            params: { player: mayor.name, roleId: "mayor" },
          }),
        ]),
      );
    }

    detectiveView = project(state, detective.id);
    expect(
      detectiveView.players.find((entry) => entry.id === mayor.id),
    ).toMatchObject({ roleId: "mayor", roleRevealed: true });
    expect(project(state, mayor.id).yourDayActions).toEqual([]);

    const duplicate = reduce(
      state,
      mayor.id,
      { type: "submitDayAction", kind: "reveal" },
      NOW + 5_000,
    );
    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: "NOT_YOUR_TURN" },
    });
  });

  it("rejects day actions outside day discussion, from non-mayors, and from dead players", () => {
    const revealRoom = roomFor(ALL_ROLES);
    const mayor = playerWithRole(revealRoom, "mayor");

    expect(
      reduce(
        revealRoom,
        mayor.id,
        { type: "submitDayAction", kind: "reveal" },
        NOW + 4_000,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "WRONG_PHASE" },
    });

    const day = dayRoom();
    const detective = playerWithRole(day, "detective");
    const dayMayor = playerWithRole(day, "mayor");

    expect(
      reduce(
        day,
        detective.id,
        { type: "submitDayAction", kind: "reveal" },
        NOW + 4_000,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "NOT_YOUR_TURN" },
    });

    expect(
      reduce(
        markDead(day, [dayMayor.id]),
        dayMayor.id,
        { type: "submitDayAction", kind: "reveal" },
        NOW + 4_000,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "NOT_ALIVE" },
    });

    expect(
      reduce(
        forceVoting(day, NOW + 5_000),
        dayMayor.id,
        { type: "submitDayAction", kind: "reveal" },
        NOW + 6_000,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "WRONG_PHASE" },
    });
  });

  it("lets duplicate mayors reveal independently", () => {
    let state = dayRoom({
      godfather: 1,
      mayor: 2,
      detective: 1,
      villager: 2,
    });
    const mayors = playersWithRole(state, "mayor");

    for (const [index, mayor] of mayors.entries()) {
      state = run(
        state,
        mayor.id,
        { type: "submitDayAction", kind: "reveal" },
        NOW + 4_000 + index,
      );
    }

    expect(state.revealedPlayerIds).toEqual(
      expect.arrayContaining(mayors.map((mayor) => mayor.id)),
    );
  });
});

describe("executioner", () => {  it("assigns a living non-mafia target at game start", () => {
    const state = roomFor(ALL_ROLES);
    const executioner = playerWithRole(state, "executioner");
    const targetId = state.executionerTargets[executioner.id];

    expect(targetId).toBeDefined();
    if (!targetId) {
      throw new Error("Expected the executioner to have a target");
    }

    const target = player(state, targetId);
    expect(target.id).not.toBe(executioner.id);
    expect(target.roleId).not.toBe("executioner");
    expect(target.alive).toBe(true);
    expect(target.faction).not.toBe("mafia");
  });

  it("wins when the assigned target is voted out and advances to gameOver", () => {
    let state = roomFor(EXECUTIONER_CONFIG);
    const executioner = playerWithRole(state, "executioner");
    const targetId = state.executionerTargets[executioner.id];

    expect(targetId).toBeDefined();
    if (!targetId) {
      throw new Error("Expected the executioner to have a target");
    }

    state = forceVoting(state, NOW + 2_000);
    state = castVotesToEliminate(state, targetId, NOW + 3_000);

    expect(state.phase).toBe("voteResult");
    expect(state.winner).toEqual({
      faction: "neutral",
      playerId: executioner.id,
      reason: "executioner",
    });

    const over = advancePhase(state, NOW + 4_000);
    expect(over.phase).toBe("gameOver");
    expect(over.phaseEndsAt).toBeNull();
    expect(over.winner).toEqual({
      faction: "neutral",
      playerId: executioner.id,
      reason: "executioner",
    });
  });

  it("awards no executioner win when the executioner is already dead", () => {
    let state = roomFor(EXECUTIONER_CONFIG);
    const executioner = playerWithRole(state, "executioner");
    const targetId = state.executionerTargets[executioner.id];

    expect(targetId).toBeDefined();
    if (!targetId) {
      throw new Error("Expected the executioner to have a target");
    }

    state = forceVoting(markDead(state, [executioner.id]), NOW + 2_000);
    state = castVotesToEliminate(state, targetId, NOW + 3_000);

    expect(state.phase).toBe("voteResult");
    expect(player(state, targetId).alive).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.winner?.faction ?? null).not.toBe("neutral");
  });

  it("lets the jester win when the voted-out player is also an executioner target", () => {
    let state = roomFor(JESTER_EXECUTIONER_CONFIG);
    const executioner = playerWithRole(state, "executioner");
    const jester = playerWithRole(state, "jester");

    // Force the overlap: the jester is a valid executioner target.
    state.executionerTargets[executioner.id] = jester.id;
    state = forceVoting(state, NOW + 2_000);
    state = castVotesToEliminate(state, jester.id, NOW + 3_000);

    expect(state.phase).toBe("voteResult");
    expect(state.winner).toEqual({
      faction: "neutral",
      playerId: jester.id,
      reason: "jester",
    });
    expect(state.winner).not.toEqual({
      faction: "neutral",
      playerId: executioner.id,
      reason: "executioner",
    });
  });
});

describe("duplicate protective roles", () => {
  it("lets multiple doctors protect the same target", () => {
    let state = nightRoom({ godfather: 1, doctor: 2, villager: 3 });
    const godfather = playerWithRole(state, "godfather");
    const doctors = playersWithRole(state, "doctor");
    const victim = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    for (const [index, doctor] of doctors.entries()) {
      state = run(
        state,
        doctor.id,
        { type: "submitNightAction", kind: "protect", targetId: victim.id },
        NOW + 2_100 + index,
      );
    }
    state = advancePhase(state, NOW + 3_000);

    expect(state.pendingNightResult?.deaths).toEqual([]);
    expect(state.pendingNightResult?.saved).toEqual([victim.id]);
    expect(player(state, victim.id).alive).toBe(true);
    for (const doctor of doctors) {
      const alert = state.alertsByPlayer[doctor.id]?.find(
        (entry) => entry.titleKey === "Alerts.saved.title",
      );
      expect(alert).toBeDefined();
    }
  });

  it("lets multiple bodyguards die for different guarded targets", () => {
    let state = nightRoom({
      godfather: 1,
      bodyguard: 2,
      vigilante: 1,
      villager: 3,
    });
    const godfather = playerWithRole(state, "godfather");
    const [firstGuard, secondGuard] = playersWithRole(state, "bodyguard");
    const vigilante = playerWithRole(state, "vigilante");
    const [firstVictim, secondVictim] = playersWithRole(
      state,
      "villager",
    );

    state = run(
      state,
      firstGuard.id,
      { type: "submitNightAction", kind: "guard", targetId: firstVictim.id },
      NOW + 2_000,
    );
    state = run(
      state,
      secondGuard.id,
      { type: "submitNightAction", kind: "guard", targetId: secondVictim.id },
      NOW + 2_100,
    );
    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: firstVictim.id },
      NOW + 2_200,
    );
    state = run(
      state,
      vigilante.id,
      { type: "submitNightAction", kind: "shoot", targetId: secondVictim.id },
      NOW + 2_300,
    );
    state = advancePhase(state, NOW + 3_000);

    expect(player(state, firstVictim.id).alive).toBe(true);
    expect(player(state, secondVictim.id).alive).toBe(true);
    expect(player(state, firstGuard.id).alive).toBe(false);
    expect(player(state, secondGuard.id).alive).toBe(false);
    expect(state.pendingNightResult?.deaths).toEqual(
      expect.arrayContaining([firstGuard.id, secondGuard.id]),
    );
    expect(state.pendingNightResult?.saved).toEqual(
      expect.arrayContaining([firstVictim.id, secondVictim.id]),
    );
  });
});

describe("mafia fallback kill authority", () => {  it("prefers framers, then lets the consigliere kill when no framer remains", () => {
    let state = startedRoom(16);
    const godfather = playerWithRole(state, "godfather");
    const consigliere = playerWithRole(state, "consigliere");
    const framers = playersWithRole(state, "framer").sort(
      (first, second) => first.joinedAt - second.joinedAt,
    );
    const target = playerWithRole(state, "villager");

    state = forceNight(markDead(state, [godfather.id]), NOW + 2_000);

    state = run(
      state,
      framers[0].id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 3_000,
    );
    expect(state.nightActions[framers[0].id]?.kind).toBe("kill");

    const consigliereBlocked = reduce(
      state,
      consigliere.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 3_000,
    );
    expect(consigliereBlocked.ok).toBe(false);

    state = forceNight(
      markDead(
        state,
        framers.map((framer) => framer.id),
      ),
      NOW + 4_000,
    );
    state = run(
      state,
      consigliere.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 5_000,
    );
    expect(state.nightActions[consigliere.id]?.kind).toBe("kill");
  });
});
