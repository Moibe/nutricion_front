import { redirect } from '@sveltejs/kit';

// La raíz no tiene contenido propio: Nutrición es la pantalla por default.
export function load() {
  redirect(307, '/nutricion');
}
