import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_CONFIG,
  advancePhase,
  cloneRoomConfig,
  defaultRoleCountsFor,
  reduce,
} from "./index";
import type { RoomState } from "./index";
import {
  NOW,
  forceNight,
  livingPlayers,
  markDead,
  player,
  playerWithRole,
  playersWithRole,
  run,
  startedRoom,
} from "./test-helpers";

function enterNight(count = 8): RoomState {
  return advancePhase(startedRoom(count), NOW + 1_000);
}

/**
 * Twelve-player custom room with the consigliere removed so there are two
 * framers and the senior living mafia is always a framer after the godfather
 * dies. The default 12-player composition only has one framer.
 */
function twoFramerRoom(): RoomState {
  const counts = defaultRoleCountsFor(12);
  if (!counts) {
    throw new Error("Expected a 12-player default composition");
  }

  return startedRoom(12, {
    config: {
      ...cloneRoomConfig(DEFAULT_ROOM_CONFIG),
      rolePreset: "custom",
      roleCounts: { ...counts, consigliere: 0, framer: 2 },
    },
  });
}

function killGodfather(state: RoomState): RoomState {
  const godfather = playerWithRole(state, "godfather");
  const withoutGodfather = markDead(state, [godfather.id]);
  return forceNight(withoutGodfather, NOW + 2_000);
}

describe("night action authority", () => {
  it("allows the godfather to kill and resolves the death", () => {
    let state = enterNight();
    const godfather = playerWithRole(state, "godfather");
    const victim = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    expect(state.phase).toBe("nightReport");
    expect(state.pendingNightResult).toEqual({
      deaths: [victim.id],
      saved: [],
      investigations: {},
      exactInvestigations: {},
    });
    expect(player(state, victim.id).alive).toBe(false);
    expect(player(state, victim.id).eliminatedAt).toEqual({
      phase: "night",
      round: 1,
      cause: "night",
    });
    expect(state.eliminatedIds).toContain(victim.id);
  });

  it("rejects framer kill submissions while the godfather lives", () => {
    const state = enterNight(10);
    const framer = playersWithRole(state, "framer")[0];
    const target = playerWithRole(state, "villager");

    const result = reduce(
      state,
      framer.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 2_000,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_AUTHORISED");
    }
  });

  it("allows only the senior living framer to kill after the godfather dies", () => {
    const night = killGodfather(twoFramerRoom());
    const framers = playersWithRole(night, "framer").sort(
      (first, second) => first.joinedAt - second.joinedAt,
    );
    const target = playerWithRole(night, "villager");
    const [senior, junior] = framers;

    const seniorResult = reduce(
      night,
      senior.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 3_000,
    );
    expect(seniorResult.ok).toBe(true);

    const juniorResult = reduce(
      night,
      junior.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 3_000,
    );
    expect(juniorResult.ok).toBe(false);
    if (!juniorResult.ok) {
      expect(juniorResult.error.code).toBe("NOT_AUTHORISED");
    }
  });

  it("lets the senior framer replace a frame with a kill", () => {
    let state = killGodfather(twoFramerRoom());
    const senior = playersWithRole(state, "framer").sort(
      (first, second) => first.joinedAt - second.joinedAt,
    )[0];
    const firstTarget = playerWithRole(state, "villager");
    const secondTarget = playerWithRole(state, "doctor");

    state = run(
      state,
      senior.id,
      { type: "submitNightAction", kind: "frame", targetId: firstTarget.id },
      NOW + 3_000,
    );
    state = run(
      state,
      senior.id,
      { type: "submitNightAction", kind: "kill", targetId: secondTarget.id },
      NOW + 4_000,
    );

    expect(state.nightActions[senior.id]).toMatchObject({
      kind: "kill",
      targetId: secondTarget.id,
    });
  });

  it("rejects wrong action kinds for each role", () => {
    const state = enterNight(10);
    const detective = playerWithRole(state, "detective");
    const godfather = playerWithRole(state, "godfather");
    const villager = playerWithRole(state, "villager");
    const jester = playerWithRole(state, "jester");
    const bodyguard = playerWithRole(state, "bodyguard");
    const roleblocker = playerWithRole(state, "roleblocker");
    const vigilante = playerWithRole(state, "vigilante");
    const target = playerWithRole(state, "doctor");

    expect(
      reduce(
        state,
        detective.id,
        { type: "submitNightAction", kind: "kill", targetId: target.id },
        NOW + 2_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });

    expect(
      reduce(
        state,
        godfather.id,
        { type: "submitNightAction", kind: "frame", targetId: target.id },
        NOW + 2_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });

    expect(
      reduce(
        state,
        villager.id,
        { type: "submitNightAction", kind: "protect", targetId: target.id },
        NOW + 2_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });

    expect(
      reduce(
        state,
        jester.id,
        { type: "submitNightAction", kind: "investigate", targetId: target.id },
        NOW + 2_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });

    expect(
      reduce(
        state,
        bodyguard.id,
        { type: "submitNightAction", kind: "protect", targetId: target.id },
        NOW + 2_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });

    expect(
      reduce(
        state,
        roleblocker.id,
        { type: "submitNightAction", kind: "shoot", targetId: target.id },
        NOW + 2_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });

    expect(
      reduce(
        state,
        vigilante.id,
        { type: "submitNightAction", kind: "guard", targetId: target.id },
        NOW + 2_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });
  });

  it("rejects self-targeting and dead targets", () => {
    const state = enterNight(10);
    const godfather = playerWithRole(state, "godfather");
    const deadVillager = playerWithRole(state, "villager");
    const withDead = forceNight(markDead(state, [deadVillager.id]));

    const selfCases = [
      { roleId: "godfather", kind: "kill" },
      { roleId: "framer", kind: "frame" },
      { roleId: "detective", kind: "investigate" },
      { roleId: "doctor", kind: "protect" },
      { roleId: "bodyguard", kind: "guard" },
      { roleId: "roleblocker", kind: "roleblock" },
      { roleId: "vigilante", kind: "shoot" },
    ] as const;

    for (const selfCase of selfCases) {
      const actor = playerWithRole(state, selfCase.roleId);
      expect(
        reduce(
          state,
          actor.id,
          {
            type: "submitNightAction",
            kind: selfCase.kind,
            targetId: actor.id,
          },
          NOW + 2_000,
        ),
      ).toMatchObject({ ok: false, error: { code: "INVALID_TARGET" } });
    }

    expect(
      reduce(
        withDead,
        godfather.id,
        {
          type: "submitNightAction",
          kind: "kill",
          targetId: deadVillager.id,
        },
        NOW + 2_000,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_TARGET" } });
  });

  it("rejects night actions outside the night phase", () => {
    const state = startedRoom(8);
    const godfather = playerWithRole(state, "godfather");
    const target = playerWithRole(state, "villager");

    const result = reduce(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: target.id },
      NOW + 2_000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("WRONG_PHASE");
    }
  });

  it("resolves automatically once every living player is ready", () => {
    let state = enterNight();
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
    expect(state.pendingNightResult?.deaths).toEqual([victim.id]);
  });
});

describe("doctor protection", () => {
  it("saves the mafia kill target", () => {
    let state = enterNight();
    const godfather = playerWithRole(state, "godfather");
    const doctor = playerWithRole(state, "doctor");
    const victim = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    state = run(
      state,
      doctor.id,
      { type: "submitNightAction", kind: "protect", targetId: victim.id },
      NOW + 3_000,
    );
    state = advancePhase(state, NOW + 4_000);

    expect(state.pendingNightResult).toEqual({
      deaths: [],
      saved: [victim.id],
      investigations: {},
      exactInvestigations: {},
    });
    expect(player(state, victim.id).alive).toBe(true);
    expect(
      state.alertsByPlayer[doctor.id].some(
        (alert) => alert.kind === "saved" && alert.params?.player === victim.name,
      ),
    ).toBe(true);
  });

  it("does not save a different target", () => {
    let state = enterNight(13);
    const godfather = playerWithRole(state, "godfather");
    const doctor = playerWithRole(state, "doctor");
    const victim = playerWithRole(state, "villager");
    const protectedTarget = playersWithRole(state, "villager").find(
      (candidate) => candidate.id !== victim.id,
    );

    if (!protectedTarget) {
      throw new Error("Expected a second villager");
    }

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    state = run(
      state,
      doctor.id,
      {
        type: "submitNightAction",
        kind: "protect",
        targetId: protectedTarget.id,
      },
      NOW + 3_000,
    );
    state = advancePhase(state, NOW + 4_000);

    expect(state.pendingNightResult?.deaths).toEqual([victim.id]);
    expect(state.pendingNightResult?.saved).toEqual([]);
  });
});

describe("detective investigation", () => {
  it("reports a mafia target as mafia", () => {
    let state = enterNight();
    const detective = playerWithRole(state, "detective");
    const framer = playerWithRole(state, "framer");

    state = run(
      state,
      detective.id,
      { type: "submitNightAction", kind: "investigate", targetId: framer.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    expect(state.pendingNightResult?.investigations[detective.id]).toBe("mafia");
    expect(
      state.alertsByPlayer[detective.id].some(
        (alert) =>
          alert.kind === "investigation" &&
          alert.detailKey === "Alerts.investigation.mafia",
      ),
    ).toBe(true);
  });

  it("reports town and neutral targets as not-mafia", () => {
    for (const roleId of ["villager", "jester"] as const) {
      let state = enterNight();
      const detective = playerWithRole(state, "detective");
      const target = playerWithRole(state, roleId);

      state = run(
        state,
        detective.id,
        { type: "submitNightAction", kind: "investigate", targetId: target.id },
        NOW + 2_000,
      );
      state = advancePhase(state, NOW + 3_000);

      expect(state.pendingNightResult?.investigations[detective.id]).toBe(
        "not-mafia",
      );
    }
  });

  it("turns a framed town target into a mafia result", () => {
    let state = enterNight();
    const detective = playerWithRole(state, "detective");
    const framer = playerWithRole(state, "framer");
    const target = playerWithRole(state, "villager");

    state = run(
      state,
      framer.id,
      { type: "submitNightAction", kind: "frame", targetId: target.id },
      NOW + 2_000,
    );
    state = run(
      state,
      detective.id,
      { type: "submitNightAction", kind: "investigate", targetId: target.id },
      NOW + 3_000,
    );
    state = advancePhase(state, NOW + 4_000);

    expect(state.pendingNightResult?.investigations[detective.id]).toBe("mafia");
  });

  it("keeps the godfather immune to framing", () => {
    let state = enterNight();
    const detective = playerWithRole(state, "detective");
    const framer = playerWithRole(state, "framer");
    const godfather = playerWithRole(state, "godfather");

    state = run(
      state,
      framer.id,
      { type: "submitNightAction", kind: "frame", targetId: godfather.id },
      NOW + 2_000,
    );
    state = run(
      state,
      detective.id,
      {
        type: "submitNightAction",
        kind: "investigate",
        targetId: godfather.id,
      },
      NOW + 3_000,
    );
    state = advancePhase(state, NOW + 4_000);

    expect(state.pendingNightResult?.investigations[detective.id]).toBe(
      "not-mafia",
    );
  });

  it("allows multiple framers to frame different targets", () => {
    let state = advancePhase(twoFramerRoom(), NOW + 1_000);
    const [firstFramer, secondFramer] = playersWithRole(state, "framer");
    const firstTarget = playerWithRole(state, "villager");
    const secondTarget = playerWithRole(state, "doctor");

    state = run(
      state,
      firstFramer.id,
      { type: "submitNightAction", kind: "frame", targetId: firstTarget.id },
      NOW + 2_000,
    );
    state = run(
      state,
      secondFramer.id,
      { type: "submitNightAction", kind: "frame", targetId: secondTarget.id },
      NOW + 3_000,
    );

    expect(state.nightActions[firstFramer.id]).toMatchObject({
      kind: "frame",
      targetId: firstTarget.id,
    });
    expect(state.nightActions[secondFramer.id]).toMatchObject({
      kind: "frame",
      targetId: secondTarget.id,
    });
  });
});

describe("night alerts", () => {
  it("announces deaths to everyone and the investigation only to the detective", () => {
    let state = enterNight();
    const godfather = playerWithRole(state, "godfather");
    const detective = playerWithRole(state, "detective");
    const victim = playerWithRole(state, "villager");
    const framer = playerWithRole(state, "framer");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    state = run(
      state,
      detective.id,
      { type: "submitNightAction", kind: "investigate", targetId: framer.id },
      NOW + 3_000,
    );
    state = advancePhase(state, NOW + 4_000);

    for (const player of state.players) {
      expect(
        state.alertsByPlayer[player.id].some((alert) => alert.kind === "kill"),
      ).toBe(true);
    }

    const investigationAlerts = state.players.filter((player) =>
      state.alertsByPlayer[player.id].some(
        (alert) => alert.kind === "investigation",
      ),
    );
    expect(investigationAlerts.map((player) => player.id)).toEqual([
      detective.id,
    ]);
  });

  it("sends mafia the kill outcome", () => {
    let state = enterNight();
    const godfather = playerWithRole(state, "godfather");
    const framer = playerWithRole(state, "framer");
    const victim = playerWithRole(state, "villager");

    state = run(
      state,
      godfather.id,
      { type: "submitNightAction", kind: "kill", targetId: victim.id },
      NOW + 2_000,
    );
    state = advancePhase(state, NOW + 3_000);

    expect(
      state.alertsByPlayer[framer.id].some(
        (alert) =>
          alert.kind === "kill" &&
          alert.detailKey === "Alerts.kill.success",
      ),
    ).toBe(true);
  });
});
