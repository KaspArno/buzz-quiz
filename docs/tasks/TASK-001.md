# TASK-001 — Scaffold Buzz Quiz and implement the multiplayer lobby

**Milestone:** 1 of 4  
**Depends on:** `docs/PRD.md`  
**Status:** Ready for Codex  
**Goal:** Demonstrate that one host can create a room and at least three contestants can join from separate devices, appearing in a live lobby.

## Codex instructions

Read `docs/PRD.md` first. Implement this task end-to-end in the current repository. If the repository is empty, initialize it. Do **not** implement buzz handling, arm/reset functionality, scores, questions, or the QR code yet. Keep the code structured so those features can be added in later tasks.

Do not ask about routine technical decisions; choose simple, widely used defaults and document them. Avoid adding any database, authentication provider, or third-party backend service.

## Technology and repository setup

Use:

- TypeScript in strict mode throughout.
- React + Vite in `apps/web`.
- Node.js + Socket.IO in `apps/server`.
- TypeScript contracts in `packages/shared`.
- npm workspaces in the repository root.
- Vitest for unit/integration tests.
- Basic CSS or Tailwind CSS; prioritize clear responsive UI and a small dependency footprint.

Expected directory layout:

```text
apps/web/
apps/server/
packages/shared/
docs/PRD.md
docs/tasks/TASK-001.md
README.md
package.json
```

Provide working root scripts for local development, typecheck, tests, and production build (choose ergonomic names such as `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`). The README must explain prerequisites, environment variables, and how to access the site from another phone on the same Wi-Fi network (a phone cannot reach the developer laptop via its own `localhost`).

## In scope

### 1. Server room service

- Keep rooms in memory in a well-encapsulated room service.
- Create random unique six-character codes using an alphabet that omits visually confusing characters.
- Create a cryptographically random host token, stored server-side and returned only to the creator.
- Initial room state is `WAITING`, round number `0`, winner `null`.
- Keep stable player IDs and random player tokens, bound to a specific room.
- Enforce player display names of 1–24 trimmed characters; reject duplicates case-insensitively within a room.
- Track player `online`/`offline` presence using the authenticated current socket, not arbitrary client data.
- Use a separate public/host snapshot DTO. Do not expose tokens, socket IDs, or internal metadata through room snapshots.

### 2. Socket.IO commands and responses

Implement the following with typed shared event payloads and acknowledgment results:

- `host:create-room` → `{ roomCode, hostToken, snapshot }`
- `host:resume` with `{ roomCode, hostToken }` → authoritative snapshot
- `player:join` with `{ roomCode, displayName }` → `{ playerId, playerToken, snapshot }`
- `player:resume` with `{ roomCode, playerToken }` → authoritative snapshot
- `room:state` server broadcast when roster/presence changes; recipient receives only appropriate permitted snapshot.

Use standardized acknowledgments:

```ts
type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

Register role and room membership only after successful credential validation. On reconnect/resume, treat the newest authenticated socket for that identity as active; a stale socket must not be able to affect its membership or presence. Do not rely on socket ID as the persistent player ID.

There is no buzz event in this task.

### 3. Frontend pages

- `/`: simple Buzz Quiz landing page with **Create room** and **Join room** code input.
- `/host/:roomCode`: host lobby showing room code, copyable contestant join URL, room status `Waiting`, live roster and connection indicators. Stub or omit the round controls entirely for this task.
- `/join/:roomCode`: contestant name form, then a waiting-room view showing the player's name, room code, and "Waiting for host". The future buzzer can be a visibly disabled placeholder, but must **not** appear functional.
- Error screens for invalid/closed/nonexistent rooms and unusable host credentials.
- Clear loading/connection states on both screens.
- Responsive layout usable on common phone widths.

Store the host token and player token in `sessionStorage`, keyed by room code. On refresh, attempt `host:resume` / `player:resume` rather than creating a new identity. Do not put either token in the URL.

### 4. Disconnect behavior

- On current player socket disconnection, mark that player offline and notify the host.
- If the same player resumes, mark the existing player online instead of adding a duplicate.
- On host socket disconnection, preserve the room in memory so the host can resume in the same browser session.
- Reject attempts to resume with missing/invalid credentials.
- Socket.IO can auto-reconnect at transport level, but always perform authenticated resume and apply a fresh authoritative snapshot after reconnect.

### 5. Security and validation basics

- Validate payloads at the server boundary; handle invalid types, lengths, and codes without throwing uncaught exceptions.
- Only authenticated host sockets receive host-specific state.
- Ignore stale socket disconnect events if a newer socket already owns that player or host identity.
- Configure CORS for a development frontend origin; document production same-origin deployment strategy and never assume `*` is appropriate for a public deployment.
- No tokens in public room updates or server logs.

## Out of scope for TASK-001

No arming, buzzing, winner detection, lock state transitions, reset, QR code, scoring, questions, sounds, analytics, account system, database, payments, public deployment, or expiry cleanup. Model fields can be prepared for future tasks but leave these features unimplemented.

## Required tests

Add automated server tests, including socket-level tests where useful:

1. Creating two rooms returns distinct valid codes and separate rooms.
2. New rooms start in `WAITING` with no winner and round number `0`.
3. Joining a room adds a player to its roster and notifies the host.
4. Joining one room does not change another room's roster.
5. Missing, blank, oversized, and duplicate names are rejected appropriately.
6. Invalid/nonexistent room code returns `ROOM_NOT_FOUND` (or documented equivalent).
7. Refresh/resume with a valid player token preserves the same player ID and does not duplicate entries.
8. Invalid player or host token fails with `UNAUTHORIZED` (or documented equivalent).
9. Disconnecting the active player socket marks that player offline; resuming restores online presence.
10. Disconnecting an older socket after a newer resume does not incorrectly mark the player offline.
11. Unauthorized guests cannot access privileged host state.
12. Public room snapshots never contain tokens or server-only socket IDs.

Use a server bound to an ephemeral port in integration tests, and clean up sockets/server after each test to prevent hanging test processes. Prefer deterministic assertions over arbitrary sleeps.

## Acceptance criteria

- [ ] `npm install` succeeds from the repo root.
- [ ] Root dev script runs web and Socket.IO server together.
- [ ] `npm run typecheck`, `npm test`, and `npm run build` succeed.
- [ ] Host can create a room, see its code, and copy a link.
- [ ] Three browsers/devices can join with distinct names and immediately appear in host lobby.
- [ ] Invalid name, duplicate name, and invalid code show useful errors.
- [ ] Host can see online/offline state change on disconnect/reconnect.
- [ ] Player can refresh and retain identity; host can refresh and retain host access.
- [ ] Non-host clients cannot obtain host credentials or host-only state.
- [ ] Project runs locally and README explains LAN phone testing.
- [ ] No buzzer or game-round features have been built prematurely.

## Manual verification walkthrough

1. Start the app using the documented root development command.
2. Open the homepage on a laptop and create a room.
3. Copy the invite URL, open it in three independent browser sessions or phones, and join as `Alex`, `Sam`, and `Jordan`.
4. Verify the host's roster shows all three as online and the room status is `WAITING`.
5. Refresh one contestant browser. It should reconnect as the same player, not create a fourth entry.
6. Temporarily disconnect one player; confirm an offline indicator appears. Reconnect and confirm online returns.
7. Refresh the host's page and verify the same room and roster are restored.
8. Enter an invalid room code or duplicate name; verify a helpful error appears without crashing the app.
9. Confirm the placeholder buzzer is disabled and no rounds can yet be armed.

## Definition of done / final Codex report

Before saying this task is complete:

1. Run all available checks and report actual results; do not claim passes if commands were not run.
2. Summarize architecture, relevant files, and changes made.
3. Explain local and phone-on-LAN startup steps.
4. Document any deviations from this task and why.
5. List known limitations and propose the next task: **TASK-002 — Server-authoritative first-buzz-wins state machine**.

---

### Ready-to-paste Codex prompt

> Read `docs/PRD.md` and `docs/tasks/TASK-001.md`, then implement TASK-001 in this repository. Follow the task's scope and acceptance criteria exactly. Scaffold the repository if needed. Keep the multiplayer room service separate from transport handlers and the React UI. Add real automated tests for the failure and reconnect scenarios. Do not implement buzzing or round controls yet. Run and report typecheck, tests, and build, and tell me how to validate the lobby with three phones or browser sessions.
