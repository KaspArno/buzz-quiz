export interface Player { id: string; name: string; online: boolean }
export interface PublicSnapshot { role: 'player'; code: string; status: 'WAITING'; roundNumber: 0; winnerPlayerId: null; players: Player[] }
export interface HostSnapshot extends Omit<PublicSnapshot, 'role'> { role: 'host'; hostOnline: boolean }
export type Snapshot = PublicSnapshot | HostSnapshot;
export type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
export interface HostCredentials { roomCode: string; hostToken: string }
export interface PlayerCredentials { roomCode: string; playerToken: string }
export interface Created { roomCode: string; hostToken: string; snapshot: HostSnapshot }
export interface Joined { playerId: string; playerToken: string; snapshot: PublicSnapshot }
export interface ClientEvents {
  'host:create-room': (payload: Record<string, never>, ack: (result: Ack<Created>) => void) => void;
  'host:resume': (payload: HostCredentials, ack: (result: Ack<HostSnapshot>) => void) => void;
  'player:join': (payload: { roomCode: string; displayName: string }, ack: (result: Ack<Joined>) => void) => void;
  'player:resume': (payload: PlayerCredentials, ack: (result: Ack<PublicSnapshot>) => void) => void;
}
export interface ServerEvents { 'room:state': (snapshot: Snapshot) => void; 'session:replaced': () => void }
