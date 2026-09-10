import type { LayoutServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import { esDaltonismo, type Daltonismo } from '$lib/daltonismo';

// Efecto secundario valioso de tener un load acá: fuerza a que cada
// navegación client-side (no solo la carga inicial) vuelva a pasar por
// hooks.server.ts, así que una sesión revocada a medio uso te saca en el
// siguiente clic, no solo en un refresh manual.
//
// El filtro de daltonismo se lee aquí (y no en cada página) porque pinta cosas
// en varias rutas a la vez, y EN EL SERVIDOR para que todo llegue del color
// correcto de una vez: si viniera de un fetch del cliente, se verían un
// instante los colores viejos y luego cambiarían -- justo lo que el filtro
// quiere evitar. Es una lectura chiquita de SQLite por navegación.
export const load: LayoutServerLoad = async ({ locals }) => {
  let daltonismo: Daltonismo = 'ninguno';
  if (locals.usuario) {
    try {
      const res = await apiFetch(locals.usuario, '/preferencias');
      if (res.ok) {
        const datos = (await res.json()) as { daltonismo?: unknown };
        if (esDaltonismo(datos.daltonismo)) daltonismo = datos.daltonismo;
      }
    } catch {
      // Best-effort: si la API no responde, la app se pinta con los colores de
      // siempre en vez de no cargar.
    }
  }
  return { usuario: locals.usuario, daltonismo };
};
