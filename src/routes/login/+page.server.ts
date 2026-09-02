import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { firmarSesion } from '$lib/server/sesion';

// La redirección "ya tienes sesión, no muestres /login" vive en
// hooks.server.ts (una sola fuente de verdad) -- acá solo el canje del
// código de acceso.
const API_ORIGIN = env.API_ORIGIN ?? 'http://127.0.0.1:8002';
const INTERNAL_TOKEN = env.INTERNAL_TOKEN ?? '';

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const datos = await request.formData();
    const codigo = String(datos.get('codigo') ?? '').trim();
    if (!codigo) {
      return fail(400, { error: 'Escribe tu código de acceso.' });
    }

    let respuesta: Response;
    try {
      respuesta = await fetch(`${API_ORIGIN}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
        body: JSON.stringify({ codigo_acceso: codigo })
      });
    } catch {
      return fail(503, { error: `No se pudo conectar con la API en ${API_ORIGIN}.` });
    }

    if (!respuesta.ok) {
      return fail(401, { error: 'Código de acceso inválido.' });
    }

    const usuario = (await respuesta.json()) as { id: number; nombre: string; token_version: number };
    cookies.set(
      'kcal_sesion',
      firmarSesion({ id: usuario.id, nombre: usuario.nombre, tokenVersion: usuario.token_version }),
      {
        path: '/',
        httpOnly: true,
        secure: !dev,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365 // 1 año -- app personal para gente conocida, sin necesidad de recapturar el código seguido.
      }
    );
    redirect(307, '/');
  }
};
