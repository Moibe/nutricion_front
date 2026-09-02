// Proxy server-side hacia nutricion_api: el browser nunca le habla directo a
// la API (que ya no acepta requests sin X-Internal-Token). Los ~28 fetch de
// los componentes existentes no cambian -- solo su fallback de PUBLIC_API_URL
// pasa a ser '/api', así que terminan pegándole aquí en vez de al backend.
import type { RequestEvent, RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const API_ORIGIN = env.API_ORIGIN ?? 'http://127.0.0.1:8002';
const INTERNAL_TOKEN = env.INTERNAL_TOKEN ?? '';

const SIN_CUERPO = new Set(['GET', 'HEAD', 'DELETE']);

async function proxiar({ params, request, url, locals }: RequestEvent): Promise<Response> {
  // hooks.server.ts ya corta esto antes de llegar aquí -- doble candado, no
  // porque se espere que falle, sino porque un endpoint sin auth escrito mal
  // en el futuro no debe poder saltarse esto por accidente.
  if (!locals.usuario) {
    return new Response(JSON.stringify({ detail: 'No autenticado.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    });
  }

  const destino = `${API_ORIGIN}/${params.ruta ?? ''}${url.search}`;

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('X-Internal-Token', INTERNAL_TOKEN);
  headers.set('X-Usuario-Id', String(locals.usuario.id));
  headers.set('X-Token-Version', String(locals.usuario.tokenVersion));

  const init: RequestInit = { method: request.method, headers };
  if (!SIN_CUERPO.has(request.method)) {
    init.body = await request.text();
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(destino, init);
  } catch {
    return new Response(JSON.stringify({ detail: `No se pudo conectar con la API en ${API_ORIGIN}.` }), {
      status: 503,
      headers: { 'content-type': 'application/json' }
    });
  }

  const cuerpo = await respuesta.text();
  return new Response(cuerpo, {
    status: respuesta.status,
    headers: { 'content-type': respuesta.headers.get('content-type') ?? 'application/json' }
  });
}

export const GET: RequestHandler = (event) => proxiar(event);
export const POST: RequestHandler = (event) => proxiar(event);
export const PATCH: RequestHandler = (event) => proxiar(event);
export const DELETE: RequestHandler = (event) => proxiar(event);
