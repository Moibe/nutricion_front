// Llamadas server-to-server a nutricion_api, con los mismos headers de auth
// que usa el proxy /api/[...ruta] -- compartido para que /admin (que le
// pega a la API directo desde su +page.server.ts, sin rebotar por su propio
// proxy) no duplique esta construcción de headers.
import { env } from '$env/dynamic/private';
import type { Usuario } from './sesion';

export const API_ORIGIN = env.API_ORIGIN ?? 'http://127.0.0.1:8002';
export const INTERNAL_TOKEN = env.INTERNAL_TOKEN ?? '';

export function headersDe(usuario: Usuario): Record<string, string> {
  return {
    'X-Internal-Token': INTERNAL_TOKEN,
    'X-Usuario-Id': String(usuario.id),
    'X-Token-Version': String(usuario.tokenVersion)
  };
}

export async function apiFetch(usuario: Usuario, ruta: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_ORIGIN}${ruta}`, {
    ...init,
    headers: { ...headersDe(usuario), ...(init.headers as Record<string, string> | undefined) }
  });
}
