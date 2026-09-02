import { redirect, type Handle } from '@sveltejs/kit';
import { verificarSesion } from '$lib/server/sesion';

const NOMBRE_COOKIE = 'kcal_sesion';

export const handle: Handle = async ({ event, resolve }) => {
  const valor = event.cookies.get(NOMBRE_COOKIE);
  event.locals.usuario = valor ? verificarSesion(valor) : null;

  const { pathname } = event.url;

  // Assets construidos por SvelteKit (JS/CSS/imágenes importadas) -- sin
  // esto, /login mismo no podría cargar su propio bundle (quedaría
  // atrapado detrás del guard de abajo antes de poder mostrarse).
  if (pathname.startsWith('/_app/')) {
    return resolve(event);
  }

  // /api/* nunca redirige (los componentes esperan un fetch con status, no
  // una navegación) -- 401 plano, y ahí se queda: el proxy de abajo
  // (routes/api/[...ruta]) ni se llega a invocar sin sesión.
  if (pathname.startsWith('/api/')) {
    if (!event.locals.usuario) {
      return new Response(JSON.stringify({ detail: 'No autenticado.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    }
    return resolve(event);
  }

  if (!event.locals.usuario && pathname !== '/login') {
    redirect(307, '/login');
  }
  if (event.locals.usuario && pathname === '/login') {
    redirect(307, '/');
  }

  return resolve(event);
};
