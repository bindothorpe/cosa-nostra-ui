# Cosa Nostra — Multiplayer Architecture & Implementation Plan

Status: **Phases 0–5 complete; Phase 6 deployment artifacts and Coolify runbook ready; live VPS deploy/dry-run pending**
Audience: implementation agent (human or AI) taking over the work
Last updated: 2026-11-16

This document is the source of truth for turning the current single-device mock into a
server-authoritative multiplayer game hosted on a VPS. It contains the architecture,
protocol, game rules, screen contracts, phased roadmap, and deployment runbook.

Read it fully before writing code. Where this document says **locked**, do not change the
decision without asking the project owner. Where it says **deferred**, leave it for later.

## Contents

1. Executive summary
2. Locked decisions
3. Non-goals for v1
4. Current repository state
5. Target architecture
6. Repository layout
7. Domain model
8. Game rules specification
9. Protocol
10. Server design (`realtime/`)
11. Client design (`components/room/`)
12. `PlayerView` and projection
13. Screen contracts
14. i18n
15. Testing strategy
16. Roadmap
17. Deployment runbook
18. Handoff checklist
19. Deferred decisions and assumptions
20. Definition of done (v1)
- Appendix A: Cloudflare portability (deferred)
- Appendix B: Quick protocol example

---

## 1. Executive summary

The current app is a Next.js 16 mobile-first UI where `GameProvider` owns the entire game
state in browser memory, including every player's role, and simulates bots. It is a design
prototype, not a networked game.

The target is:

- Multiple rooms, joined by short code.
- 3–16 players per room.
- Server-authoritative game engine: the server validates every action, resolves nights,
  tallies votes, and decides eliminations and win conditions.
- One WebSocket per player; the server pushes a full, versioned, per-player snapshot on
  every change.
- No accounts. Identity is a display name plus an opaque token stored in `localStorage`.
- A single Node.js realtime process holding rooms in memory, with JSON snapshots on disk
  so a restart or redeploy does not destroy an active game.
- Next.js app and realtime server deployed as two containers via Coolify + Docker Compose
  on a VPS, behind Traefik with TLS.
- A pure `game-core` module shared by the client and server. Cloudflare Durable Objects
  remain a possible future adapter, but are **not** part of v1.

The UI screens are owned by the project owner and will be implemented/refined separately.
This document defines the data, actions, and transitions those screens must use.

---

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Scope | Full multiplayer, server-authoritative |
| Hosting | VPS primary |
| Deploy | Coolify + Docker Compose + Traefik TLS |
| UI runtime | Next.js standalone Docker image |
| Realtime runtime | One Node.js process using `ws` |
| Rooms | Multiple rooms, short join code |
| Players per room | 3–16 (minimum 3 to start, maximum 16) |
| Transport | WebSocket |
| State sync | Full per-player snapshot on every accepted change |
| Identity | Name + random token in `localStorage` |
| Auth | None; token only reclaims a seat |
| Host | Room creator; tied to token; no in-game skip or forced kill |
| Phase progression | All living players ready; absolute hard timeout fallback |
| Win conditions | All mafia dead; mafia parity; jester voted out |
| Roles | Godfather, framer, detective, doctor, villager, jester |
| Role abilities | All six implemented server-side |
| Role setup | Room creation chooses Default (config table per player count) or Custom (validated counts) |
| Rules setup | Room creation chooses Default (current values) or Custom (timers, whisper budget, tie rule) |
| Dead players | Spectators; graveyard chat; cannot vote/act/whisper living players; other roles hidden |
| Whispers | Private 1:1; allowed in every phase after role reveal; default 3 per day; budget configurable; resets each day |
| Vote tie | Default: no elimination; configurable |
| Mid-game joins | Rejected; reconnect only |
| Disconnect | Seat held for the whole game; timeout fallback keeps the game moving |
| Host disconnect | Host rights stay with the token; no automatic transfer in v1 |
| Room lifetime | Ephemeral; deleted shortly after game over |
| Persistence | In-memory authority + JSON snapshot volume; no database |
| Public URL | One hostname; realtime under `/rt/*`; fallback to a `ws.` subdomain if path routing fails |
| Portability | Pure `game-core`; Node adapter now; Cloudflare adapter deferred |
| Deliverable | This document; no application code written yet |

---

## 3. Non-goals for v1

Do not build these unless the owner asks:

- Accounts, OAuth, email, password reset.
- Persistent player profiles, stats, match history, leaderboards.
- Postgres, Redis, or any database.
- Horizontal scaling of the realtime server. Pin it to one replica.
- Cloudflare Workers / Durable Objects deployment.
- Native mobile apps, push notifications, email.
- Voice/video, typing indicators, presence beyond connected/alive.
- Moderation tools, profanity filters, reporting, bans.
- Spectators who are not dead players.
- Mafia group chat.
- Matchmaking, public room list, or room discovery.
- Skin/theme redesign. Keep the existing design language and shadcn primitives.
- Payments, analytics, ads.

---

## 4. Current repository state

- **Framework:** Next.js `16.4.6`, React `19.3.0`, TypeScript strict, App Router.
- **Package manager:** pnpm `10.33.0`. `pnpm-workspace.yaml` currently has no `packages:`
  entry, so the repo is effectively a single package.
- **Styling:** Tailwind CSS `4.3.3`, shadcn (`base-nova` style), mobile-first conventions in
  `CLAUDE.md`.
- **i18n:** `next-intl` with `messages/en.json` and `messages/nl.json`.
- **Tests:** none configured.
- **Game state:** entirely client-side.
  - `components/game/game-provider.tsx` — context, reducer-like setters, bot simulation,
    phase timer, whisper/graveyard/alert mutations.
  - `components/game/types.ts` — flat `GameState` with every player's role embedded.
  - `components/game/data.ts` — seeded players, roles, room code, durations, vote tally.
  - `components/game/screens/*` — phase screens.
  - `app/play/page.tsx` — phase router.
  - `app/lobby/page.tsx` — lobby with hardcoded `ROOM_CODE` and `MAX_PLAYERS = 12`.
  - `app/page.tsx` — join screen with hardcoded room code.
  - `app/whispers/*`, `app/alerts/page.tsx`, `app/graveyard/page.tsx` — read from context.
  - `app/codex/page.tsx` — static role reference; keep.
  - `app/admin/page.tsx` — mock host screen with skip/kill-self; replace with room settings.
  - `components/game/app-shell.tsx` and `bottom-nav.tsx` — depend on `useGame()`.
- **Layout:** `app/layout.tsx` wraps every route in `GameProvider` and a `max-w-md` frame.
- **Config:** `next.config.ts` enables `cacheComponents` and `partialPrefetching`, uses
  Turbopack CSS rules. Add `output: "standalone"` for Docker later.
- **Do not delete** the mock during early phases. Keep it working behind a flag until the
  live path is proven, so UI work can continue.

### Files that must not leak server code into the client

Anything under `realtime/` imports Node built-ins and `ws`. Never import it from `app/`,
`components/`, or anything marked `"use client"`. `game-core/` must remain platform-free.

---

## 5. Target architecture

```
Browser (Next.js app, mobile-first)
  │
  ├─ HTTPS  game.example.com/*      ─┐
  ├─ WSS    game.example.com/rt/ws   ├─ Traefik (TLS, Coolify)
  ├─ POST   game.example.com/rt/...  ┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ VPS                                                         │
│                                                             │
│  ┌───────────────┐        ┌───────────────────────────────┐ │
│  │ web           │        │ realtime                      │ │
│  │ Next.js       │        │ Node.js + ws                  │ │
│  │ standalone    │        │ - Map<roomCode, Room>         │ │
│  │ port 3000     │        │ - WebSocket fan-out           │ │
│  └───────────────┘        │ - in-memory authoritative     │ │
│                           │ - JSON snapshots → volume     │ │
│                           └───────────────┬───────────────┘ │
│                                           │                 │
│                                 ┌─────────▼─────────┐       │
│                                 │ Docker volume     │       │
│                                 │ /data/rooms/*.json│       │
│                                 └───────────────────┘       │
│                                                             │
│  Coolify manages both containers + Traefik                  │
└─────────────────────────────────────────────────────────────┘
```

Key properties:

- The client never owns game state. It renders the latest `PlayerView` and sends commands.
- The server projects a different view per player. Hidden data never enters the wrong
  player's snapshot.
- One realtime process. Multiple rooms live in one `Map`. No Redis.
- Snapshots exist only to survive process restart/redeploy; they are not a database.
- The client derives the realtime base URL from `window.location` by default, so laptop,
  phone-over-LAN, and production behave the same.

---

## 6. Repository layout

Target layout. Keep the existing Next structure; add two top-level folders.

```
cosa-nostra-ui/
├── app/                          # existing Next routes
│   ├── page.tsx                  # landing: create / join
│   ├── join/[code]/page.tsx      # NEW: prefilled join
│   ├── room/[code]/              # NEW: room-scoped routes (recommended)
│   │   ├── lobby/page.tsx
│   │   ├── play/page.tsx
│   │   ├── whispers/page.tsx
│   │   ├── whispers/[playerId]/page.tsx
│   │   ├── alerts/page.tsx
│   │   ├── graveyard/page.tsx
│   │   └── settings/page.tsx     # host config before start
│   ├── codex/page.tsx            # keep as-is (static)
│   └── layout.tsx
├── components/
│   ├── game/                     # existing UI components
│   ├── room/                     # NEW: RoomProvider, hooks, transport
│   └── ui/                       # shadcn primitives
├── game-core/                    # NEW: pure TypeScript, no Node/browser/CF APIs
│   ├── types.ts
│   ├── config.ts
│   ├── engine.ts
│   ├── projection.ts
│   ├── protocol.ts
│   ├── random.ts
│   └── index.ts
├── realtime/                     # NEW: Node WebSocket server
│   ├── src/
│   │   ├── index.ts              # HTTP + WS bootstrap
│   │   ├── env.ts
│   │   ├── http.ts               # POST /rt/rooms, POST /rt/rooms/:code/join
│   │   ├── room-registry.ts
│   │   ├── room.ts
│   │   ├── connection.ts
│   │   ├── snapshot-store.ts
│   │   ├── timer.ts
│   │   ├── rate-limit.ts
│   │   └── logger.ts
│   ├── test/
│   ├── Dockerfile
│   ├── tsconfig.json
│   └── package.json?             # optional; see note below
├── docs/
│   └── implementation-plan.md    # this file
├── Dockerfile                    # Next standalone image
├── compose.yaml                  # local + production-ish, no Caddy
├── compose.local.yaml            # adds Caddy for local same-origin testing
├── Caddyfile.local
├── messages/en.json
├── messages/nl.json
└── ...
```

### Single package vs workspace

**Recommendation: keep a single root package.** The root `tsconfig.json` already includes
`**/*.ts`, and `@/*` maps to the repo root. Add `ws`, `zod`, `tsx`, `tsup`, and test
dependencies to the root `package.json`. Do **not** restructure into a pnpm workspace for
v1.

Consequences:

- Build the realtime entry with `tsup`, which bundles `realtime/src/index.ts` and
  `game-core` into `realtime/dist/index.js`. Keep `ws` external and use the runtime
  `node_modules` in the image. This avoids cross-folder `tsc` output-path headaches.
- `game-core/` imports use relative paths from `realtime/`, and `@/game-core/...` from the
  Next app. Both work because of the root `@/*` alias and relative imports.
- Keep `game-core` side-effect free so Next can tree-shake it into client bundles.
- Never put Node-only imports in `game-core`.

If the implementation agent strongly prefers a workspace, it must preserve the import
paths above so the screen work is unaffected.

### Root scripts to add

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:realtime": "tsx watch realtime/src/index.ts",
    "dev:all": "concurrently -k \"pnpm dev\" \"pnpm dev:realtime\"",
    "build": "next build",
    "build:realtime": "tsup realtime/src/index.ts --format cjs --platform node --target node22 --out-dir realtime/dist --clean",
    "start:realtime": "node realtime/dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test"
  }
}
```

`concurrently` is optional. The owner may prefer two terminals.

---

## 7. Domain model

### 7.1 Identifiers and basic types

```ts
export type PlayerId = string;   // server-generated, stable, opaque (e.g. "p_...")
export type RoomCode = string;   // 5 chars, uppercase A-Z
export type RoleId =
  | "godfather"
  | "framer"
  | "detective"
  | "doctor"
  | "villager"
  | "jester";

export type Faction = "mafia" | "town" | "neutral";

export type Phase =
  | "lobby"
  | "roleReveal"
  | "night"
  | "nightReport"
  | "dayDiscussion"
  | "voting"
  | "voteResult"
  | "gameOver";
```

### 7.2 Server-only state

```ts
export interface ServerPlayer {
  id: PlayerId;
  tokenHash: string;        // SHA-256 of the raw token; never send or log the raw token
  name: string;
  roleId: RoleId;
  faction: Faction;
  alive: boolean;
  connected: boolean;
  joinedAt: number;         // epoch ms; used for mafia seniority and display order
  color: string;            // assigned server-side from a fixed palette
  eliminatedAt?: { phase: Phase; round: number; cause: "night" | "vote" };
}

export interface WhisperMessage {
  id: string;
  threadId: string;
  fromPlayerId: PlayerId;
  text: string;
  at: number;
}

export interface WhisperThread {
  id: string;
  participantIds: [PlayerId, PlayerId];
  messages: WhisperMessage[];
}

export interface GraveyardMessage {
  id: string;
  playerId: PlayerId;       // author
  text: string;
  at: number;
}

export interface GameAlert {
  id: string;
  kind: "kill" | "saved" | "investigation" | "vote" | "system" | "win";
  round: number;
  titleKey: string;
  detailKey: string;
  params?: Record<string, string | number>;
  at: number;
}

export interface RoomState {
  schemaVersion: 1;
  code: RoomCode;
  hostId: PlayerId;
  phase: Phase;
  round: number;
  phaseEndsAt: number | null;      // absolute epoch ms; null in lobby/gameOver
  createdAt: number;
  updatedAt: number;
  version: number;                 // increments on every accepted mutation
  seed: number;                    // seeded RNG state for deterministic replay
  config: RoomConfig;
  players: ServerPlayer[];
  readyIds: PlayerId[];            // living players ready for the current phase
  nightActions: Record<PlayerId, NightAction | undefined>;
  votes: Record<PlayerId, PlayerId | null>;
  voteTally: Record<PlayerId, number> | null;
  revoteUsed: boolean;
  eliminatedIds: PlayerId[];
  winner: Winner | null;
  whispers: WhisperThread[];
  whispersSentThisDay: Record<PlayerId, number>;
  graveyard: GraveyardMessage[];
  alertsByPlayer: Record<PlayerId, GameAlert[]>;
  pendingNightResult: NightResult | null;
}

export interface NightAction {
  kind: "kill" | "frame" | "investigate" | "protect";
  targetId: PlayerId;
  submittedAt: number;
}

export interface NightResult {
  deaths: PlayerId[];
  saved: PlayerId[];
  investigations: Record<PlayerId, "mafia" | "not-mafia">; // detectiveId -> result
}

export type Winner =
  | { faction: "mafia" }
  | { faction: "town" }
  | { faction: "neutral"; playerId: PlayerId; reason: "jester" };

export interface NightReportView {
  deaths: PlayerId[];
}
```

### 7.3 Room configuration

```ts
export interface RoomConfig {
  rolePreset: "default" | "custom";
  minPlayers: number;              // 3..16, per room (UI seat target)
  maxPlayers: number;              // 3..16, per room; min <= max
  roleCounts: Record<RoleId, number>;
  phaseDurations: Record<Exclude<Phase, "lobby" | "gameOver">, number>; // ms
  whisperBudget: number;           // per living player per day
  tieRule: "no-elimination" | "random" | "revote";
  revealRoleOnVote: boolean;       // default true; night deaths are never revealed
}
```

Two validation stages:

**At room creation (`POST /rt/rooms`)** — structural validation for Custom; Default uses
the composition function:

- `3 <= minPlayers <= maxPlayers <= 16`, both integers.
- Exactly one `godfather` if any mafia are configured; godfather count must not exceed 1.
- `framer` count = total mafia − 1.
- `detective <= 1`, `doctor <= 1`, `jester <= 1`.
- At least one town-aligned player.
- At least one mafia player.
- Durations: 10_000 ms ≤ value ≤ 600_000 ms.
- Whisper budget: 0–10.
- All counts are non-negative integers.

For `rolePreset: "default"`, `roleCounts` are ignored on input and recomputed from the
composition function for the current player count whenever someone joins. For
`rolePreset: "custom"`, the supplied counts are stored as the host's target and may be
edited in the lobby; they do **not** need to sum to the current player count yet.

**At start (`startGame`) and on every lobby config update** — composition validation:

- `roleCounts` sum equals the current number of joined players.
- `minPlayers <= joined count <= maxPlayers`.
- Structural rules above still hold.

The lobby start button is disabled until composition validation passes. A Custom room with
counts that do not match the joined count cannot start; the host either edits the counts or
waits for the right number of players.

### 7.4 Default role composition (config function)

These are the starting values for the **Default** preset. They live in
`game-core/config.ts` as `defaultRoleCountsFor(playerCount)`.

| Players | Godfather | Framer | Detective | Doctor | Jester | Villager |
|---:|---:|---:|---:|---:|---:|---:|
| 3 | 1 | 0 | 1 | 1 | 0 | 0 |
| 4 | 1 | 0 | 1 | 1 | 0 | 1 |
| 5 | 1 | 0 | 1 | 1 | 1 | 1 |
| 6 | 1 | 0 | 1 | 1 | 1 | 2 |
| 7 | 1 | 0 | 1 | 1 | 1 | 3 |
| 8 | 1 | 1 | 1 | 1 | 1 | 3 |
| 9 | 1 | 1 | 1 | 1 | 1 | 4 |
| 10 | 1 | 1 | 1 | 1 | 1 | 5 |
| 11 | 1 | 1 | 1 | 1 | 1 | 6 |
| 12 | 1 | 2 | 1 | 1 | 1 | 6 |
| 13 | 1 | 2 | 1 | 1 | 1 | 7 |
| 14 | 1 | 2 | 1 | 1 | 1 | 8 |
| 15 | 1 | 2 | 1 | 1 | 1 | 9 |
| 16 | 1 | 3 | 1 | 1 | 1 | 9 |

Formula: mafia = `max(1, floor(players / 4))`; neutral = 1 when players ≥ 5; town is the
remainder. One detective, one doctor when town ≥ 2, one jester when neutral, rest villagers.
This matches the owner's create-room screen.

For `rolePreset: "default"`, the server looks up the composition for the current joined
player count; joining/leaving in the lobby changes the planned composition automatically.
Custom rooms keep the host's explicit counts instead. Below 3 players there is no default
composition and `startGame` is blocked.

### 7.5 Default rules values

| Setting | Default |
|---|---|
| `roleReveal` duration | 60,000 ms |
| `night` duration | 90,000 ms |
| `nightReport` duration | 10,000 ms |
| `dayDiscussion` duration | 300,000 ms |
| `voting` duration | 60,000 ms |
| `voteResult` duration | 10,000 ms |
| Whisper budget | 3 per living player per day |
| Tie rule | `no-elimination` |
| Reveal role on vote elimination | true |

Custom room creation may override durations, whisper budget, tie rule, and role counts.
Role reveal policy is not configurable in v1.

---

## 8. Game rules specification

This section is the contract for `game-core/engine.ts`. Implement it exactly; add tests for
every rule.

### 8.1 Room lifecycle

1. Anyone can create a room. The creator becomes host and first player.
2. Room code is generated server-side, 5 characters, collision-checked.
3. Additional players join while `phase === "lobby"` and `players.length < 16`.
4. Names are trimmed, 1–20 characters, unique within the room (case-insensitive).
5. Host starts when `players.length >= 8` and role counts sum to the player count.
6. Roles are assigned randomly at start, including the host.
7. No joins after `startGame`.
8. After `gameOver`, host may start a rematch (deferred; see §18) or the room expires.

### 8.2 Phases and progression

```
lobby
  └─ host startGame ──► roleReveal
roleReveal ── all ready / timeout ──► night (round 1)
night ── all ready / timeout ── resolve ──► nightReport
nightReport ── all ready / timeout ──► gameOver if winner, else dayDiscussion
dayDiscussion ── all ready / timeout ──► voting
voting ── all ready / timeout ── resolve ──► voteResult
voteResult ── all ready / timeout ──► gameOver if winner, else night (round + 1)
```

- "All ready" means every **living** player is in `readyIds`.
- Entering a phase clears `readyIds`, clears phase-local actions/votes as appropriate, and
  sets `phaseEndsAt = now + config.phaseDurations[phase]`.
- At `phaseEndsAt`, the phase resolves with whatever was submitted. Missing night actions
  mean "no action". Missing votes are ignored (not counted as abstain targets).
- `lobby` and `gameOver` have `phaseEndsAt = null`.
- `round` starts at 1 and increments when entering `night` after `voteResult`.
- A win is **detected** when the elimination resolves, but the room remains in
  `nightReport` or `voteResult` so players see the result. `gameOver` is entered when that
  result phase ends. `winner` is already set during the result phase.

### 8.3 Ready semantics

| Phase | How a player becomes ready |
|---|---|
| `roleReveal` | `setReady` |
| `night` | Active role: `submitNightAction`; passive role: `setReady` |
| `nightReport` | `setReady` |
| `dayDiscussion` | `setReady` |
| `voting` | `castVote` |
| `voteResult` | `setReady` |

- `unsetReady` is allowed before the phase ends and clears that player's readiness plus
  their phase-local action/vote, so they can change their mind.
- An active role may call `setReady` without submitting an action; that means "no action
  this night" and is valid. Submitting an action also marks the player ready.
- Resubmitting `submitNightAction` or `castVote` overwrites the previous value and keeps the
  player ready. Last valid submission wins.
- Dead players are never counted in readiness and cannot submit.

### 8.4 Night actions

One action per living player with an active role. Passive roles have none.

`submitNightAction` includes an explicit `kind`, because a framer may have to choose
between framing and killing when the godfather is dead:

```ts
{ type: "submitNightAction"; kind: "kill" | "frame" | "investigate" | "protect"; targetId: PlayerId }
```

| Role | Allowed kinds | Target rules |
|---|---|---|
| Godfather | `kill` | Living player, not self |
| Framer | `frame`; plus `kill` if godfather is dead and this framer is senior | Living player, not self |
| Detective | `investigate` | Living player, not self |
| Doctor | `protect` | Living player, not self |
| Villager | none | — |
| Jester | none | — |

Mafia kill authority:

- If the godfather is alive, only the godfather's `kill` submission counts.
- If the godfather is dead, the living mafia with the lowest `joinedAt` (the senior framer)
  may submit `kill` instead of `frame`.
- Non-authorised mafia kill submissions are rejected with `NOT_AUTHORISED`.
- Each living framer may frame one target. Multiple framers may frame different targets.
- A framer who submits `kill` cannot also frame that night; one action per player.

### 8.5 Night resolution

Resolve once, when the night phase ends or all living players are ready:

1. **Doctor protection:** the protected target cannot die this night.
2. **Mafia kill:** the authorised target dies unless saved.
3. **Framer:** every framed target is marked "appears mafia" for this night only.
4. **Detective:** investigate the target with these rules, evaluated in order:
   - Godfather always appears `not-mafia`, even if framed.
   - A framed target appears `mafia`.
   - Otherwise the target's actual faction is returned (`mafia` for mafia, `not-mafia` for
     town and neutral).
5. Store `NightResult` in `pendingNightResult`.
6. Apply deaths: set `alive = false`, append to `eliminatedIds`, record `eliminatedAt` with
   `cause: "night"`.
7. Generate alerts:
   - All living players: death announcement (`kind: "kill"`).
   - Doctor whose target was attacked: `kind: "saved"`.
   - Detective: `kind: "investigation"` with the result.
   - Mafia: kill outcome (target died or survived).
8. Check win conditions after deaths and set `winner` if any condition is met.
9. Enter `nightReport`. Do not enter `gameOver` yet; if `winner` is set, the transition to
   `gameOver` happens when `nightReport` ends, so players see the deaths first.
10. `nightReport` reveals deaths only, never roles.

### 8.6 Day, whispers, and voting

- During `dayDiscussion`, living players may send whispers and mark ready.
- Whispers are private 1:1, only between two living players, and consume the sender's daily
  budget. Budget resets when `dayDiscussion` is entered.
- Dead players cannot whisper living players. Dead players use the graveyard.
- Voting: every living player votes for one living player other than themselves.
- When all living players have voted, or the timer expires, resolve:
  1. Count votes into `voteTally`. If no votes were cast, treat as "no elimination" and
     skip tie-breaking.
  2. Apply the tie rule:
     - `no-elimination`: no one dies on a tie.
     - `random`: pick one tied player using the room's seeded RNG.
     - `revote`: return to `voting` with only tied candidates and a fresh timer. One revote
       maximum; if still tied, no elimination. (Config accepted, but UI may be deferred.)
  3. Eliminate the winner, reveal their role if `revealRoleOnVote` is true.
  4. Check win conditions and set `winner` if any condition is met.
  5. Enter `voteResult`. Do not enter `gameOver` yet; if `winner` is set, the transition to
     `gameOver` happens when `voteResult` ends. Otherwise, the next `night` follows.

### 8.7 Win conditions

Evaluate in this order after every elimination:

1. **Jester:** if the eliminated player was the jester and the cause was `"vote"`, the
   jester is the winner. `winner` is set during vote resolution; `gameOver` follows the
   vote-result screen.
2. **Town:** if no living mafia remain, town wins.
3. **Mafia:** if living mafia count >= living non-mafia count, mafia wins.
4. Otherwise the game continues.

Night-killed jesters do not win. A jester eliminated by vote wins even if mafia parity is
also reached at that moment; jester is checked first.

Win detection happens during resolution, but `phase` stays in the result screen
(`nightReport` or `voteResult`) until that screen ends. The `gameOver` transition then
reveals all roles. This applies to every win condition.

### 8.8 Game over

- `winner` is set and `phase = "gameOver"`.
- The final view reveals every player's role, faction, and alive status.
- Dead players and living players see the same final reveal.
- No further commands except host `rematch` (deferred) or disconnect.

### 8.9 Alerts

Alerts are generated server-side per player and stored in `alertsByPlayer`. They use i18n
keys and params, never translated strings. Read state is tracked client-side (see §10.5).
Example keys to add under an `Alerts` namespace:

- `Alerts.killed.title` / `Alerts.killed.body`
- `Alerts.saved.title` / `Alerts.saved.body`
- `Alerts.investigation.mafia` / `Alerts.investigation.notMafia`
- `Alerts.vote.eliminated` / `Alerts.vote.tie`
- `Alerts.win.town` / `Alerts.win.mafia` / `Alerts.win.jester`

### 8.10 Randomness

All randomness goes through a seeded RNG in `game-core/random.ts` (e.g. `mulberry32`).
`RoomState` stores the seed so a snapshot restore reproduces role assignment and tie-breaks.
Do not call `Math.random()` in the engine. Tests inject fixed seeds.

---

## 9. Protocol

### 9.1 Transport and paths

- HTTP endpoints and WebSocket live in the realtime service.
- Path namespace: `/rt/*`. This lets Traefik route one prefix to the realtime container.
- WebSocket: `wss://<host>/rt/ws`.
- Create room: `POST /rt/rooms`.
- Join/reclaim: `POST /rt/rooms/:code/join`.
- Health: `GET /rt/health`.
- Optional readiness: `GET /rt/ready` (same as health).

Default client base derivation:

```ts
function realtimeBase(): string {
  const override = process.env.NEXT_PUBLIC_REALTIME_BASE;
  if (override) return override.replace(/\/$/, "");
  const scheme = location.protocol === "https:" ? "https:" : "http:";
  return `${scheme}//${location.host}/rt`;
}

function realtimeWsUrl(): string {
  const base = realtimeBase();
  return base.replace(/^http/, "ws") + "/ws";
}
```

`NEXT_PUBLIC_REALTIME_BASE` exists only for the dev direct-port and subdomain fallback
cases. When unset, everything is same-origin.

### 9.2 HTTP contracts

All bodies and responses are JSON. All endpoints validate `Origin` against
`ALLOWED_ORIGINS`. All error responses use:

```ts
interface ApiError {
  error: string;      // stable code, e.g. ROOM_NOT_FOUND
  messageKey: string; // i18n key for UI
  params?: Record<string, string | number>;
}
```

#### `POST /rt/rooms`

Request:

```json
{
  "name": "Alessia",
  "config": "default"
}
```

or

```json
{
  "name": "Alessia",
  "config": {
    "rolePreset": "custom",
    "minPlayers": 8,
    "maxPlayers": 8,
    "roleCounts": { "godfather": 1, "framer": 1, "detective": 1, "doctor": 1, "jester": 1, "villager": 3 },
    "phaseDurations": { "roleReveal": 60000, "night": 90000, "nightReport": 10000, "dayDiscussion": 300000, "voting": 60000, "voteResult": 10000 },
    "whisperBudget": 3,
    "tieRule": "no-elimination",
    "revealRoleOnVote": true
  }
}
```

`config: "default"` expands to `rolePreset: "default"` with the standard durations, budget,
and tie rule. Default `roleCounts` are recomputed from the composition function as players
join. Custom counts are the host's target and are validated against the joined player count
at start (see §7.3).

Response `201`:

```json
{
  "code": "KQX2M",
  "playerId": "p_01J...",
  "token": "<opaque 32-byte base64url>"
}
```

The raw token is returned exactly once. The server stores only its SHA-256 hash. The client
stores the token in `localStorage` under `cosa.token.<code>`.

#### `POST /rt/rooms/:code/join`

Request:

```json
{ "name": "Marco", "token": "optional-existing-token" }
```

Behavior:

- If `token` matches an existing player in the room, reclaim that seat and ignore `name`.
- Else if the room is in `lobby` and has capacity, create a player and return a new token.
- Else reject with `GAME_STARTED` or `ROOM_FULL` or `ROOM_NOT_FOUND`.

Response `200`:

```json
{ "code": "KQX2M", "playerId": "p_01K...", "token": "<opaque base64url>" }
```

#### `GET /rt/health`

```json
{ "ok": true, "rooms": 3, "sockets": 21, "uptimeSeconds": 1234, "version": "1.0.0" }
```

Return `200` when the event loop is responsive. No hidden data.

### 9.3 WebSocket handshake

The browser opens `ws(s)://.../rt/ws` and must send `hello` within 5 seconds. The server
checks the HTTP `Origin` header during the upgrade against `ALLOWED_ORIGINS` and rejects
disallowed origins with HTTP 403 before the socket is established.

Hello frame:

```ts
interface HelloFrame {
  type: "hello";
  code: RoomCode;
  token: string;
}
```

Server responses:

- Success: a `sync` frame (a full `PlayerView`). The socket is now bound to that player.
- Failure: an `error` frame, then close with code `4401` for invalid token, `4404` for
  unknown room, or `4409` for duplicate/conflicting connection.
- Multiple sockets for the same player are allowed only if the implementation chooses
  "newest wins". **Locked for v1:** newest socket wins; the server closes the older socket
  with code `4001` (`REPLACED_BY_NEW_CONNECTION`). This makes multi-tab behavior predictable.

### 9.4 Frames

Client to server:

```ts
type ClientFrame =
  | HelloFrame
  | { type: "command"; id: string; command: Command }
  | { type: "ping"; t: number };
```

Server to client:

```ts
type ServerFrame =
  | {
      type: "sync";
      version: number;
      serverNow: number;
      ackId?: string;
      view: PlayerView;
    }
  | { type: "pong"; t: number; serverNow: number }
  | {
      type: "error";
      id?: string;
      code: string;
      messageKey: string;
      params?: Record<string, string | number>;
    };
```

Rules:

- Every accepted command increments `version` and produces a `sync` for every connected
  player (projected individually) plus any relevant HTTP/health state.
- The sender's `sync` carries `ackId` equal to the command `id`, so the client can resolve
  the pending action.
- Rejected commands do not increment `version`; the sender receives `error` with the same
  `id`. Other clients receive nothing.
- `serverNow` is epoch milliseconds. Clients compute `offset = serverNow - Date.now()` and
  use it for countdowns. Clamp large jumps.
- `version` is monotonically increasing per room. A client that sees a lower version than
  its current view ignores the frame (out-of-order protection).
- Full snapshots mean no deltas and no client merge logic. Keep frames small by never
  including other players' hidden data.

### 9.5 Commands (locked list for v1)

```ts
type Command =
  | { type: "setReady" }
  | { type: "unsetReady" }
  | { type: "startGame" }
  | { type: "submitNightAction"; kind: "kill" | "frame" | "investigate" | "protect"; targetId: PlayerId }
  | { type: "castVote"; targetId: PlayerId }
  | { type: "sendWhisper"; toPlayerId: PlayerId; text: string }
  | { type: "sendGraveyardMessage"; text: string }
  | { type: "updateConfig"; config: RoomConfig }
  | { type: "leaveRoom" }
  | { type: "rematch" }; // deferred; may return NOT_IMPLEMENTED until phase 7
```

Validation summary:

- `startGame`: host only, lobby only, 3–16 players, role counts valid and sum to players.
- `updateConfig`: host only, lobby only, validated config. Default-preset rooms may still
  update non-role fields; if the host switches to Custom, explicit counts are required.
- `submitNightAction`: night only, living, allowed `kind` for the role, correct actor
  authority for `kill`, living target, not self.
- `castVote`: voting only, living, living target, not self.
- `sendWhisper`: dayDiscussion only, living sender and recipient, budget remaining,
  non-empty text ≤ 500 chars.
- `sendGraveyardMessage`: dead only, non-empty text ≤ 500 chars.
- `leaveRoom`: lobby only; removes the player. In-game leave is not supported; closing the
  tab is a disconnect and the seat is held.
- All commands: player must belong to the room and be connected on that socket.

### 9.6 Idempotency and ordering

- Each command has a client-generated UUID `id`.
- The server keeps the last 32 command ids per player with their resulting version.
- Replaying an id returns the current `sync` with `ackId` set; no state change.
- Commands are processed serially per room. The Node event loop plus a synchronous engine
  reducer makes this straightforward; do not introduce async mutation paths inside a room.

### 9.7 Rate limits and limits

- Max frame size: 8 KiB.
- Commands: token bucket, 10 per second burst, 60 per minute per socket.
- Whisper: at most 1 per 500 ms per player.
- Join attempts: 10 per minute per IP per room.
- Room creation: 5 per hour per IP.
- Behind Traefik, read the client IP from `X-Forwarded-For` only when the proxy is trusted
  (it is the only ingress). Do not trust that header if the server is ever exposed directly.
- Display name: 1–20 characters after trim; strip control characters; reject empty.
- Message text: 1–500 characters after trim.
- Room codes: 5 chars from `ABCDEFGHIJKLMNOPQRSTUVWXYZ`.

---

## 10. Server design (`realtime/`)

### 10.1 Process bootstrap

`realtime/src/index.ts`:

1. Read and validate env with zod.
2. Create `RoomRegistry`.
3. Load snapshots from `DATA_DIR/rooms/*.json`; mark all players disconnected; reschedule
   timers.
4. Start an HTTP server:
   - `GET /rt/health`
   - `POST /rt/rooms`
   - `POST /rt/rooms/:code/join`
   - everything else: `404`
5. Attach `WebSocketServer({ noServer: true })`.
6. Handle `upgrade` only for `/rt/ws`; reject other paths with `404`.
7. On `SIGTERM`/`SIGINT`: stop accepting, flush snapshots, close sockets, exit.
8. Log a structured startup line with port, data dir, allowed origins, and version.

### 10.2 Environment

```ts
interface Env {
  PORT: number;                 // default 3001
  DATA_DIR: string;             // default "./data"
  ALLOWED_ORIGINS: string;      // comma-separated, e.g. "https://game.example.com"
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  ROOM_LOBBY_TTL_MS: number;    // default 2h
  ROOM_GAMEOVER_TTL_MS: number; // default 15m
  ROOM_EMPTY_TTL_MS: number;    // default 1m, zero-socket rooms
  SNAPSHOT_DEBOUNCE_MS: number; // default 250
}
```

- `ALLOWED_ORIGINS` must include the exact scheme+host, no trailing slash.
- In development, allow `http://localhost:3000` and `http://<LAN-IP>:3000` explicitly. Do
  not use `*` in production.
- Never log tokens.

### 10.3 Room registry

- `Map<RoomCode, Room>`.
- `create(config, name)`:
  - generate code, retry on collision up to 10 times;
  - create `RoomState` with host/player, hashed token, seeded RNG;
  - register, persist, return `{ code, playerId, token }`.
- `join(code, name, token?)`:
  - normalize `code` to uppercase before lookup;
  - find room; if missing → `ROOM_NOT_FOUND`;
  - if token matches hash → reclaim; do not change the name on reclaim;
  - if phase !== "lobby" → `GAME_STARTED`;
  - if full → `ROOM_FULL`;
  - validate name uniqueness; create player and token.
- `leave(code, playerId)`:
  - lobby only; remove the player and their token;
  - if the host leaves and other players remain, transfer host to the player with the
    lowest `joinedAt`;
  - if no players remain, delete the room;
  - in-game voluntary leave is rejected (`GAME_STARTED`); closing the tab is a disconnect.
- `delete(code)`: close sockets, delete snapshot.
- `cleanup()`: every 60 seconds, delete rooms with no sockets for longer than the
  empty TTL (default 1m), before start for longer than the lobby TTL, or after
  `gameOver` for longer than the game-over TTL. Log the reason and per-player
  `lastSeenAt`.
- Only one instance. Do not add clustering.

### 10.4 Room class

Responsibilities:

- Own `RoomState` and the room's socket map `Map<PlayerId, WebSocket>`.
- `connect(playerId, socket)` and `disconnect(playerId, socket)`; set `connected` and
  broadcast a sync when presence changes (presence is visible as connected/not).
- `handleCommand(playerId, commandId, command, now)`:
  - validate membership, rate limits, idempotency;
  - call `reduce(state, command, now)` from `game-core`;
  - on success, bump version, update timestamps, schedule/flush timer, broadcast projected
    syncs;
  - on failure, return an error to that sender only.
- `tick(now)`:
  - if `phaseEndsAt !== null && now >= phaseEndsAt`, call `advancePhase(state, now)` and
    broadcast.
- `schedule()`:
  - clear existing timer;
  - if `phaseEndsAt` is null, stop;
  - `setTimeout(() => tick(Date.now()), max(0, phaseEndsAt - Date.now()))`;
  - one timer per room; no interval polling.
- `broadcast()`:
  - for each connected player, compute `project(state, playerId)` and send a sync.
  - Build the view fresh per player; do not mutate a shared object.

### 10.5 Clock and timers

- Engine functions accept `now: number`; never call `Date.now()` inside `game-core`.
- Room timer uses absolute `phaseEndsAt`.
- On process restore, `phaseEndsAt` may be in the past: tick immediately, which resolves
  the phase with stored actions.
- On system clock changes, the next tick recomputes from `Date.now()`; acceptable for this
  game. Do not use relative countdowns.

### 10.6 Snapshot store

- Path: `${DATA_DIR}/rooms/${code}.json`.
- Content: `{ schemaVersion, savedAt, state }`.
- Write on every accepted state change, debounced `SNAPSHOT_DEBOUNCE_MS` (250 ms default),
  plus immediate flush on `gameOver`, on `SIGTERM`, and after room creation. A hard crash
  can lose up to the last debounce window; that is acceptable for this game.
- Atomic write: write `${file}.tmp`, `fsync`, `rename` over the target.
- On load, validate with the same schema and skip corrupt files with a warning; never crash
  the process for one bad room.
- Never store raw tokens; `ServerPlayer.tokenHash` is already hashed.
- Do not store sockets, timers, or transient `connected` values as authoritative. On load,
  set `connected = false` for everyone; clients reconnect.
- Persist `schemaVersion` and migrate explicitly if the shape changes.

### 10.7 Logging and health

- Structured JSON logs: `{ level, time, event, roomCode?, playerId?, command?, error? }`.
- Log room creation/join/start/gameOver, rejected commands at `warn`, unexpected errors at
  `error` with stack.
- Do not log message text, tokens, or full snapshots at `info`.
- `/rt/health` returns room/socket counts and uptime. A failing event loop should fail the
  container healthcheck.

### 10.8 Security boundaries

- The server is the only source of truth. Never trust client-provided roles, factions,
  alive status, timers, versions, or player ids.
- Every command re-validates phase, membership, alive status, and target legality.
- Projection is the only place that decides what a player may see. Add tests for leaks.
- Protect against oversized frames, invalid JSON, unknown frame types, and unhandled
  promise rejections.
- On `uncaughtException`, log and exit; let the process manager restart cleanly. Do not
  continue with corrupted state.

---

## 11. Client design (`components/room/`)

### 11.1 Responsibilities

- Store the room code and token.
- Open and maintain one WebSocket.
- Keep the latest `PlayerView`.
- Expose actions that send commands.
- Handle reconnect, errors, and clock offset.
- Keep read receipts and draft text locally.

### 11.2 Files

```
components/room/
├── room-provider.tsx      # connection lifecycle + context
├── use-room.ts            # hook: { status, view, actions, error }
├── transport.ts           # WS client, backoff, heartbeat, command ids
├── storage.ts             # token/name/room-code persistence
├── api.ts                 # createRoom/joinRoom HTTP calls
└── clock.ts               # server offset + countdown helpers
```

### 11.3 State shape

```ts
type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

interface RoomContextValue {
  status: ConnectionStatus;
  view: PlayerView | null;
  error: { code: string; messageKey: string; params?: Record<string, string | number> } | null;
  actions: {
    setReady(): void;
    unsetReady(): void;
    startGame(): void;
    submitNightAction(kind: "kill" | "frame" | "investigate" | "protect", targetId: PlayerId): void;
    castVote(targetId: PlayerId): void;
    sendWhisper(toPlayerId: PlayerId, text: string): void;
    sendGraveyardMessage(text: string): void;
    updateConfig(config: RoomConfig): void;
    leaveRoom(): void;
  };
  pendingCommandId: string | null;
}
```

- Actions are fire-and-forget from the UI's perspective. Disable buttons while a matching
  pending command exists; clear on `sync` with `ackId` or on `error` with the id.
- No optimistic mutation of game state. The server confirms; the next snapshot updates the
  UI. For text sends, clear the composer only after the ack (or immediately with a local
  "sending" state; choose one and be consistent).
- Read state is local: `cosa.read.<code>` stores `{ threads: Record<threadId, lastReadAt>,
  alertsReadAt }`. Compute unread counts from message/alert timestamps. This avoids
  server commands for marking read and keeps snapshots smaller.

### 11.4 Connection lifecycle

1. On mount, read `code` from the route and token from storage.
2. If missing, set `idle`; the join/create screens handle navigation.
3. Set `connecting`, open WS.
4. On `open`, send `hello { code, token }`.
5. On first `sync`, set `connected`, store offset, hide loading.
6. On close:
   - `4401`/`4404`: clear token for that room, set `error`, route to join.
   - `4001`: do not auto-reconnect (another tab owns the seat); show a notice.
   - otherwise: set `reconnecting`, exponential backoff 500 ms → 10 s with jitter, retry
     indefinitely while the page is visible.
7. On `online` and `visibilitychange` → visible, reconnect immediately.
8. Heartbeat: send `ping` every 25 s; if no `pong` for 60 s, force close and reconnect.
9. On unmount, close the socket and clear timers.

### 11.5 Route flow

Implemented route flow (flat URLs, active room in `localStorage`):

```
/                       landing (join code / create link)
/create                 host room setup
/join?code=ABC12         name entry
/lobby                  waiting room; host starts
/play                   phase router
/whispers
/whispers/[playerId]
/alerts
/graveyard
/codex                  static reference
/admin                  host info; server-owned phase note in live mode
/live, /live/[code]     Phase 3 live verification screen
```

The earlier room-scoped sketch below was not implemented. The root `GameProvider` restores
the last room + token and connects; `app/(game)/layout.tsx` keeps the shell and timer
mounted across game routes.

Historical sketch (not implemented):

```
/                       landing (name, create room, join code)
/join/[code]            name entry, calls POST /rt/rooms/:code/join
/room/[code]/lobby      waiting room; host starts
/room/[code]/play       phase router (existing switch)
/room/[code]/whispers
/room/[code]/whispers/[playerId]
/room/[code]/alerts
/room/[code]/graveyard
/room/[code]/settings   host config (Default/Custom) before start
/codex                  static reference
```

- Redirect `/lobby`, `/play`, `/whispers`, `/alerts`, `/graveyard`, `/admin` to the
  room-scoped routes using the last active room code, or remove them after migration.
- `/admin` becomes `/room/[code]/settings`; remove skip/kill-self controls. The host can
  update config and start the game only.
- Keep the existing `max-w-md` shell and mobile-first layout. Do not redesign.

### 11.6 Migration strategy

- Add `NEXT_PUBLIC_GAME_MODE=mock|live` (default `mock` during migration, then `live`).
- Keep `GameProvider` and seed data until the live path passes end-to-end tests.
- Introduce `RoomProvider` alongside; `useRoom()` is the new contract.
- Mount `RoomProvider` in `app/room/[code]/layout.tsx`, not the root layout, so it can read
  the route's room code. In Next 16, `params` is a Promise: await it in the server layout
  and pass the string to the client provider. The root layout keeps only global providers
  and the `max-w-md` shell. In mock mode, keep `GameProvider` at the root for the legacy
  routes.
- Keep the game chrome (`AppShell`, `PhaseTimer`, `BottomNav`) in a shared route-group
  layout such as `app/(game)/layout.tsx`, with game pages beneath it. A route group keeps
  URLs unchanged while preserving the timer across `bottom-nav` navigation. Do not put
  `AppShell` inside each page; that remounts the timer and restarts its progress bar.
- Make `AppShell`, `BottomNav`, `PhaseTimer`, and `RolePeekButton` accept room data via
  `useRoom()` or props after migration. `BottomNav` links must include the room code.
- Keep `/codex` independent of room state: either move it under `/room/[code]/codex` or
  refactor it to render without `AppShell`'s room-dependent header.
- Move screens one at a time to `useRoom()`. A screen should not read both contexts.
- After all screens are migrated, remove `GameProvider`, `useGame`, seeds, and bot logic.
- Keep the seed data under `components/game/__fixtures__/` only for stories/tests if useful.

### 11.7 URL and storage keys

| Key | Value |
|---|---|
| `cosa.token.<ROOMCODE>` | raw token string |
| `cosa.name` | last display name |
| `cosa.lastRoom` | last room code |
| `cosa.read.<ROOMCODE>` | JSON read receipts |

- Tokens are bearer credentials without accounts. Anyone with the token can act as that
  player. Never put tokens in URLs or logs.
- Clearing browser storage loses the seat. The seat remains held server-side until the game
  ends. Document this in the UI.

---

## 12. `PlayerView` and projection

### 12.1 View shape

```ts
export interface PlayerSummary {
  id: PlayerId;
  name: string;
  alive: boolean;
  connected: boolean;
  isYou: boolean;
  color: string;
  roleId: RoleId | null;   // only when the viewer is allowed to see it
  faction: Faction | null; // same visibility rule as roleId
}

export interface PublicRoomConfig {
  rolePreset: "default" | "custom";
  minPlayers: number;
  maxPlayers: number;
  phaseDurations: Record<Exclude<Phase, "lobby" | "gameOver">, number>;
  whisperBudget: number;
  tieRule: "no-elimination" | "random" | "revote";
  revealRoleOnVote: boolean;
}

export interface WhisperThreadView {
  id: string;
  participantIds: [PlayerId, PlayerId];
  messages: WhisperMessage[];
}

export interface PlayerView {
  code: RoomCode;
  version: number;
  serverNow: number;
  phase: Phase;
  round: number;
  phaseEndsAt: number | null;
  hostId: PlayerId;
  isHost: boolean;
  config: PublicRoomConfig;
  hostConfig?: RoomConfig;     // lobby only, host only
  you: PlayerSummary;
  players: PlayerSummary[];
  livingCount: number;
  readyIds: PlayerId[];
  waitingCount: number;
  yourRole: RoleId;
  yourFaction: Faction;
  yourAction: NightAction | null;
  yourVote: PlayerId | null;
  voteTally: Record<PlayerId, number> | null;
  eliminatedIds: PlayerId[];
  winner: Winner | null;
  whispers: WhisperThreadView[];
  whispersLeft: number;               // 0 for dead players
  graveyard: GraveyardMessage[];      // empty for living players
  alerts: GameAlert[];
  nightReport: NightReportView | null;
  canStart: boolean;                  // host-only convenience
  canAct: boolean;
  canVote: boolean;
}
```

`hostConfig` visibility:

- In `lobby`, the host sees full role counts via `hostConfig`. Other players see only
  `PublicRoomConfig`, which excludes `roleCounts`, so the composition is not spoiled before
  start.
- `hostConfig` is omitted for non-hosts and outside the lobby.
- After `roleReveal`, role counts are public through the dealt roles; no extra field needed.
- If the screens do not need the distinction, hide `hostConfig` behind a host-only settings
  screen. Do not leak it to non-hosts.

### 12.2 Visibility rules

| Data | Visible to |
|---|---|
| Own role/faction | Self always |
| Other players' role/faction | Mafia teammates (living or dead) see mafia teammates; everyone sees all at `gameOver` |
| Night death roles | Never revealed |
| Voted-out role | Revealed if `revealRoleOnVote` |
| Whisper thread | The two participants only |
| Graveyard | Dead players; all players read-only at `gameOver` |
| Vote choices | Hidden until `voteResult`; tally public |
| Night actions | Self; mafia kill target visible to mafia teammates; framer/detective/doctor only self |
| Connected status | Everyone |
| Alerts | Per player only |
| Token/tokenHash | Never leaves the server |

### 12.3 Projection tests (must exist)

- A town player's snapshot contains no other `roleId`/`faction` values.
- A mafia player sees mafia teammates' roles but no town roles.
- A dead player sees no living roles and an empty or graveyard-only view.
- `gameOver` reveals all roles.
- A player only sees whisper threads they participate in.
- A living player's `graveyard` is empty.
- No frame contains `token`, `tokenHash`, or `allPlayers` raw state.
- Alerts contain no other players' private results.

---

## 13. Screen contracts

The project owner designs the visuals. These are the data/action contracts each screen must
use. Keep all screens mobile-first and shadcn-based per `CLAUDE.md`.

| Screen / route | Reads from `view` | Actions | Notes |
|---|---|---|---|
| Landing `/` | — | Create room, enter code | Redirect to `/join/[code]` or room creation |
| Join `/join/[code]` | — | `joinRoom` HTTP | Name input; store token; route to lobby |
| Room onboarding `/room/[code]/settings` | `hostId`, `hostConfig`, `players.length` | `updateConfig` | Host only; Default/Custom; role counts from `hostConfig` only |
| Lobby `/room/[code]/lobby` | `players`, `code`, `canStart`, `isHost` | `startGame`, leave | Show connected/disconnected; copy invite link; start disabled until valid. Lobby has no readiness step. |
| Role reveal `/room/[code]/play` (`roleReveal`) | `yourRole`, `yourFaction`, `phaseEndsAt` | `setReady` | Do not render other roles |
| Night action (`night`) | `yourRole`, `yourAction`, `canAct`, `players`, `readyIds` | `submitNightAction`, `setReady` for passive | Target rules from role; disabled when ready |
| Night report (`nightReport`) | `nightReport`, `alerts` | `setReady` | Deaths only; no roles |
| Day discussion (`dayDiscussion`) | `players`, `readyIds`, `whispers`, `whispersLeft` | `setReady`, whisper navigation | Whisper budget visible |
| Voting (`voting`) | `players`, `yourVote`, `canVote` | `castVote` | Exclude self; show ready state |
| Vote result (`voteResult`) | `voteTally`, `eliminatedIds`, revealed role if any | `setReady` | No hidden votes |
| Game over (`gameOver`) | `winner`, all roles, `players` | `rematch` (deferred) | Final reveal |
| Spectator (`dead` during any phase) | `players`, `graveyard`, `phase` | `sendGraveyardMessage` | Dead chat; living roles hidden |
| Whispers list | own threads + last message, `whispersLeft` | navigation | Unread computed locally |
| Whisper thread | own thread messages, recipient status, budget | `sendWhisper` | Disable for dead recipient/sender or zero budget |
| Graveyard | `graveyard`, dead status | `sendGraveyardMessage` | Locked for living players |
| Alerts | own alerts, read state | local mark-read | Server sends keys/params |
| Codex | static | none | Keep current content |
| Room settings (admin replacement) | host config, players | `updateConfig`, `startGame` | No skip/kill-self |

### 13.1 UI states to handle

- `connecting` / `reconnecting` banner.
- `error` with i18n key and retry.
- Room not found / game already started / room full.
- Replaced by another tab.
- Empty lobby, empty whispers, empty alerts, empty graveyard.
- Disabled controls with reasons (not host, not alive, not your phase, budget exhausted,
  waiting for other players).
- Timer based on `phaseEndsAt` and server offset; never local decrementing counters that
  drift.

### 13.2 Do not

- Do not show other players' roles in DOM or client state before allowed.
- Do not rely on `isYou` flags from the server for other players; the server sends
  `isYou` only for the viewer, computed per projection.
- Do not read `window` at module top level in server components.
- Do not import `realtime/` or `ws` into client components.
- Do not hardcode a room code or player seed in the live path.

---

## 14. i18n

- Server-originated user-facing text is always an i18n key + params.
- Add namespaces to `messages/en.json` and `messages/nl.json`:
  `Errors`, `Alerts`, `Room`, `Host`, `Connection`, `Spectator`, `GameOver`.
- Keep existing namespaces where possible to reduce screen churn.
- User-generated content (names, whispers, graveyard messages) is rendered as plain text.
  React escapes it; do not use `dangerouslySetInnerHTML`.
- Dutch translations can be added incrementally; do not block the implementation on them.

---

## 15. Testing strategy

### 15.1 Unit tests (`game-core`)

- Room creation, join, capacity, duplicate names, reclaim by token hash.
- Role assignment for every player count 3–16; deterministic with fixed seed.
- Config validation: every rejection path.
- Phase transitions and round increments.
- Ready semantics per phase; timeout resolution with missing actions.
- Night resolution: kill, save, frame, investigate, godfather immunity, doctor self-target
  rejection, mafia authority when godfather dies.
- Win conditions: town, mafia parity, jester vote, jester night death (no win), priority
  when jester and parity coincide.
- Vote tally and all tie rules.
- Projection privacy matrix from §12.3.
- Snapshot restore equivalence: `reduce` over a command sequence equals fresh replay.

### 15.2 Integration tests (`realtime`)

- Start the server on an ephemeral port with a temp `DATA_DIR`.
- Use `ws` clients to create/join a room and play a full deterministic game.
- Assert each client receives only its projection.
- Reconnect with the same token reclaims the seat.
- Reconnect with a bad token fails.
- Newest socket wins; older socket receives close `4001`.
- Room full, game started, unknown room errors.
- Duplicate command id is idempotent.
- Rate limits.
- Kill the server mid-game, restart, assert the room restores and timers resolve.
- Snapshot corruption is skipped without crashing.

### 15.3 E2E tests (Playwright)

- At least two browser contexts (`alice`, `bob`) in one room; verify distinct roles.
- Full happy path: create → join 8 players (script the extra contexts or use API shortcuts)
  → start → ready through phases → finish.
- Whisper privacy: alice sends to bob; a third player never sees it.
- Dead player: sees graveyard, cannot vote/whisper living.
- Refresh mid-game reclaims the seat.
- Mobile viewport 375×667 with no horizontal scroll.

### 15.4 Manual checks

- Phone over LAN with Caddy proxy.
- Restart the realtime container during a game; clients reconnect and the game continues.
- Deploy a new web image while a game is active; sockets survive (web and realtime are
  separate containers).
- Slow network / offline / back-online behavior.

### 15.5 Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

All must pass before handoff.

---

## 16. Roadmap

Rough effort assumes one implementation agent. UI screen design/implementation by the owner
runs in parallel. Do not start a phase until its dependencies are green.

| Phase | Scope | Rough effort |
|---|---|---|
| 0 | Guardrails and scaffolding | 0.5–1 day |
| 1 | Shared contracts and game engine | 2–3 days |
| 2 | Realtime server | 3–4 days |
| 3 | Client transport and provider | 2–3 days |
| 4 | Screen migration (owner-led UI) | 3–5 days |
| 5 | Hardening and polish | 2–3 days |
| 6 | Deployment | 1–2 days |
| 7 | Deferred extras | not scheduled |

Total: roughly 2–3 weeks for one agent, excluding visual design and translation. Estimates
are for sequencing, not commitments.

### Phase 0 — Guardrails and scaffolding

**Goal:** make the repo safe to change and deployable as two containers.

Tasks:

- Add this document.
- Add dev dependencies: `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `tsup`,
  `tsx`, `@types/ws`, `concurrently` (optional).
- Add runtime dependencies: `zod`, `ws`, and `pino` (or a small JSON logger).
- Add `output: "standalone"` in `next.config.ts`.
- Add root `Dockerfile` (Next multi-stage), `realtime/Dockerfile`, `compose.yaml`,
  `compose.local.yaml`, `Caddyfile.local`.
- Add `.dockerignore`.
- Add CI (GitHub Actions or Coolify-only). Minimum: typecheck, lint, tests, build.
- Add a trivial smoke test so `vitest` exits successfully before the real suites exist.
- Keep the mock app working.

Acceptance:

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass.
- `docker compose -f compose.local.yaml up --build` serves a placeholder page and
  `curl localhost:8080/rt/health` returns OK once the realtime skeleton exists.
- No app behavior changed yet.

### Phase 1 — Shared contracts and game engine

**Goal:** a pure, tested game engine with no networking.

Tasks:

- Create `game-core/types.ts`, `config.ts`, `random.ts`, `engine.ts`, `projection.ts`,
  `protocol.ts`, `index.ts`.
- Implement the full rules in §8 and config validation in §7.3.
- Implement the Default composition table and default rule values.
- Implement projection with the visibility matrix in §12.
- Add unit tests from §15.1.
- Keep the engine synchronous and clock-injected (`now` parameter).

Acceptance:

- A headless script can simulate an 8-player game from start to gameOver.
- All privacy tests pass.
- No Node, Next, browser, or Cloudflare imports in `game-core`.
- `pnpm test` green.

### Phase 2 — Realtime server

**Goal:** rooms and WebSockets work end-to-end with no UI.

Tasks:

- Implement `realtime/src/index.ts`, `env.ts`, `http.ts`, `room-registry.ts`, `room.ts`,
  `connection.ts`, `snapshot-store.ts`, `timer.ts`, `rate-limit.ts`, `logger.ts`.
- Implement HTTP create/join/health and WS hello/command/sync/error/ping.
- Implement snapshot write/restore and room cleanup.
- Implement command validation, idempotency, rate limits, and origin checks.
- Add integration tests from §15.2.
- Add a small CLI/dev script to create a room and drive sockets for manual testing.

Acceptance:

- Two `ws` clients join, start, and receive different projections.
- A full headless 8-client game completes.
- Server restart mid-game restores state and timers.
- No hidden data in any frame (asserted by tests).
- `GET /rt/health` reports rooms/sockets.

### Phase 3 — Client transport and provider

**Goal:** the browser can join a room and render a live view, alongside the mock.

Tasks:

- Implement `components/room/api.ts`, `storage.ts`, `transport.ts`, `clock.ts`,
  `room-provider.tsx`, `use-room.ts`.
- Implement reconnect, heartbeat, status, command pending, and error mapping.
- Add `NEXT_PUBLIC_GAME_MODE=mock|live` and mount `RoomProvider` in
  `app/room/[code]/layout.tsx` when live. Keep the root layout free of room-specific state.
- Add a minimal debug screen or adapt `/room/[code]/lobby` to prove sync.
- Keep `GameProvider` available in mock mode.

Acceptance:

- Two browser tabs/players create/join a room and see each other's ready changes live.
- Refresh reclaims the seat.
- Killing the realtime process triggers reconnect and recovery after restart.
- Mock mode still works.

Implementation note: `/live` and `/live/[code]` are the Phase 3 verification screen. They are
not the final game UI. `tests/e2e/live.spec.ts` drives eight isolated browser contexts
through create → 8 joins → start → roleReveal → ready → night → reconnect, plus a
started-game join rejection. The owner's `/create`, `/join`, `/lobby`, and `(game)` screens
remain on the mock provider until Phase 4.

### Phase 4 — Migrate screens

**Goal:** full game playable through the real server.

Tasks:

- Keep the owner's flat routes (`/create`, `/join?code=`, `/lobby`, `(game)/*`) and the
  route-group layout; do not introduce `/room/[code]` URLs. Active room + token live in
  `localStorage`.
- Wire join/create onboarding, lobby, role reveal, night action, night report, day,
  voting, vote result, game over, spectator, whispers, alerts, graveyard, and admin.
- Introduce a live adapter behind the existing `useGame()` contract so screens keep their
  visual design while reading `PlayerView` and sending real commands.
- Add async create/join handling, loading/error states, and host-only `canStart`.
- Add ready controls for passive night roles, night report, and vote result.
- Hide role peek in the lobby (server role is a placeholder until `roleReveal`).
- Keep `/codex` static.
- Keep mock mode behind `NEXT_PUBLIC_GAME_MODE=mock`; Docker builds live.

Acceptance:

- A live 3–16-player game runs end-to-end on a 375px viewport.
- Dead players see spectator + graveyard only.
- Whispers are private.
- No screen reads the mock game data in live mode.
- `pnpm typecheck`, `pnpm lint`, tests, and build pass.

Implementation note: the adapter is `components/game/live-game-provider.tsx` plus
`components/game/game-context.ts`; `components/game/game-provider.tsx` selects mock vs live.
The owner's screens were not rewritten to consume `useRoom()` directly; the adapter maps
`PlayerView` into the existing `GameState`/`GameContextValue` shape to preserve the UI. This
is a deliberate deviation from the original `useRoom()`-per-screen plan. `tests/e2e/game.spec.ts`
verifies the real screens (create via API, three players, start, role reveal, night,
reconnect); `tests/e2e/live.spec.ts` verifies eight players and the raw live path.

### Phase 5 — Hardening and polish

**Goal:** survive real parties and bad networks.

Tasks:

- Add connection banner, retry UI, and typed error toasts (shadcn).
- Handle room full, game started, replaced-by-tab, expired room.
- Add countdown sync tests and clock-offset clamping.
- Add disabled-state reasons and accessibility checks.
- Add rate-limit feedback.
- Test with 16 players and long day phases.
- Device test on iOS Safari and Android Chrome.
- Add a chaos script: kill sockets, restart server, redeploy web mid-game.

Acceptance:

- No silent failures; every error has a user-visible, translated message.
- Reconnect works within 2 seconds on a normal network.
- A server restart mid-game preserves the room and resumes timers.
- Mobile checks pass at 320px and 375px.

Implementation note (Phase 5):

- `components/game/connection-banner.tsx` shows connecting/reconnecting/error state in
  `AppShell` and the lobby. WS command errors surface there with translated `Errors.*`
  messages; a successful sync clears them.
- `RoomSocket` reconnects immediately on `online` / visible tab, keeps one socket per seat,
  and ignores superseded sockets. Backoff is 500ms–10s with jitter.
- `offsetFrom` clamps server clock skew to ±5 minutes.
- E2E now covers: host-only start, removed legacy hint, 320px no-horizontal-scroll,
  auto-read alert ordering, no Ready control on dawn/vote-result, and vote-result timing.
- CI has a separate Playwright + Docker Compose E2E job.
- Still not covered by browser tests: a full game through game-over, an explicit
  16-player UI load test, iOS Safari/real-device runs, and an automated chaos script.
  Engine/integration tests cover 16-player role setup and server restart recovery.

### Phase 6 — Deployment

**Goal:** production URL on the VPS via Coolify.

Tasks:

- Finalize Dockerfiles and `compose.yaml`.
- Add healthchecks and restart policies.
- Add Coolify project, compose resource, domains, path routing, volume, env.
- Add external uptime checks for web and realtime.
- Write/verify the runbook in §17.
- Perform a production dry run: create, play, restart, redeploy, rollback.

Acceptance:

- Players join from phones over the public URL.
- TLS valid; WebSocket connects over `wss`.
- A realtime container restart does not destroy an active room.
- Logs show no tokens or message contents.
- Rollback to the previous image works.

Implementation note: `docs/deployment.md` is the Coolify Git + Docker Compose
runbook. The realtime server accepts both `/rt/*` and prefix-stripped paths
(`/health`, `/rooms`, `/ws`), so one Coolify hostname with `/rt` routing works
whether Coolify strips the prefix or not. `deploy/coolify.env.example` lists the
env/build values. The remote deploy, external uptime monitors, and production
dry run/rollback still require access to the actual Coolify instance.

### Phase 7 — Deferred / optional

Do not start without explicit approval:

- Rematch flow.
- Cloudflare Durable Object adapter.
- Redis pub/sub and multi-instance realtime.
- Spectator mode for non-players.
- Mafia group chat.
- Match history.
- Metrics/Prometheus.
- Custom tie revote UI.

---

## 17. Deployment runbook

The step-by-step Coolify + Git repository + Docker Compose guide lives in
[`docs/deployment.md`](./deployment.md). The summary below remains the source for
topology and operational expectations.

### 17.1 Prerequisites

- VPS: Ubuntu 24.04 LTS, 4 GB RAM recommended (2 GB minimum for Coolify plus builds),
  2 vCPU, 40 GB SSD.
- Docker and Coolify installed.
- Domain with DNS control. Example: `game.example.com`.
- Ports 22, 80, 443 open. Coolify dashboard on 8000 restricted to trusted IPs or SSH
  tunnel.

### 17.2 DNS

| Record | Value |
|---|---|
| `A game.example.com` | VPS IPv4 |
| `AAAA game.example.com` | VPS IPv6, if available |

Fallback if path routing is problematic:

| Record | Value |
|---|---|
| `A ws.game.example.com` | VPS IPv4 |

Then set `NEXT_PUBLIC_REALTIME_BASE=https://ws.game.example.com/rt` at web build time.
Prefer the single-host path setup.

### 17.3 Compose services

```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    expose: ["3000"]
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  realtime:
    build:
      context: .
      dockerfile: realtime/Dockerfile
    expose: ["3001"]
    environment:
      - PORT=3001
      - DATA_DIR=/data
      - ALLOWED_ORIGINS=https://game.example.com
      - LOG_LEVEL=info
    volumes:
      - room-data:/data
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3001/rt/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

volumes:
  room-data:
```

Notes:

- Do not publish `3001` to the host.
- Pin `realtime` to one replica. No scaling.
- Run both containers as non-root. Ensure the `room-data` volume is writable by the
  realtime container's UID (typically `node`, UID 1000).
- Coolify assigns domain + TLS through Traefik.
- The volume must persist across redeploys. Coolify named volumes survive container
  recreation; verify in the Coolify UI.

### 17.4 Routing

Preferred: one hostname.

- `https://game.example.com/*` → `web:3000`
- `https://game.example.com/rt/*` → `realtime:3001`

Traefik path-prefix rule, conceptually:

```
Host(`game.example.com`) && PathPrefix(`/rt`)  → realtime
Host(`game.example.com`)                        → web
```

If Coolify's UI cannot express two services on one hostname with paths, use a subdomain:

- `https://game.example.com` → `web`
- `https://ws.game.example.com/rt/*` → `realtime`

Then build the web image with `NEXT_PUBLIC_REALTIME_BASE=https://ws.game.example.com/rt`.
`ALLOWED_ORIGINS` on realtime must include `https://game.example.com`.

### 17.5 Environment

Realtime:

| Variable | Value |
|---|---|
| `PORT` | `3001` |
| `DATA_DIR` | `/data` |
| `ALLOWED_ORIGINS` | `https://game.example.com` |
| `LOG_LEVEL` | `info` |
| `ROOM_LOBBY_TTL_MS` | `7200000` |
| `ROOM_GAMEOVER_TTL_MS` | `900000` |
| `ROOM_EMPTY_TTL_MS` | `60000` |
| `SNAPSHOT_DEBOUNCE_MS` | `250` |

Web:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_GAME_MODE` | `live` (build arg) |
| `NEXT_PUBLIC_REALTIME_BASE` | unset for same-origin; set only for subdomain fallback (build arg) |

`NEXT_PUBLIC_*` values are inlined at build time. Pass them as Docker build args in the web
image, or hardcode `live` as the default after migration. They cannot be changed by
container environment variables at runtime. Same-origin `/rt` is the preferred production
configuration because it needs no build-time URL.

No secrets are required. Do not add any.

### 17.6 Local development

Daily dev, two terminals:

```bash
# terminal 1: web (the env var must be on the web process)
NEXT_PUBLIC_REALTIME_BASE=http://localhost:3001/rt pnpm dev

# terminal 2: realtime
pnpm dev:realtime
```

- Web: `http://localhost:3000`
- Realtime: `http://localhost:3001`
- The override includes `/rt` because the client appends `/ws` to the base. When unset,
  the base is same-origin `/rt`.
- Realtime `ALLOWED_ORIGINS` must include `http://localhost:3000`.
- For phone-over-LAN, set `NEXT_PUBLIC_REALTIME_BASE=http://<LAN-IP>:3001/rt` and add
  `http://<LAN-IP>:3000` to `ALLOWED_ORIGINS`.

Production-like local, one command:

```bash
docker compose -f compose.local.yaml up --build
```

- Caddy listens on `http://localhost:8080`.
- `Caddyfile.local`:

```
:80 {
  handle /rt/* { reverse_proxy realtime:3001 }
  handle       { reverse_proxy web:3000 }
}
```

- Browse `http://localhost:8080` or `http://<LAN-IP>:8080`.

### 17.7 First deploy

1. Push the repo with Dockerfiles and compose.
2. Create a Coolify project and a Docker Compose resource pointing at the repo/branch.
3. Add the domain and path routing.
4. Add the volume mount `room-data:/data`.
5. Set env.
6. Deploy.
7. Verify:
   - `curl -I https://game.example.com/`
   - `curl https://game.example.com/rt/health`
   - Browser console: WebSocket connected to `wss://.../rt/ws`.
   - Create a room from a phone and a laptop; both see updates.
8. Check logs for errors, tokens, and message contents.

### 17.8 Deploying during a game

- **Web deploy:** safe. Sockets are on realtime. Players may see a brief page reload
  request, but the game state is unaffected.
- **Realtime deploy:** all sockets drop. Clients reconnect with backoff and resend `hello`.
  Snapshots restore the room. Expect a few seconds of "reconnecting" UI.
- **Avoid** realtime deploys during the final minutes of a game if possible.
- On `SIGTERM`, flush snapshots before exit. Docker gives 10 seconds by default; keep
  snapshot writes fast.

### 17.9 Rollback

- Coolify redeploy of the previous commit/image.
- Snapshot `schemaVersion` is backward-compatible for additive changes. If a schema change
  is breaking, write a migration in `snapshot-store` before deploying.
- If rollback would lose rooms, accept it; games are ephemeral. Announce in the UI if
  needed.

### 17.10 Monitoring and maintenance

- External uptime check on `/` and `/rt/health` every minute.
- Alert on two consecutive failures.
- Review logs for `warn`/`error` after each party.
- Check disk usage monthly; snapshots are small but rooms can accumulate if cleanup fails.
- Delete stale snapshots if the cleanup job is not running.
- Keep the VPS patched; restart after kernel updates.
- Coolify itself: back up its config/database per Coolify docs.

### 17.11 Troubleshooting

| Symptom | Check |
|---|---|
| Web loads, sockets fail | Path routing for `/rt/*`; `ALLOWED_ORIGINS`; TLS/WSS; proxy upgrade headers |
| 502 on `/rt/health` | Realtime container running; port 3001 exposed internally; healthcheck |
| `ROOM_NOT_FOUND` after redeploy | Volume not mounted or `DATA_DIR` wrong |
| Players disconnect after 60s idle | Heartbeat interval vs proxy idle timeout; `ping`/`pong` |
| Older tab closed with 4001 | Newest-socket-wins policy; expected |
| Role leak reported | Projection tests; inspect actual sync frames in dev |
| Snapshot writes fail | Volume permissions; `DATA_DIR` writable by the container user |
| High memory | Room cleanup not running; leaked sockets; inspect `/rt/health` counts |

---

## 18. Handoff checklist

Before starting:

- [ ] Read this document end to end.
- [ ] Read `CLAUDE.md` (mobile-first, shadcn-first).
- [ ] Read `AGENTS.md`; for Next.js 16 APIs, consult `node_modules/next/dist/docs/` before
      writing code, per that file.
- [ ] Inspect the current `GameProvider`, screens, and routes listed in §4.
- [ ] Confirm the owner's screen work has not changed the contracts in §13.

During implementation:

- [ ] Do not change locked decisions without asking.
- [ ] Keep `game-core` free of Node, Next, browser, and Cloudflare APIs.
- [ ] Client imports only `game-core` public types/protocol helpers, never `engine.ts` or
      server state constructors. Keep server-only types in a separate file if bundling
      becomes a problem.
- [ ] Never import `realtime/` into client code.
- [ ] Every command is validated server-side; every view is projected per player.
- [ ] Every user-visible server message is an i18n key + params.
- [ ] Keep the app mobile-first and use shadcn primitives.
- [ ] Add tests with each phase; do not defer privacy tests.
- [ ] Update this document when a locked decision changes.

Before handoff:

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes.
- [ ] Integration tests pass.
- [ ] E2E happy path passes.
- [ ] `pnpm build` passes.
- [ ] Local Docker Compose stack works.
- [ ] A full 8-player game was played on phones.
- [ ] Server restart mid-game recovered.
- [ ] No tokens/message contents in logs.
- [ ] Runbook verified against the actual deployment.

---

## 19. Deferred decisions and assumptions

These are intentional defaults. Do not silently change them; ask the owner.

1. **Rematch** is deferred. `rematch` may return `NOT_IMPLEMENTED` until phase 7.
2. **Host transfer** is not implemented. Host rights stay with the token. The game still
   advances via timeouts if the host disappears.
3. **Multiple tabs:** newest socket wins; older closes with `4001`.
4. **Mafia chat** does not exist. Whispers are 1:1 for everyone, including mafia.
5. **Dead players** cannot whisper living players; they only use graveyard chat.
6. **Role reveal:** vote eliminations reveal the role by default; night deaths do not.
   Configurable only for vote reveal in v1.
7. **Godfather investigation immunity:** godfather always appears `not-mafia`.
8. **Doctor self-protection:** disallowed. Consecutive protection of the same target is
   allowed.
9. **Framer:** one frame per living framer per night; frames expire after the night.
10. **Mafia kill authority:** godfather while alive; otherwise the senior living mafia by
    `joinedAt`.
11. **Vote ties:** default no elimination. `random` is supported by the engine; `revote` is
    accepted in config but its UI is deferred.
12. **Read receipts** are local-only. Unread counts are computed from timestamps.
13. **Room TTL:** lobby 2 hours; game over 15 minutes. Adjust constants if parties run
    longer.
14. **Default role table** values in §7.4 are a starting balance, not mathematically
    proven. The owner may tune them in config.
15. **Custom rules bounds** in §7.3 are the v1 safety limits.
16. **Domain, TLS, and Coolify specifics** are deployment-time choices; use
    `game.example.com` as the placeholder.
17. **Monitoring** is health checks + logs in v1. No metrics stack.
18. **Cloudflare** is out of scope. The pure `game-core` and the protocol adapter boundary
    keep the door open; do not add Cloudflare code now.
19. **WebSocket library** is `ws`. Do not switch to `uWebSockets.js` without a measured
    reason.
20. **No database.** If the owner later wants persistence/history, that is a new project
    phase, not a silent addition.

---

## 20. Definition of done (v1)

A group of 3–16 people can:

1. Open one URL on their phones.
2. Create or join a room with a code.
3. Choose Default or Custom roles/rules (host).
4. Start the game and privately see their role.
5. Play a complete game through night actions, reports, discussion, whispers, voting, and
   eliminations.
6. See dead players move to spectator/graveyard without leaking living roles.
7. Reach a correct winner.
8. Refresh or lose connection and reclaim their seat.
9. Survive a realtime redeploy without losing the room.

And the system:

1. Never sends hidden data to the wrong player.
2. Validates every command server-side.
3. Restores rooms from snapshots after restart.
4. Runs as two containers on the VPS behind TLS.
5. Passes unit, integration, and E2E tests.
6. Has no database and no required external service.
7. Keeps the Cloudflare path open through a pure core and a thin adapter boundary.

---

## Appendix A — Cloudflare portability (deferred)

If the owner later moves to Cloudflare:

- `game-core` is already portable.
- Implement a `RoomDO extends DurableObject` adapter that owns one room, uses
  `acceptWebSocket`, DO storage for snapshots, and DO alarms instead of `setTimeout`.
- Keep the same wire protocol and the same `PlayerView` projections.
- The Next app can run via OpenNext; the realtime entry can be a Worker route `/rt/ws`
  forwarded to the DO.
- Do not add Cloudflare APIs to `game-core` or to client code now.
- Self-hosting workerd on a VPS is possible but is not the baseline; a Node adapter is
  simpler to operate for this scale.

---

## Appendix B — Quick protocol example

```ts
// Client connects
const ws = new WebSocket(realtimeWsUrl());
ws.onopen = () => ws.send(JSON.stringify({ type: "hello", code, token }));

// Server → client
{
  "type": "sync",
  "version": 12,
  "serverNow": 1763300000000,
  "view": {
    "code": "KQX2M",
    "phase": "night",
    "round": 2,
    "phaseEndsAt": 1763300090000,
    "you": { "id": "p_1", "name": "Alessia", "alive": true, "isYou": true, "roleId": "godfather", "faction": "mafia" },
    "players": [
      { "id": "p_1", "name": "Alessia", "alive": true, "isYou": true, "roleId": "godfather", "faction": "mafia" },
      { "id": "p_2", "name": "Marco", "alive": true, "isYou": false, "roleId": null, "faction": null }
    ],
    "yourAction": null,
    "yourVote": null,
    "whispers": [],
    "graveyard": [],
    "alerts": []
  }
}

// Client → server
{ "type": "command", "id": "c_abc", "command": { "type": "submitNightAction", "kind": "kill", "targetId": "p_2" } }

// Server → sender
{ "type": "sync", "version": 13, "serverNow": 1763300010000, "ackId": "c_abc", "view": { /* updated */ } }
```
