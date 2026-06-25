import { io } from 'socket.io-client';

let socket;

// Singleton — sambungan diproksikan Vite (dev) atau same-origin (prod).
export function getSocket() {
  if (!socket) {
    socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}
