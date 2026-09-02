import type { LayoutServerLoad } from './$types';

// Efecto secundario valioso de tener un load acá: fuerza a que cada
// navegación client-side (no solo la carga inicial) vuelva a pasar por
// hooks.server.ts, así que una sesión revocada a medio uso te saca en el
// siguiente clic, no solo en un refresh manual.
export const load: LayoutServerLoad = ({ locals }) => {
  return { usuario: locals.usuario };
};
