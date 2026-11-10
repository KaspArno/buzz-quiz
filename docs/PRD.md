# Buzz Quiz — MVP Product Requirements Document

**Version:** 1.0  
**Status:** Approved for implementation  
**Date:** 2026-11-10  
**Primary audience:** Developer and Codex coding agent  
**Product type:** Mobile-first, real-time browser application

## 1. Product summary

Buzz Quiz is a browser-based buzzer system for informal quizzes with friends and family. A host creates a room and reads questions aloud. Contestants open a link (or scan a QR code), enter a display name, and use a large button on their phone to buzz in. The **first valid buzz processed by the server wins**; the server immediately locks the round and announces the winner. The host resets the buzzers to play the next question.

The MVP is **not** a question-management or scoring app. It is a focused multiplayer buzzer.

### Product goal

A host should be able to run a full quiz with 5–10 friends, each using their own phone, without installing an app or creating an account.

### Success criteria

- A host can create a room and share a working join URL and room code.
- At least 5–10 contestants can join on modern mobile browsers and appear in the lobby.
- The host can arm the buzzers, and exactly one player wins each round.
- All connected clients see a consistent result, and no further buzzes can change it.
- The host can reset and play 20 successive rounds without restarting.
- The app handles page refresh and brief disconnects without accidentally creating extra players.
- A hosted version works across different phones and network connections.

## 2. Decisions already made

| Area | Decision |
| --- | --- |
| Platform | Responsive web app; browser-first, no downloads |
| Users | Casual friends and family |
| Questions | Read aloud by the host; no question content in MVP |
| Buzzer | Only first valid buzz wins; all others are rejected after lock |
| Accounts | None for host or players in MVP |
| Scores | Out of scope |
| Teams | Out of scope |
| Authority | Server is the source of truth for rooms, round state, and winner |
| Persistence | In-memory game state on one Node.js process for MVP |

## 3. Users and primary journeys

### Host

1. Open the Buzz Quiz homepage and select **Create room**.
2. See a six-character room code, join URL, and (by Milestone 3) QR code.
3. See players appear and their connection status.
4. Read a question aloud, then select **Arm buzzers** when buzzing should be allowed. The host may choose when in the spoken question to arm.
5. See the winning contestant clearly after the first valid buzz.
6. Select **Reset** to clear the winner and return to waiting; arm again for the next question.
7. Select **End game** to close the room.

### Contestant

1. Open an invitation link or enter a room code on the homepage.
2. Enter a display name (no account required).
3. See the current room and a large, touch-friendly button that is disabled while the host has not armed the round.
4. When armed, tap **BUZZ** once.
5. See either **You buzzed first!** or **[Name] buzzed first**; further attempts do nothing until the next round.
6. Stay connected for subsequent rounds. If temporarily disconnected, see a reconnecting state; on recovery, receive the current authoritative round state.

## 4. MVP functional requirements

### FR-01 Room creation

- Host can create a unique, human-readable, six-character code using an alphabet excluding easily confused characters (for example, omit `0`, `O`, `1`, and `I`).
- Each room has a cryptographically random, unguessable **host token**, which is never included in the public invite URL or room state sent to players.
- A host can share a URL such as `/join/ABC234`; contestants can also manually enter the code.
- The room starts in `WAITING`.

### FR-02 Joining and lobby

- Player enters a name containing 1–24 characters after trimming surrounding whitespace. Empty names are rejected.
- Duplicate display names within the same room are rejected case-insensitively (except when the same participant resumes).
- The server gives each joined player an unguessable **player token**, associated with that room and player.
- The host sees each player's name and online/offline status update in real time.
- A player sees the room code and relevant room status.
- Invalid room codes and closed rooms produce explicit, friendly errors.

### FR-03 Round controls

- Room states: `WAITING`, `ARMED`, `LOCKED`, `CLOSED`.
- Only a host with the correct host token can arm, reset, or end a room.
- **Arm** is permitted in `WAITING` and transitions to `ARMED`, assigning a new monotonically increasing round number.
- **Reset** is permitted from `ARMED` or `LOCKED` and transitions to `WAITING`, clearing the winner. Resetting an armed round cancels it without a winner.
- **End** transitions any active state to `CLOSED` and invalidates subsequent controls and buzzes.
- Host UI must make current state and winner visually obvious.

### FR-04 First-buzz-wins

- Client sends a `buzz` event with the room code, player credentials, and current round number.
- Server validates room, player identity, room state, and current round number.
- The **first valid buzz handler that reaches the authoritative server** synchronously changes state from `ARMED` to `LOCKED` and stores that player as winner. There must be no asynchronous gap between state check and lock.
- Server broadcasts the authoritative updated state to all room participants.
- Subsequent, duplicate, unauthenticated, or stale buzzes cannot change the winner.
- The server never relies on client-supplied timestamps to determine the winner.
- A round has either zero winners (`WAITING`/`ARMED`) or exactly one winner (`LOCKED`).

**Fairness note:** Network latency means server arrival order can differ from real-world finger-tap order. MVP promises deterministic **server-first** ordering, not millisecond-perfect physical fairness.

### FR-05 Reconnection and refresh

- Host token and player token are kept in browser `sessionStorage`, scoped per room. They are not exposed in public URLs or broadcasts.
- Following a refresh or network interruption, a client attempts to resume with its saved token and fetches the latest **full server snapshot**.
- A resumed player keeps the same stable player ID and name rather than appearing twice.
- If the same participant resumes from a second socket, the newest authenticated connection becomes the active session; stale sockets cannot control or buzz for that participant.
- Disconnected players are visibly marked offline but remain listed for possible resume while the room exists.
- If the host disconnects, existing room state remains in memory; players cannot take control. Host can resume within the room's lifetime.
- If a server restart loses an in-memory room, users see a helpful **room unavailable** message rather than silently inventing a replacement room.
- Reconnection does **not** replay old buzz attempts. The player must tap again in an active round.

### FR-06 End game and cleanup

- Ending a room changes state to `CLOSED`; guests see a game-ended message.
- Late join and buzz attempts to closed rooms are rejected.
- Inactive rooms should be cleaned up to prevent indefinite growth; for MVP use a configurable 30-minute timeout after host disconnects, unless the room is explicitly ended earlier. Exact cleanup implementation belongs to Milestone 4.

## 5. User interface requirements

### Routes

- `/` — home: create room / enter room code.
- `/host/:roomCode` — host dashboard; requires the local host token and server validation.
- `/join/:roomCode` — name entry and, once joined, contestant buzzer view.

### Host dashboard

- Large room code and shareable link, QR code by Milestone 3.
- Live roster with clear online/offline indicators.
- Main call-to-action changes with state: **Arm buzzers**, **Reset buzzers**, or a visibly locked winner display.
- **End game** with confirmation.
- Usable on laptop, tablet, or phone.

### Contestant view

- Designed mobile-first and responsive, with an oversized central buzz target (minimum 80 × 80 CSS px; preferably much larger).
- `WAITING`: visibly disabled buzzer and "Waiting for host".
- `ARMED`: unmistakable active **BUZZ** button, high contrast.
- `LOCKED`: winner announced, buzzer disabled.
- `CLOSED`: game ended and controls disabled.
- Distinct offline/reconnecting indicator; prevent taps while connection or membership is unconfirmed.
- Accessible semantic buttons, legible labels, visible focus states, and text alongside color feedback.

## 6. Technical architecture

| Layer | MVP choice |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| CSS | Tailwind CSS (optional if setup overhead outweighs benefit) |
| Backend | Node.js, TypeScript |
| Real-time | Socket.IO (client and server) |
| Shared contracts | Shared TypeScript types and event payloads |
| State | Server-side in-memory Maps, one server process |
| Tests | Vitest, including socket-level integration tests |
| Deployment target | Any hosting that supports a persistent Node.js server and WebSockets (Railway is a suitable default) |
| Database | None in MVP |

Suggested repository structure:

```text
buzz-quiz/
  apps/
    web/                # React client
    server/             # Socket.IO server and room service
  packages/
    shared/             # room states, DTOs, typed event contracts
  docs/
    PRD.md
    tasks/
      TASK-001.md
  package.json          # npm workspaces
  README.md
```

Use a **single server instance** for the MVP. Do not add Redis, a database, queues, OAuth, analytics, or microservices until there is a real product need. Ensure the deployment does not accidentally run multiple independent game servers against the same room namespace.

### Suggested server model

```ts
type RoomStatus = 'WAITING' | 'ARMED' | 'LOCKED' | 'CLOSED';

type Player = {
  id: string;
  name: string;
  online: boolean;
  // server-only: playerToken, activeSocketId
};

type Room = {
  code: string;
  status: RoomStatus;
  roundNumber: number;
  winnerPlayerId: string | null;
  players: Map<string, Player>;
  // server-only: hostToken, activeHostSocketId, disconnect/cleanup metadata
};
```

Do not send server-only tokens or active socket IDs in public room snapshots. Prefer per-role snapshots so players cannot inspect privileged data.

### Suggested real-time event contract

All commands use Socket.IO acknowledgments with a consistent `ok: true` / `ok: false, error: {code, message}` shape. Commands that involve a room require authentication. For the initial lobby, define these events first; later milestones extend the same contract.

| Event (client → server) | Payload | Result |
| --- | --- | --- |
| `host:create-room` | none | room code, host token, host snapshot |
| `host:resume` | room code, host token | authoritative host snapshot |
| `player:join` | room code, display name | stable player ID, player token, player snapshot |
| `player:resume` | room code, player token | player snapshot |
| `host:arm` | room code, host token | new round number, snapshot |
| `player:buzz` | room code, player token, round number | acceptance or rejection reason |
| `host:reset` | room code, host token | waiting snapshot |
| `host:end` | room code, host token | closed snapshot |
| `room:state` (server → client) | role-appropriate room snapshot | unsolicited updates after every state change |

Example shared error codes: `ROOM_NOT_FOUND`, `ROOM_CLOSED`, `INVALID_NAME`, `NAME_TAKEN`, `UNAUTHORIZED`, `INVALID_STATE`, `STALE_ROUND`, `ALREADY_LOCKED`.

Clients should treat server snapshots as authoritative, including after reconnect. Socket.IO ordering alone is not a substitute for resynchronizing full state.

## 7. Non-functional requirements

- **Correctness:** Exactly one winner per round; never replace a winner after lock.
- **Reliability:** Repeated taps, retries, duplicate commands, stale round numbers, and disconnects do not corrupt state.
- **Performance:** UI responds immediately to touch, while winner confirmation remains server-authoritative. Test with at least 10 simultaneous connections and bursts of buzzes; do not promise a latency SLA before measurement.
- **Security:** Cryptographically random credentials; server-side authorization on every privileged event; validate all inputs; room snapshots contain no private tokens. Add basic join/buzz rate limiting before public deployment.
- **Privacy:** Names are temporary and do not need a database. Avoid exposing access tokens in URLs, logs, or analytics.
- **Accessibility:** Large controls, semantic labels, good contrast, visible focus and connection/status text.
- **Compatibility:** Modern iOS Safari, Android Chrome, and desktop browsers.
- **Operations:** Clear local setup instructions; environment-based port/origin configuration; health endpoint; single server process in production.

## 8. Scope exclusions

Explicitly **not** part of this MVP:

- Question authoring, question sets, or answer validation
- Scores, leaderboards, or team play
- Queued second/third buzzer order
- Timers, penalties, sounds, haptics, or animations beyond basic feedback
- Accounts, sign-in, payments, or subscriptions
- Moderation/admin tools outside room host powers
- Database, game history, or cross-restart room persistence
- Native iOS/Android packaging
- Perfect physical-tap timing fairness or LAN-only competition mode

## 9. Delivery milestones

### Milestone 1 — Multiplayer lobby
Create a room, display code/share URL, let contestants join from multiple devices, show live roster and presence, support page-refresh resume. See `TASK-001.md` for the exact implementation boundary.

### Milestone 2 — Buzzer engine
Implement `WAITING → ARMED → LOCKED`, first-valid-event wins, rejected stale buzzes, immutable winner, reset, and concurrency-focused tests.

### Milestone 3 — Playable quiz
Add clear host round controls, contestant result screens, room QR code, and an explicit end-game experience. Test 20 consecutive rounds.

### Milestone 4 — Resilience and public deployment
Connection recovery UX, room expiry, rate limits, responsive polish, multi-device network testing, HTTPS hosting, monitoring and deployment instructions.

## 10. Overall acceptance test (definition of done for MVP)

1. On a laptop, host creates a room and displays its invite code/QR.
2. Five people open the room on separate phones without installing anything.
3. Host arms the buzzer. Phones show the active buzz button.
4. Multiple players tap rapidly; exactly one winner is displayed everywhere.
5. Later taps do not alter that result.
6. Host resets, arms again, and repeats this 20 times with no unintended winner carryover.
7. A player reloads and returns as the same player, without creating a duplicate.
8. Host reloads and regains host control with the same browser session.
9. Unauthorized clients cannot arm, reset, close, or spoof a different player.
10. Host ends the room; all clients see that the game has ended and cannot buzz again.

## 11. Implementation guidance for Codex

- Read this entire PRD before implementing a task.
- Implement only the explicitly requested milestone; avoid unrelated "nice to have" features.
- Put core room and round transitions in testable functions independent of UI and network callbacks.
- Keep authoritative state on the server. Never determine winners from client-side state or timestamps.
- Validate all event inputs and check credentials on the server.
- Use strict TypeScript; minimize dependencies; explain any architectural deviation.
- Write automated tests for server state changes and negative cases.
- At the end of each task, report files changed, scripts run, test results, and manual verification steps.

## 12. Deferred product decisions

These are deliberately **not blockers** for the MVP: custom buzzer sounds, colorful visual themes, name/avatar customization, second-place queueing, scoring, integrated questions, teams, and cross-room admin features. Revisit only after the end-to-end buzzer works reliably.
