<script lang="ts">
  // "Muy frecuentes" de ejercicio: 4 tarjetas fijas que registran la actividad
  // del día con un toque, SIN pasar por la IA -- que es justo su razón de ser.
  // Por eso viven aquí, en la página, y no dentro del panel del chat: esconder
  // detrás de "Preguntarle a la IA" lo único que existe para NO preguntarle
  // era contradictorio.
  //
  // Vacía = abre el modal de creación. Llena = un toque la registra. El lápiz
  // la reemplaza. Y acepta que le arrastres un frecuente desde el chat.
  import { env } from '$env/dynamic/public';
  import { putMuyFrecuenteEjercicio, type MuyFrecuenteEjercicio } from '$lib/muyFrecuentes';

  type Guardado = { id: number; conversation_id: string; concepto: string | null; kilocalorias: number };

  let {
    muyFrecuentes,
    fecha,
    onUsado,
    onAbrirMuyFrecuente,
    onMuyFrecuenteGuardado
  }: {
    // null mientras la API no responda: así no se dibujan tarjetas que
    // fallarían al tocarlas.
    muyFrecuentes: (MuyFrecuenteEjercicio | null)[] | null;
    fecha: string;
    onUsado: (g: Guardado) => void;
    onAbrirMuyFrecuente: (slot: number) => void;
    onMuyFrecuenteGuardado: (mf: MuyFrecuenteEjercicio) => void;
  } = $props();

  const API_URL = env.PUBLIC_API_URL ?? '/api';
  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  // Mismo MIME que usa el chip de "Tus frecuentes" en ChatEjercicio. Ahora el
  // chip viaja con sus datos dentro (nombre y kcal) en vez de solo su id: así
  // esta rejilla no necesita conocer la lista de frecuentes, que vive en otro
  // componente desde que las tarjetas salieron del chat.
  const MIME_FAVORITO = 'application/x-kcal-favorito-ejercicio';

  let usandoSlot = $state<number | null>(null);
  let guardandoSlotDrop = $state<number | null>(null);
  let slotSobre = $state<number | null>(null);
  let arrastrandoFavorito = $state(false);
  let error = $state<string | null>(null);

  // dragstart/dragend burbujean hasta window, así que la rejilla se entera de
  // que empezó un arrastre aunque el chip viva en el panel del chat, y puede
  // marcarse como destino posible sin que los dos componentes se hablen.
  function alDragStartGlobal(e: DragEvent) {
    if (e.dataTransfer?.types.includes(MIME_FAVORITO)) arrastrandoFavorito = true;
  }

  function alDragEndGlobal() {
    arrastrandoFavorito = false;
    slotSobre = null;
  }

  function esArrastreDeFavorito(e: DragEvent) {
    return !!e.dataTransfer?.types.includes(MIME_FAVORITO);
  }

  function alPasarSobreSlot(e: DragEvent, slot: number) {
    if (!esArrastreDeFavorito(e)) return;
    e.preventDefault(); // sin esto el navegador no permite soltar aquí
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    slotSobre = slot;
  }

  function alSalirDeSlot(e: DragEvent, slot: number) {
    // dragleave también dispara al pasar a un hijo de la misma tarjeta: ahí NO
    // se sale, y apagar el resalte parpadearía.
    const destino = e.relatedTarget;
    if (destino instanceof Node && (e.currentTarget as HTMLElement).contains(destino)) return;
    if (slotSobre === slot) slotSobre = null;
  }

  async function alSoltarEnSlot(e: DragEvent, slot: number) {
    if (!esArrastreDeFavorito(e)) return;
    e.preventDefault();
    const crudo = e.dataTransfer?.getData(MIME_FAVORITO);
    alDragEndGlobal();
    if (!crudo || guardandoSlotDrop !== null) return;
    let fav: { nombre?: unknown; kilocalorias?: unknown };
    try {
      fav = JSON.parse(crudo);
    } catch {
      return; // payload que no entendemos: se ignora en silencio
    }
    if (typeof fav.nombre !== 'string' || !fav.nombre) return;
    guardandoSlotDrop = slot;
    error = null;
    try {
      // Un frecuente viejo sin kcal se guarda con 0, igual que se muestra.
      const mf = await putMuyFrecuenteEjercicio(API_URL, slot, {
        nombre: fav.nombre,
        kilocalorias: typeof fav.kilocalorias === 'number' ? fav.kilocalorias : 0
      });
      onMuyFrecuenteGuardado(mf);
    } catch (err) {
      error = mensaje(err);
    } finally {
      guardandoSlotDrop = null;
    }
  }

  function mensaje(e: unknown) {
    if (e instanceof TypeError) return `No se pudo conectar con la API en ${API_URL}.`;
    return e instanceof Error ? e.message : String(e);
  }

  // Registrar la actividad del día: POST directo a /ejercicios/chat con un
  // conversation_id sintético y único (cada toque es una entrada nueva, no una
  // edición). Sin IA, sin tokens.
  async function usar(mf: MuyFrecuenteEjercicio) {
    if (usandoSlot !== null) return;
    usandoSlot = mf.slot;
    error = null;
    try {
      const cid = crypto.randomUUID();
      const res = await fetch(`${API_URL}/ejercicios/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: cid, fecha, concepto: mf.nombre, kilocalorias: mf.kilocalorias })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { id: number };
      onUsado({ id: data.id, conversation_id: cid, concepto: mf.nombre, kilocalorias: mf.kilocalorias ?? 0 });
    } catch (e) {
      error = mensaje(e);
    } finally {
      usandoSlot = null;
    }
  }
</script>

<svelte:window ondragstart={alDragStartGlobal} ondragend={alDragEndGlobal} />

{#if muyFrecuentes}
  <div class="muy-frecuentes-wrap">
    <span class="muy-frecuentes-label">Muy frecuentes</span>
    <div class="muy-frecuentes-grid" class:acepta={arrastrandoFavorito}>
      {#each muyFrecuentes as mf, slot (slot)}
        {#if mf}
          <div
            class="muy-frecuente-card llena"
            class:usando={usandoSlot === slot || guardandoSlotDrop === slot}
            class:sobre={slotSobre === slot}
            role="group"
            aria-label={`Muy frecuente ${slot + 1}: ${mf.nombre}`}
            ondragover={(e) => alPasarSobreSlot(e, slot)}
            ondragleave={(e) => alSalirDeSlot(e, slot)}
            ondrop={(e) => alSoltarEnSlot(e, slot)}
          >
            <button
              type="button"
              class="mf-usar"
              onclick={() => usar(mf)}
              disabled={usandoSlot !== null}
              title={`Agregar ${mf.nombre} a este día`}
            >
              <span class="mf-nombre">{mf.nombre}</span>
              <span class="mf-kcal">{fmt(mf.kilocalorias ?? 0)} kcal</span>
            </button>
            <button
              type="button"
              class="mf-editar"
              onclick={() => onAbrirMuyFrecuente(slot)}
              aria-label={`Reemplazar Muy frecuente ${slot + 1} (${mf.nombre})`}
              title="Reemplazar esta tarjeta"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="muy-frecuente-card vacia"
            class:usando={guardandoSlotDrop === slot}
            class:sobre={slotSobre === slot}
            onclick={() => onAbrirMuyFrecuente(slot)}
            ondragover={(e) => alPasarSobreSlot(e, slot)}
            ondragleave={(e) => alSalirDeSlot(e, slot)}
            ondrop={(e) => alSoltarEnSlot(e, slot)}
            aria-label={`Crear Muy frecuente ${slot + 1}`}
            title="Crear Muy frecuente"
          ></button>
        {/if}
      {/each}
    </div>
    {#if error}
      <div class="mf-error">⚠️ {error}</div>
    {/if}
  </div>
{/if}

<style>
  .muy-frecuentes-wrap {
    margin-bottom: 0.9rem;
    padding-bottom: 0.9rem;
    border-bottom: 1px dashed var(--line);
  }

  .muy-frecuentes-label {
    display: block;
    margin-bottom: 0.4rem;
    color: rgba(15, 23, 42, 0.6);
  }

  .muy-frecuentes-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  /* Cuatro cuadros en fila solo caben con holgura en pantalla ancha. Abajo de
     560px se parten en 2x2: a lo ancho de un teléfono, cuatro columnas dejan
     ~70px por tarjeta, y ahí el nombre se recorta a dos letras y el chip de
     kcal se desborda. Con 2x2 cada tarjeta mide el doble y vuelve a leerse. */
  @media (max-width: 560px) {
    .muy-frecuentes-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .muy-frecuente-card {
    position: relative;
    aspect-ratio: 1;
    border-radius: 10px;
    min-width: 0;
  }

  /* Vacía: el hueco con su borde punteado (el look ya aprobado). Ahora es un
     <button>, así que se le quitan los estilos nativos y se le da respuesta al
     pasar el mouse / enfocar con teclado, que es lo que avisa que se puede
     tocar. */
  .muy-frecuente-card.vacia {
    padding: 0;
    border: 1px dashed var(--line);
    background: rgba(15, 23, 42, 0.02);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.18s ease, background 0.18s ease;
  }

  .muy-frecuente-card.vacia:hover,
  .muy-frecuente-card.vacia:focus-visible {
    border-style: solid;
    border-color: var(--ink);
    background: var(--volt);
    outline: none;
  }

  /* Llena: borde sólido y blanca, para que se distinga de un vistazo de las
     vacías. El botón principal ocupa toda la tarjeta; el lápiz va aparte,
     flotando en la esquina (dos <button> no pueden anidarse). */
  .muy-frecuente-card.llena {
    border: 1px solid var(--line);
    background: #ffffff;
    overflow: hidden;
  }

  .muy-frecuente-card.llena.usando {
    opacity: 0.6;
  }

  .mf-usar {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.3rem;
    width: 100%;
    height: 100%;
    padding: 0.6rem 0.65rem;
    box-sizing: border-box;
    border: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.18s ease;
  }

  .mf-usar:hover:not(:disabled),
  .mf-usar:focus-visible {
    background: var(--volt);
    outline: none;
  }

  .mf-usar:disabled {
    cursor: not-allowed;
  }

  /* Hasta 3 renglones y luego puntos suspensivos: el nombre completo viaja en
     el title del botón. */
  .mf-nombre {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding-right: 1.3rem;
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .mf-kcal {
    flex-shrink: 0;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--volt);
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .mf-editar {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: rgba(15, 23, 42, 0.4);
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease;
  }

  .mf-editar:hover,
  .mf-editar:focus-visible {
    background: var(--ink);
    color: #ffffff;
    outline: none;
  }

  /* Arrastre de un frecuente: mientras dura, todas las tarjetas se marcan como
     destinos posibles (borde oscuro) y la que está bajo el cursor se ilumina.
     Los selectores llevan .muy-frecuentes-grid para ganarle en especificidad a
     .llena y .vacia sin recurrir a !important. */
  .muy-frecuentes-grid.acepta .muy-frecuente-card {
    border-color: var(--ink);
  }

  .muy-frecuentes-grid .muy-frecuente-card.sobre {
    border-style: solid;
    border-color: var(--ink);
    background: var(--volt);
  }

  .muy-frecuente-card.vacia.usando {
    opacity: 0.6;
  }

  .mf-error {
    margin-top: 0.5rem;
    font-size: 0.82rem;
    color: #991b1b;
  }
</style>
