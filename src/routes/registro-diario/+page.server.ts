import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import { esDaltonismo, type Daltonismo } from '$lib/daltonismo';

// El filtro de daltonismo se lee EN EL SERVIDOR (no con un fetch del cliente
// como el resto de los datos de esta página) para que los triangulitos salgan
// pintados de una vez: si llegara después, se verían un instante en verde/rojo
// y luego cambiarían de color, que es justo lo que el filtro quiere evitar.
export const load: PageServerLoad = async ({ locals }) => {
  let daltonismo: Daltonismo = 'ninguno';
  if (locals.usuario) {
    try {
      const res = await apiFetch(locals.usuario, '/preferencias');
      if (res.ok) {
        const datos = (await res.json()) as { daltonismo?: unknown };
        if (esDaltonismo(datos.daltonismo)) daltonismo = datos.daltonismo;
      }
    } catch {
      // Best-effort: si la API no responde, la tabla se pinta con el verde/rojo
      // de siempre en vez de no cargar.
    }
  }
  return { daltonismo };
};
