import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { apiFetch } from '$lib/server/api';

// El dueño: id=1 por construcción (ver auth.ADMIN_USUARIO_ID en la API --
// misma regla en los dos lados, nada nuevo que sincronizar).
const ADMIN_ID = 1;

type UsuarioFila = { id: number; nombre: string; activo: boolean; created_at: string };

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.usuario?.id !== ADMIN_ID) redirect(307, '/');

  const res = await apiFetch(locals.usuario, '/admin/usuarios');
  const usuarios = res.ok ? ((await res.json()) as UsuarioFila[]) : [];
  return { usuarios };
};

async function detalleError(res: Response, fallback: string): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { detail?: string };
    return cuerpo.detail ?? fallback;
  } catch {
    return fallback;
  }
}

export const actions: Actions = {
  crear: async ({ request, locals }) => {
    if (locals.usuario?.id !== ADMIN_ID) redirect(307, '/');
    const datos = await request.formData();
    const nombre = String(datos.get('nombre') ?? '').trim();
    if (!nombre) return fail(400, { error: 'Escribe un nombre.' });
    // Código opcional: si el admin escribió uno (para que sea memorable), se
    // usa tal cual; si lo dejó vacío, el back genera uno aleatorio.
    const codigo = String(datos.get('codigo') ?? '').trim() || undefined;

    const res = await apiFetch(locals.usuario, '/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, codigo_acceso: codigo })
    });
    if (!res.ok) return fail(res.status, { error: await detalleError(res, 'No se pudo crear el usuario.') });

    const nuevo = (await res.json()) as { id: number; nombre: string; codigo_acceso: string };
    return { creado: true, nombreCreado: nuevo.nombre, codigoCreado: nuevo.codigo_acceso };
  },

  activar: async ({ request, locals }) => {
    if (locals.usuario?.id !== ADMIN_ID) redirect(307, '/');
    const id = Number((await request.formData()).get('id'));
    const res = await apiFetch(locals.usuario, `/admin/usuarios/${id}/activo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: true })
    });
    if (!res.ok) return fail(res.status, { error: await detalleError(res, 'No se pudo activar.') });
  },

  desactivar: async ({ request, locals }) => {
    if (locals.usuario?.id !== ADMIN_ID) redirect(307, '/');
    const id = Number((await request.formData()).get('id'));
    const res = await apiFetch(locals.usuario, `/admin/usuarios/${id}/activo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: false })
    });
    if (!res.ok) return fail(res.status, { error: await detalleError(res, 'No se pudo desactivar.') });
  },

  regenerar: async ({ request, locals }) => {
    if (locals.usuario?.id !== ADMIN_ID) redirect(307, '/');
    const datos = await request.formData();
    const id = Number(datos.get('id'));
    const nombre = String(datos.get('nombre') ?? '');
    const codigo = String(datos.get('codigo') ?? '').trim() || undefined;

    const res = await apiFetch(locals.usuario, `/admin/usuarios/${id}/regenerar-codigo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_acceso: codigo })
    });
    if (!res.ok) return fail(res.status, { error: await detalleError(res, 'No se pudo regenerar el código.') });

    const data = (await res.json()) as { codigo_acceso: string };
    return { creado: true, nombreCreado: nombre, codigoCreado: data.codigo_acceso };
  },

  revocar: async ({ request, locals }) => {
    if (locals.usuario?.id !== ADMIN_ID) redirect(307, '/');
    const id = Number((await request.formData()).get('id'));
    const res = await apiFetch(locals.usuario, `/admin/usuarios/${id}/revocar`, { method: 'POST' });
    if (!res.ok) return fail(res.status, { error: await detalleError(res, 'No se pudo revocar la sesión.') });
    return { revocado: true };
  }
};
