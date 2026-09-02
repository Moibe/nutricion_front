// Sesión firmada por HMAC, guardada en una cookie httpOnly (kcal_sesion).
// Sin dependencias nuevas: crypto es nativo de Node (adapter-node), y
// timingSafeEqual evita que comparar la firma carácter por carácter filtre
// SESSION_SECRET por timing.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export type Usuario = { id: number; nombre: string; tokenVersion: number };

function secreto(): string {
  const s = env.SESSION_SECRET;
  if (!s) throw new Error('Falta SESSION_SECRET en el entorno del servidor.');
  return s;
}

function firmarPayload(payloadB64: string): string {
  return createHmac('sha256', secreto()).update(payloadB64).digest('base64url');
}

// "payload_base64.firma" -- el payload va en claro (nada secreto: solo
// id/nombre/tokenVersion), la firma es lo que impide falsificarlo o alterarlo.
export function firmarSesion(usuario: Usuario): string {
  const payloadB64 = Buffer.from(JSON.stringify(usuario)).toString('base64url');
  return `${payloadB64}.${firmarPayload(payloadB64)}`;
}

export function verificarSesion(valor: string): Usuario | null {
  const partes = valor.split('.');
  if (partes.length !== 2) return null;
  const [payloadB64, firma] = partes;

  const esperada = firmarPayload(payloadB64);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const datos = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (
      typeof datos.id !== 'number' ||
      typeof datos.nombre !== 'string' ||
      typeof datos.tokenVersion !== 'number'
    ) {
      return null;
    }
    return datos as Usuario;
  } catch {
    return null;
  }
}
