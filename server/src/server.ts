import http from 'http';
import { createApp } from './app.js';
import { initSocketServer, TypedSocketServer } from './socket/index.js';

export interface ServerInstance {
  app: ReturnType<typeof createApp>;
  httpServer: http.Server;
  io: TypedSocketServer;
}

export function createServerInstance(): ServerInstance {
  const app = createApp();
  const httpServer = http.createServer(app);
  const io = initSocketServer(httpServer);

  return { app, httpServer, io };
}

