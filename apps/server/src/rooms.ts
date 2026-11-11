import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { HostSnapshot, PublicSnapshot, Snapshot, Player } from '@buzz/shared';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const token = () => randomBytes(32).toString('hex');
interface InternalPlayer extends Player { token: string; socket: string | null }
interface Room { code: string; hostToken: string; hostSocket: string | null; players: Map<string, InternalPlayer> }
export class RoomError extends Error { constructor(public code: string, message: string) { super(message); } }
export class RoomService {
  private rooms = new Map<string, Room>();
  private room(code: unknown) {
    if (typeof code !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(code) || !this.rooms.has(code)) throw new RoomError('ROOM_NOT_FOUND', 'Room unavailable. Check the code; the server may have restarted.');
    return this.rooms.get(code)!;
  }
  create(socket: string) {
    let code: string;
    do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (this.rooms.has(code));
    const room: Room = { code, hostToken: token(), hostSocket: socket, players: new Map() };
    this.rooms.set(code, room);
    return { roomCode: code, hostToken: room.hostToken, snapshot: this.snapshot(room, true) as HostSnapshot };
  }
  join(code: unknown, name: unknown, socket: string) {
    const room = this.room(code);
    if (typeof name !== 'string' || !name.trim() || [...name.trim()].length > 24) throw new RoomError('INVALID_NAME', 'Enter a name with 1–24 characters.');
    const clean = name.trim();
    if ([...room.players.values()].some(p => p.name.toLowerCase() === clean.toLowerCase())) throw new RoomError('NAME_TAKEN', 'That name is already in this room. Choose another.');
    const player: InternalPlayer = { id: randomUUID(), name: clean, online: true, token: token(), socket };
    room.players.set(player.id, player);
    return { playerId: player.id, playerToken: player.token, snapshot: this.snapshot(room, false) as PublicSnapshot };
  }
  resume(code: unknown, credential: unknown, socket: string, host: boolean) {
    const room = this.room(code);
    if (typeof credential !== 'string' || credential.length !== 64) throw new RoomError('UNAUTHORIZED', 'Session credentials are missing or invalid.');
    let previous: string | null;
    if (host) {
      if (room.hostToken !== credential) throw new RoomError('UNAUTHORIZED', 'Host credentials are invalid. Return to the original browser session.');
      previous = room.hostSocket; room.hostSocket = socket;
    } else {
      const player = [...room.players.values()].find(p => p.token === credential);
      if (!player) throw new RoomError('UNAUTHORIZED', 'Player credentials are invalid.');
      previous = player.socket; player.socket = socket; player.online = true;
    }
    return { previous, snapshot: this.snapshot(room, host) };
  }
  disconnect(socket: string) {
    const changed = new Set<string>();
    for (const room of this.rooms.values()) {
      if (room.hostSocket === socket) { room.hostSocket = null; changed.add(room.code); }
      for (const player of room.players.values()) if (player.socket === socket) { player.socket = null; player.online = false; changed.add(room.code); }
    }
    return changed;
  }
  recipients(code: string): { socket: string; snapshot: Snapshot }[] {
    const room = this.room(code);
    const recipients = [...room.players.values()].filter(p => p.socket).map(p => ({ socket: p.socket!, snapshot: this.snapshot(room, false) }));
    if (room.hostSocket) recipients.push({ socket: room.hostSocket, snapshot: this.snapshot(room, true) });
    return recipients;
  }
  private snapshot(room: Room, host: boolean): Snapshot {
    const base = { code: room.code, status: 'WAITING' as const, roundNumber: 0 as const, winnerPlayerId: null, players: [...room.players.values()].map(({ id, name, online }) => ({ id, name, online })) };
    return host ? { ...base, role: 'host', hostOnline: room.hostSocket !== null } : { ...base, role: 'player' };
  }
}
