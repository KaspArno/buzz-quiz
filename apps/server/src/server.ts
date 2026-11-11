import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { Ack, ClientEvents, ServerEvents } from '@buzz/shared';
import { RoomError, RoomService } from './rooms.js';
export function createApp(origin = 'http://localhost:5173') {
  const rooms = new RoomService();
  const http = createServer((req, res) => { res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(req.url === '/health' ? { ok: true } : { error: 'Not found' })); });
  const io = new Server<ClientEvents, ServerEvents>(http, { cors: { origin: origin.split(',') }, maxHttpBufferSize: 8192 });
  const publish = (code: string) => { for (const recipient of rooms.recipients(code)) io.to(recipient.socket).emit('room:state', recipient.snapshot); };
  io.on('connection', socket => {
    // One identity per transport. Invalid commands never register membership.
    let authenticated = false;
    const command = <T>(payload: unknown, ack: unknown, action: (data: Record<string, unknown>) => { data: T; code: string; previous?: string | null }) => {
      if (typeof ack !== 'function') return;
      const reply = ack as (result: Ack<T>) => void;
      try {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new RoomError('INVALID_PAYLOAD', 'Invalid command payload.');
        if (authenticated) throw new RoomError('INVALID_STATE', 'This connection already has a session.');
        const result = action(payload as Record<string, unknown>);
        authenticated = true;
        if (result.previous && result.previous !== socket.id) {
          const old = io.sockets.sockets.get(result.previous);
          old?.emit('session:replaced'); old?.disconnect(true);
        }
        reply({ ok: true, data: result.data }); publish(result.code);
      } catch (error) {
        reply({ ok: false, error: error instanceof RoomError ? { code: error.code, message: error.message } : { code: 'INVALID_PAYLOAD', message: 'Unable to process command.' } });
      }
    };
    socket.on('host:create-room', (p, ack) => command(p, ack, () => { const data = rooms.create(socket.id); return { data, code: data.roomCode }; }));
    socket.on('player:join', (p, ack) => command(p, ack, d => { const data = rooms.join(d.roomCode, d.displayName, socket.id); return { data, code: data.snapshot.code }; }));
    socket.on('host:resume', (p, ack) => command(p, ack, d => { const result = rooms.resume(d.roomCode, d.hostToken, socket.id, true); return { data: result.snapshot, code: result.snapshot.code, previous: result.previous }; }));
    socket.on('player:resume', (p, ack) => command(p, ack, d => { const result = rooms.resume(d.roomCode, d.playerToken, socket.id, false); return { data: result.snapshot, code: result.snapshot.code, previous: result.previous }; }));
    socket.on('disconnect', () => { for (const code of rooms.disconnect(socket.id)) publish(code); });
  });
  return { http, io, rooms };
}
