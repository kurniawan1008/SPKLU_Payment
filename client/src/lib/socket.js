import { io } from 'socket.io-client';
import { getToken } from './auth';

let socket;

// Singleton — sambungan diproksikan Vite (dev) atau same-origin (prod).
export function getSocket() {
  if (!socket) {
    const token = getToken();
    socket = io({
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token },
    });
  }
  return socket;
}
