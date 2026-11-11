# Buzz Quiz — multiplayer lobby

TASK-001 implements room creation, invitations, live presence and authenticated refresh/reconnect. No buzz or round controls are implemented.

Requires Node.js 22.12+ (Node 24 recommended) and npm 10+.

```sh
npm install
npm run dev
```

Open http://localhost:5173. Vite serves React and proxies `/socket.io` to Node on port 3001. The root dev command runs both processes together.

```sh
npm run typecheck
npm test
npm run build
npm start
```

Build outputs are `apps/web/dist` and `apps/server/dist/index.js`. `npm start` runs the backend only. For production, serve the static frontend with SPA fallback to `index.html`, and reverse proxy `/socket.io` (including WebSocket upgrades) and optionally `/health` to the single Node server on the same origin. Do not run multiple independent backend replicas. Public deployment is outside this task.

Server environment variables:

- `PORT`: defaults to `3001`. The development Vite proxy targets 3001; update `apps/web/vite.config.ts` too if changing the development port.
- `WEB_ORIGIN`: defaults to `http://localhost:5173`; accepts comma-separated explicit frontend origins. Set the exact HTTPS origin in production, never a wildcard.

## Validate with three phones or browser sessions

1. Find the laptop's Wi-Fi IPv4 address (`ipconfig` on Windows), e.g. `192.168.1.42`. On PowerShell set `$env:WEB_ORIGIN='http://192.168.1.42:5173'`, then run `npm run dev`. Permit Node/Vite through the Windows firewall on the private network if prompted.
2. Put all phones on the same Wi-Fi. Open `http://192.168.1.42:5173` on the host laptop too, then create a room. Its invitation now contains the LAN address. A phone cannot reach the laptop using its own `localhost`. Guest Wi-Fi isolation may prevent access.
3. Open the invitation on three phones or independent browser profiles/private sessions. Join as Alex, Sam and Jordan. Verify all three appear online in the host lobby. On LAN HTTP, clipboard access may be unavailable; select and copy the invitation input manually.
4. Refresh Alex's tab: the same contestant should return without a fourth entry. Disconnect a phone from Wi-Fi or use DevTools Network → Offline; the host should show Offline after heartbeat detection (potentially about 45 seconds). Restore connectivity and verify Online returns.
5. Refresh the host and verify the same room and roster return. Try duplicate/blank/oversized names and an invalid room code; errors should be explicit. Open the host route in another browser and verify missing credentials are rejected. No functional buzzer or round controls should exist.

## Architecture and limits

- `packages/shared/src/index.ts`: typed event contracts, acknowledgments and distinct host/public DTOs.
- `apps/server/src/rooms.ts`: transport-independent in-memory room service, validation, stable player IDs, cryptographic credentials and active connection ownership.
- `apps/server/src/server.ts`: Socket.IO boundary validation, authenticated recipient updates, connection replacement and disconnect handling. `/health` returns JSON.
- `apps/web/src/main.tsx`: home, host and join routes; room-scoped `sessionStorage` credentials; authenticated resume and fresh snapshots on reconnect.
- `apps/server/src/lobby.test.ts`: real Socket.IO tests on ephemeral ports, negative validation and authorization cases, isolation, privacy, disconnect and replacement behavior. Tests close sockets and servers.

Tokens are absent from invitations and snapshots. One socket has one authenticated identity; a newer authenticated connection replaces the old one. Invalid commands never register membership. Errors use `{ok:false,error:{code,message}}`; invalid codes and absent rooms return `ROOM_NOT_FOUND`.

Rooms are WAITING-only in this milestone. Closed-room behavior requires the deferred end-game implementation; there is no close command. Rooms and offline players remain in memory until restart; expiry and rate limiting are deferred as specified. Server restarts lose rooms and return a helpful room-unavailable error. Closing a tab can discard session credentials. Physical device verification must be performed on your LAN.

Next: **TASK-002 — Server-authoritative first-buzz-wins state machine**.
