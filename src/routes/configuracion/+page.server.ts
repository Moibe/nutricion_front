import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';
import { esDaltonismo, type Daltonismo } from '$lib/daltonismo';

// El dueño: id=1 por construcción (ver auth.ADMIN_USUARIO_ID en la API --
// misma regla en los dos lados, nada nuevo que sincronizar). Mismo gate que
// /admin.
//
// Nota para cuando esta página deje de ser solo del admin: el filtro de
// daltonismo se guarda POR USUARIO en la API, así que abrirla a todos es
// quitar este gate y ya -- no hay nada aquí que sea global.
const ADMIN_ID = 1;

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.usuario?.id !== ADMIN_ID) redirect(307, '/');

  let daltonismo: Daltonismo = 'ninguno';
  try {
    const res = await apiFetch(locals.usuario, '/preferencias');
    if (res.ok) {
      const datos = (await res.json()) as { daltonismo?: unknown };
      if (esDaltonismo(datos.daltonismo)) daltonismo = datos.daltonismo;
    }
  } catch {
    // Best-effort: si la API no responde, la página abre en "Sin filtro" en
    // vez de no abrir.
  }
  return { daltonismo };
};

export const actions: Actions = {
  daltonismo: async ({ request, locals }) => {
    if (locals.usuario?.id !== ADMIN_ID) redirect(307, '/');

    const valor = String((await request.formData()).get('daltonismo') ?? '');
    if (!esDaltonismo(valor)) return fail(400, { error: 'Opción no válida.' });

    const res = await apiFetch(locals.usuario, '/preferencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daltonismo: valor })
    });
    if (!res.ok) return fail(res.status, { error: 'No se pudo guardar la preferencia.' });

    return { guardado: true };
  }
};
