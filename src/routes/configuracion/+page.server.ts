import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// El dueño: id=1 por construcción (ver auth.ADMIN_USUARIO_ID en la API --
// misma regla en los dos lados, nada nuevo que sincronizar). Mismo gate que
// /admin -- página en blanco por ahora, el contenido llega después.
const ADMIN_ID = 1;

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.usuario?.id !== ADMIN_ID) redirect(307, '/');
};
