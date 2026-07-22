import { redirect } from '@sveltejs/kit';

// La raíz no tiene contenido propio: Hoy es la pantalla por default.
export function load() {
  redirect(307, '/hoy');
}
