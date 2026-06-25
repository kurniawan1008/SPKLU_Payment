import { getToken, clearToken } from './auth';

const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors || null;
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server.', 0);
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* respons tanpa body */
  }

  if (!res.ok || (payload && payload.success === false)) {
    // Token kedaluwarsa/invalid → bersihkan sesi.
    if (res.status === 401) clearToken();
    throw new ApiError(payload?.message || 'Terjadi kesalahan pada server.', res.status, payload?.errors);
  }

  return payload?.data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};
