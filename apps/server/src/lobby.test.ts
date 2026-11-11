import { afterEach, beforeEach, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createApp } from './server.js';
import type { Snapshot } from '@buzz/shared';
let app: ReturnType<typeof createApp>, url: string, clients: Socket[];
beforeEach(async () => {
  app = createApp(); clients = [];
  await new Promise<void>(r => app.http.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
});
afterEach(async () => { clients.forEach(s => s.disconnect()); await new Promise<void>(r => app.io.close(() => r())); });
async function client() {
  const s = io(url, { forceNew: true, reconnection: false }); clients.push(s);
  await new Promise<void>((r, reject) => { s.once('connect', r); s.once('connect_error', reject); }); return s;
}
async function cmd(s: Socket, event: string, payload: unknown = {}) { return s.timeout(2000).emitWithAck(event, payload); }
function state(s: Socket, predicate: (s: Snapshot) => boolean): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { s.off('room:state', listener); reject(Error('Snapshot timeout')); }, 2000);
    const listener = (value: Snapshot) => { if (predicate(value)) { clearTimeout(timer); s.off('room:state', listener); resolve(value); } };
    s.on('room:state', listener);
  });
}
it('creates distinct valid rooms in the initial state and isolates three contestants', async () => {
  const host = await client(), otherHost = await client();
  const a = (await cmd(host, 'host:create-room')).data, b = (await cmd(otherHost, 'host:create-room')).data;
  expect(a.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/); expect(a.roomCode).not.toBe(b.roomCode);
  expect(a.hostToken).not.toBe(b.hostToken);
  expect(a.snapshot).toMatchObject({ status: 'WAITING', roundNumber: 0, winnerPlayerId: null, players: [] });
  for (const [i, name] of ['Alex', 'Sam', 'Jordan'].entries()) {
    const update = state(host, s => s.players.length === i + 1);
    const joined = await cmd(await client(), 'player:join', { roomCode: a.roomCode, displayName: name });
    expect(joined.ok).toBe(true); expect(joined.data.snapshot.role).toBe('player');
    expect(joined.data.snapshot).not.toHaveProperty('hostOnline');
    const snapshot = await update; expect(snapshot.role).toBe('host');
    expect(JSON.stringify(snapshot)).not.toMatch(/token|socket/i);
    expect(JSON.stringify(joined.data.snapshot)).not.toMatch(/token|socket/i);
  }
  expect(app.rooms.recipients(b.roomCode)[0].snapshot.players).toEqual([]);
});
it.each([undefined, null, '', '   ', 'x'.repeat(25), 42])('rejects invalid name %s', async displayName => {
  const a = (await cmd(await client(), 'host:create-room')).data;
  expect(await cmd(await client(), 'player:join', { roomCode: a.roomCode, displayName })).toMatchObject({ ok: false, error: { code: 'INVALID_NAME' } });
});
it('rejects duplicates and malformed payloads without granting membership', async () => {
  const a = (await cmd(await client(), 'host:create-room')).data;
  await cmd(await client(), 'player:join', { roomCode: a.roomCode, displayName: ' Alex ' });
  const guest = await client();
  expect(await cmd(guest, 'player:join', { roomCode: a.roomCode, displayName: 'aLEX' })).toMatchObject({ ok: false, error: { code: 'NAME_TAKEN' } });
  for (const p of [null, [], 'bad']) expect(await cmd(guest, 'player:join', p)).toMatchObject({ ok: false, error: { code: 'INVALID_PAYLOAD' } });
  expect(app.rooms.recipients(a.roomCode).some(r => r.socket === guest.id)).toBe(false);
  expect(await cmd(guest, 'player:join', { roomCode: a.roomCode, displayName: 'Sam' })).toMatchObject({ ok: true });
});
it.each(['bad', 'AAAAAA', 123, null])('rejects invalid or absent room %s', async roomCode => {
  expect(await cmd(await client(), 'player:join', { roomCode, displayName: 'Alex' })).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_FOUND' } });
});
it('rejects missing, wrong and cross-room credentials and never registers unauthorized guests', async () => {
  const a = (await cmd(await client(), 'host:create-room')).data;
  const b = (await cmd(await client(), 'host:create-room')).data;
  const p = (await cmd(await client(), 'player:join', { roomCode: a.roomCode, displayName: 'Alex' })).data;
  for (const [event, field, value] of [['host:resume', 'hostToken', undefined], ['host:resume', 'hostToken', b.hostToken], ['player:resume', 'playerToken', undefined], ['player:resume', 'playerToken', a.hostToken], ['player:resume', 'playerToken', 'x'.repeat(64)]] as const) {
    const guest = await client();
    expect(await cmd(guest, event, { roomCode: a.roomCode, [field]: value })).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(app.rooms.recipients(a.roomCode).some(r => r.socket === guest.id)).toBe(false);
  }
  expect(await cmd(await client(), 'player:resume', { roomCode: b.roomCode, playerToken: p.playerToken })).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
});
it('marks active disconnect offline then resumes the same stable player without duplication', async () => {
  const host = await client(), old = await client(); const a = (await cmd(host, 'host:create-room')).data;
  const p = (await cmd(old, 'player:join', { roomCode: a.roomCode, displayName: 'Alex' })).data;
  const offline = state(host, s => s.players[0]?.online === false); old.disconnect();
  expect((await offline).players[0].id).toBe(p.playerId);
  const online = state(host, s => s.players[0]?.online === true);
  const result = await cmd(await client(), 'player:resume', { roomCode: a.roomCode, playerToken: p.playerToken });
  expect(result.data.players).toEqual([{ id: p.playerId, name: 'Alex', online: true }]); await online;
});
it('replaces an old player socket and ignores its later disconnect', async () => {
  const host = await client(), old = await client(); const a = (await cmd(host, 'host:create-room')).data;
  const oldId = old.id!; const p = (await cmd(old, 'player:join', { roomCode: a.roomCode, displayName: 'Alex' })).data;
  const replaced = new Promise<void>(r => old.once('session:replaced', r));
  const fresh = await client(); await cmd(fresh, 'player:resume', { roomCode: a.roomCode, playerToken: p.playerToken }); await replaced;
  app.rooms.disconnect(oldId);
  expect(app.rooms.recipients(a.roomCode).some(r => r.socket === oldId)).toBe(false);
  expect(app.rooms.recipients(a.roomCode).find(r => r.socket === fresh.id)?.snapshot.players).toEqual([{ id: p.playerId, name: 'Alex', online: true }]);
});
it('preserves a disconnected host room and transfers host ownership on resume', async () => {
  const host = await client(); const a = (await cmd(host, 'host:create-room')).data; host.disconnect();
  const next = await client();
  expect(await cmd(next, 'host:resume', { roomCode: a.roomCode, hostToken: a.hostToken })).toMatchObject({ ok: true, data: { role: 'host', code: a.roomCode } });
  const replaced = new Promise<void>(r => next.once('session:replaced', r));
  const fresh = await client(); await cmd(fresh, 'host:resume', { roomCode: a.roomCode, hostToken: a.hostToken }); await replaced;
  expect(app.rooms.recipients(a.roomCode).map(r => r.socket)).toEqual([fresh.id]);
});
