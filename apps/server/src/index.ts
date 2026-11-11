import { createApp } from './server.js';
const port = Number(process.env.PORT || 3001);
const app = createApp(process.env.WEB_ORIGIN);
app.http.listen(port, '0.0.0.0', () => console.log(`Lobby server listening on port ${port}`));
