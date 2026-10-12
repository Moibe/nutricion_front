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

export type DatosMuyFrecuente = {
  nombre: string;
  kilocalorias: number;
  proteinas: number | null;
  carbohidratos: number | null;
  grasas: number | null;
};

// PUT /muy-frecuentes/{slot}: llena o reemplaza una tarjeta. Lo comparten el
// modal de creación (con el resultado de la IA) y el arrastrar-y-soltar de un
// frecuente (con datos ya guardados) -- un solo lugar que sabe cómo hablarle a
// la API y cómo leer su error. Lanza Error con el mensaje listo para mostrar.
export async function putMuyFrecuente(
  apiUrl: string,
  slot: number,
  datos: DatosMuyFrecuente
): Promise<MuyFrecuente> {
  const res = await fetch(`${apiUrl}/muy-frecuentes/${slot}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos)
  });
  if (!res.ok) {
    let detalle = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === 'string') detalle = j.detail;
      else if (Array.isArray(j.detail) && j.detail[0] && typeof j.detail[0] === 'object' && 'msg' in j.detail[0]) {
        detalle = String((j.detail[0] as { msg: unknown }).msg);
      }
    } catch {
      // sin cuerpo JSON: se queda el HTTP <status>
    }
    throw new Error(detalle);
  }
  return (await res.json()) as MuyFrecuente;
}

// La API solo manda los slots llenos; el front necesita siempre las 4
// posiciones (null = tarjeta vacía) para dibujar la fila completa.
export function slotsDesde(lista: MuyFrecuente[]): (MuyFrecuente | null)[] {
  const slots: (MuyFrecuente | null)[] = Array.from({ length: SLOTS_MUY_FRECUENTES }, () => null);
  for (const mf of lista) {
    if (Number.isInteger(mf.slot) && mf.slot >= 0 && mf.slot < SLOTS_MUY_FRECUENTES) slots[mf.slot] = mf;
  }
  return slots;
}
