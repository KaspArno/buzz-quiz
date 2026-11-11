import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, Snapshot } from '@buzz/shared';
import './style.css';
const saved = (role: string, code: string) => sessionStorage.getItem(`buzz:${role}:${code}`);
function App() {
  const match = location.pathname.match(/^\/(host|join)\/([^/]+)$/);
  const role = match?.[1] === 'host' ? 'host' : 'player';
  const code = match?.[2]?.toUpperCase() ?? '';
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [connection, setConnection] = useState('Connecting…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const socket = useRef<Socket<ServerEvents, ClientEvents>>(null);
  const ready = connection === 'Connected';
  useEffect(() => {
    const client: Socket<ServerEvents, ClientEvents> = io(); socket.current = client;
    client.on('connect', () => {
      setError(''); setBusy(false);
      const credential = code && saved(role, code);
      if (!credential) { setConnection('Connected'); if (code && role === 'host') setError('Host credentials are missing. Use the browser session that created this room.'); return; }
      setConnection('Restoring session…');
      if (role === 'host') client.emit('host:resume', { roomCode: code, hostToken: credential }, result => {
        setConnection(result.ok ? 'Connected' : 'Session unavailable');
        if (result.ok) setSnapshot(result.data); else setError(result.error.message);
      });
      else client.emit('player:resume', { roomCode: code, playerToken: credential }, result => {
        setConnection(result.ok ? 'Connected' : 'Session unavailable');
        if (result.ok) setSnapshot(result.data); else setError(result.error.message);
      });
    });
    client.on('room:state', state => setSnapshot(state));
    client.on('disconnect', () => { setConnection('Disconnected — reconnecting…'); setBusy(false); });
    client.on('connect_error', () => setConnection('Unable to connect — retrying…'));
    client.on('session:replaced', () => { client.disconnect(); setConnection('Session replaced'); setError('This session was opened in another connection. Refresh to resume here.'); });
    return () => { client.disconnect(); };
  }, []);
  function create() {
    setBusy(true); setError('');
    socket.current!.timeout(8000).emit('host:create-room', {}, (err, result) => {
      setBusy(false);
      if (err) { setError('No response. Refresh before retrying.'); return; }
      if (!result.ok) { setError(result.error.message); return; }
      sessionStorage.setItem(`buzz:host:${result.data.roomCode}`, result.data.hostToken);
      location.assign(`/host/${result.data.roomCode}`);
    });
  }
  function join(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    socket.current!.timeout(8000).emit('player:join', { roomCode: code, displayName: name }, (err, result) => {
      setBusy(false);
      if (err) { setError('No response. Refresh before retrying.'); return; }
      if (!result.ok) { setError(result.error.message); return; }
      sessionStorage.setItem(`buzz:player:${code}`, result.data.playerToken);
      sessionStorage.setItem(`buzz:playerId:${code}`, result.data.playerId);
      setSnapshot(result.data.snapshot);
    });
  }
  const url = `${location.origin}/join/${code}`;
  return <main><a href="/" className="brand">Buzz Quiz</a><p role="status" className="connection">{connection}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!match ? <><h1>Bring everyone together.</h1><p>Create a room and invite your contestants.</p><button disabled={!ready || busy} onClick={create}>Create room</button><form onSubmit={e => { e.preventDefault(); location.assign(`/join/${encodeURIComponent(joinCode.trim().toUpperCase())}`); }}><label>Room code<input required maxLength={6} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} autoCapitalize="characters" /></label><button>Join room</button></form></>
    : snapshot ? <><p className="eyebrow">{role === 'host' ? 'Host lobby' : 'Contestant lobby'}</p><h1 className="code">{snapshot.code}</h1><p>Waiting for host</p>
      {role === 'host' ? <><label>Contestant invitation<input readOnly value={url} onFocus={e => e.target.select()} /></label><button onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError('Select and copy the invitation link above.'); } }}>{copied ? 'Copied!' : 'Copy join link'}</button><h2>Contestants · {snapshot.players.length}</h2><ul>{snapshot.players.map(p => <li key={p.id}><span>{p.name}</span><span>{p.online ? '● Online' : '○ Offline'}</span></li>)}</ul>{!snapshot.players.length && <p>Share the link to fill your lobby.</p>}<p>Room status: Waiting</p></>
      : <><h2>{snapshot.players.find(p => p.id === saved('playerId', code))?.name}</h2><p>You’re in the lobby. Stay here while everyone joins.</p></>}
    </> : role === 'host' ? <h1>Restoring host lobby…</h1> : <><h1>Join {code}</h1><form onSubmit={join}><label>Your display name<input required maxLength={48} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" /></label><p>Use 1–24 characters. Names must be unique in this room.</p><button disabled={!ready || busy || !!saved('player', code)}>Join lobby</button></form></>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
