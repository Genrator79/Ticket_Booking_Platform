import { env } from './config/env.js';
import { createServerInstance } from './server.js';
import { closeSocket } from './socket/index.js';

const { httpServer } = createServerInstance();

const server = httpServer.listen(env.PORT, () => {
  console.log(`===============================================`);
  console.log(` Ticket Booking Platform API Server Running`);
  console.log(` Port: ${env.PORT}`);
  console.log(` Environment: ${env.NODE_ENV}`);
  console.log(` Health: http://localhost:${env.PORT}/api/health`);
  console.log(` WebSockets: Socket.IO initialized`);
  console.log(`===============================================`);
});

// Graceful Shutdown
async function handleShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  try {
    await closeSocket();
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }

  // Force shutdown after timeout
  setTimeout(() => {
    console.error('Forcing shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
