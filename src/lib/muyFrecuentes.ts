// "Muy frecuentes": 4 tarjetas fijas por usuario (slot 0-3) con los platillos de
// todos los días. Lo comparten ListadoComidas (dueño del estado), el chat
// (que las dibuja y las usa) y el modal de creación -- de ahí un módulo aparte
// en vez de repetir el tipo en cada componente.
export const SLOTS_MUY_FRECUENTES = 4;

export type MuyFrecuente = {
  slot: number;
  nombre: string;
  kilocalorias: number | null;
  proteinas: number | null;
  carbohidratos: number | null;
  grasas: number | null;
  updated_at: string;
};

// La API solo manda los slots llenos; el front necesita siempre las 4
// posiciones (null = tarjeta vacía) para dibujar la fila completa.
export function slotsDesde(lista: MuyFrecuente[]): (MuyFrecuente | null)[] {
  const slots: (MuyFrecuente | null)[] = Array.from({ length: SLOTS_MUY_FRECUENTES }, () => null);
  for (const mf of lista) {
    if (Number.isInteger(mf.slot) && mf.slot >= 0 && mf.slot < SLOTS_MUY_FRECUENTES) slots[mf.slot] = mf;
  }
  return slots;
}
