import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socket.js';

export type TypedSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: TypedSocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): TypedSocketServer {
  if (io) {
    return io;
  }

  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin: [env.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    }
  );

  // Optional authentication middleware on connection
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
      if (token) {
        const payload = authService.verifyToken(token);
        socket.data.userId = payload.userId;
        socket.data.email = payload.email;
        socket.data.role = payload.role;
      }
    } catch {
      // Allow unauthenticated connections as guest viewers for real-time seat availability
    }
    next();
  });

  io.on('connection', (socket: TypedSocket) => {
    // Join a show-specific room for real-time seat events
    socket.on('join:show', ({ showId }, callback) => {
      if (!showId) {
        socket.emit('error', { message: 'showId is required to join show room' });
        return;
      }
      const room = `show:${showId}`;
      socket.join(room);
      socket.emit('joined:show', { showId, room });
      if (typeof callback === 'function') {
        callback({ success: true, room });
      }
    });

    // Leave a show-specific room
    socket.on('leave:show', ({ showId }, callback) => {
      if (showId) {
        const room = `show:${showId}`;
        socket.leave(room);
        socket.emit('left:show', { showId });
        if (typeof callback === 'function') {
          callback({ success: true });
        }
      }
    });

    socket.on('disconnect', (_reason) => {
      // Socket automatically leaves rooms upon disconnection
    });
  });

  return io;
}

export function getIO(): TypedSocketServer {
  if (!io) {
    throw new Error('Socket.IO server has not been initialized. Call initSocketServer(httpServer) first.');
  }
  return io;
}

export async function closeSocket(): Promise<void> {
  if (io) {
    await new Promise<void>((resolve) => {
      io!.close(() => {
        io = null;
        resolve();
      });
    });
  }
}

