import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/socket';

export type TypedSocketClient = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocketClient | null = null;

export function getSocket(): TypedSocketClient {
  if (!socket) {
    const token = localStorage.getItem('token') || undefined;
    socket = io({
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
    });

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected with ID:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.warn('[Socket.IO] Connection error:', error.message);
    });
  }

  return socket;
}

export function updateSocketAuth(token?: string): void {
  if (socket) {
    socket.auth = token ? { token } : {};
    if (socket.connected) {
      socket.disconnect().connect();
    }
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

