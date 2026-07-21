<script lang="ts">
  // Lista de comidas guardadas (GET /comidas de nutricion_api): cada comida
  // con al menos un consumo, con sus consumos anidados, ordenadas por fecha
  // (día más reciente primero) y dentro del día por su secuencia. El total
  // por comida se suma aquí en el cliente.
  //
  // Reusado por dos rutas: /listado (todas) y /hoy (soloHoy=true → solo las
  // del día en turno, en zona de CDMX, misma con la que el back sella la fecha).
  //
  // "Editar" un consumo = reabrir su MISMA conversación de IA (mismo
  // conversation_id), precargada con el resultado ya guardado, para seguir
  // chateando y corregirlo. Al guardar de nuevo, el back hace upsert por
  // conversation_id, así que ACTUALIZA esa fila en vez de crear una nueva.
  import { env } from '$env/dynamic/public';
  import ChatKilocalculator from '$lib/ChatKilocalculator.svelte';

  let { soloHoy = false }: { soloHoy?: boolean } = $props();

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  type Consumo = {
    id: number;
    conversation_id: string;
    platillo: string | null;
    kilocalorias: number | null;
    proteinas: number | null;
    carbohidratos: number | null;
    grasas: number | null;
  };
  type Comida = { id: number; tipo: string; fecha: string; created_at: string; consumos: Consumo[] };

  // El back solo distingue 4 tipos (las dos colaciones comparten "colacion").
  const TIPO_LABEL: Record<string, string> = {
    desayuno: 'Desayuno',
    colacion: 'Colación',
    comida: 'Comida',
    cena: 'Cena'
  };

  // Fecha de hoy en CDMX como "YYYY-MM-DD" (en-CA formatea ISO), para comparar
  // 1:1 con comida.fecha, que el back guarda en esa misma zona y formato.
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

  let comidas = $state<Comida[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  // Error transitorio de cambiar-fecha, SEPARADO del error de carga: se
  // muestra aditivamente (sin ocultar la lista) — el de carga sí es
  // sustitutivo porque en ese caso no hay tarjetas que mostrar.
  let errorFecha = $state<string | null>(null);
  // Solo una tarjeta expandida a la vez. Si editandoConsumo es null, el panel
  // abre en modo "agregar nuevo"; si no, reabre esa conversación puntual.
  let expandedId = $state<number | null>(null);
  let editandoConsumo = $state<Consumo | null>(null);
  // Eliminar consumo: confirmación inline (id del consumo pendiente) para no
  // borrar por accidente; el id "en vuelo" mientras corre el DELETE.
  let confirmandoEliminar = $state<number | null>(null);
  let eliminandoId = $state<number | null>(null);

  const comidasVisibles = $derived(
    soloHoy ? comidas.filter((c) => c.fecha === hoyISO) : comidas
  );

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  // Fecha en formato largo legible: "lunes, 20 de julio de 2026". El input date
  // nativo solo sabe mostrar dd/mm/yyyy, así que se muestra este texto encima y
  // el input queda transparente pero tappable debajo (ver .fecha-input en CSS).
  function formatoFecha(fecha: string) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  // Cambia la fecha de una comida (input de calendario). Optimista con
  // rollback si el PATCH falla. En /hoy, cambiar la fecha a otro día saca la
  // tarjeta de la vista (comidasVisibles se recomputa) — comportamiento
  // correcto: ya no es del día en turno.
  async function cambiarFecha(id: number, nuevaFecha: string, inputEl?: HTMLInputElement) {
    errorFecha = null;
    const anterior = comidas.find((c) => c.id === id)?.fecha;
    // Fecha vacía (p.ej. el botón "limpiar" del input nativo en desktop): no
    // hacemos PATCH (una comida siempre tiene fecha) y repintamos el input a la
    // fecha real — si no, quedaría en blanco desincronizado del modelo (el
    // binding es unidireccional y no vuelve a pintar un valor sin cambio).
    if (!nuevaFecha) {
      if (inputEl && anterior) inputEl.value = anterior;
      return;
    }
    comidas = comidas.map((c) => (c.id === id ? { ...c, fecha: nuevaFecha } : c));
    try {
      const res = await fetch(`${API_URL}/comidas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: nuevaFecha })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Rollback SOLO si la fila sigue en el valor que este llamado escribió;
      // si un cambio posterior ya la movió a otra fecha (guardada bien), no lo
      // pisamos con el rollback de un PATCH viejo y fallido.
      let revertido = false;
      comidas = comidas.map((c) => {
        if (c.id === id && c.fecha === nuevaFecha) {
          revertido = true;
          return { ...c, fecha: anterior ?? c.fecha };
        }
        return c;
      });
      if (revertido) errorFecha = 'No se pudo actualizar la fecha.';
    }
  }

  function totalKcal(c: Comida) {
    return c.consumos.reduce((acc, x) => acc + (x.kilocalorias ?? 0), 0);
  }

  function toggleExpand(id: number) {
    if (expandedId === id && !editandoConsumo) {
      expandedId = null;
    } else {
      expandedId = id;
    }
    editandoConsumo = null;
  }

  function editarViaIA(comidaId: number, x: Consumo) {
    // Empezar a editar cancela una confirmación de borrado pendiente.
    confirmandoEliminar = null;
    if (expandedId === comidaId && editandoConsumo?.id === x.id) {
      expandedId = null;
      editandoConsumo = null;
    } else {
      expandedId = comidaId;
      editandoConsumo = x;
    }
  }

  // Elimina un consumo (DELETE /consumos/{id}). Si era el último de su comida,
  // la comida queda vacía y desaparece del listado (igual que en el back).
  async function eliminarConsumo(comidaId: number, consumoId: number) {
    if (eliminandoId !== null) return;
    eliminandoId = consumoId;
    errorFecha = null;
    try {
      const res = await fetch(`${API_URL}/consumos/${consumoId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      comidas = comidas
        .map((c) =>
          c.id === comidaId
            ? { ...c, consumos: c.consumos.filter((x) => x.id !== consumoId) }
            : c
        )
        .filter((c) => c.consumos.length > 0);
      // Si el consumo borrado estaba abierto en edición, cerrar ese panel.
      if (editandoConsumo?.id === consumoId) {
        editandoConsumo = null;
        expandedId = null;
      }
      confirmandoEliminar = null;
    } catch {
      errorFecha = 'No se pudo eliminar el consumo.';
    } finally {
      eliminandoId = null;
    }
  }

  // Al guardar desde el chat embebido (agregar nuevo O reabrir uno existente):
  // si el id ya estaba en la lista, lo reemplaza (fue una edición); si no,
  // lo agrega. El conversation_id se conserva del original para poder
  // reabrirlo de nuevo después.
  function onConsumoGuardado(comidaId: number, resultado: Omit<Consumo, 'conversation_id'>) {
    comidas = comidas.map((c) => {
      if (c.id !== comidaId) return c;
      const existente = c.consumos.find((x) => x.id === resultado.id);
      const actualizado: Consumo = {
        ...resultado,
        conversation_id: existente?.conversation_id ?? editandoConsumo?.conversation_id ?? ''
      };
      const consumos = existente
        ? c.consumos.map((x) => (x.id === resultado.id ? actualizado : x))
        : [...c.consumos, actualizado];
      return { ...c, consumos };
    });
    expandedId = null;
    editandoConsumo = null;
  }

  $effect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/comidas`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        comidas = (await res.json()) as Comida[];
      } catch (e) {
        error =
          e instanceof TypeError
            ? `No se pudo conectar con la API en ${API_URL}.`
            : e instanceof Error
              ? e.message
              : String(e);
      } finally {
        cargando = false;
      }
    })();
  });
</script>

<section class="listado">
  <h1>{soloHoy ? 'Comidas de hoy' : 'Comidas guardadas'}</h1>

  {#if errorFecha}
    <div class="error">⚠️ {errorFecha}</div>
  {/if}

  {#if cargando}
    <p class="estado">Cargando…</p>
  {:else if error}
    <div class="error">⚠️ {error}</div>
  {:else if comidasVisibles.length === 0}
    <p class="estado">
      {#if soloHoy}
        Aún no has registrado comidas hoy. Crea una en <a href="/nutricion">Nutrición</a> y agrégale
        un consumo.
      {:else}
        Aún no hay comidas guardadas. Crea una en <a href="/nutricion">Nutrición</a> y agrégale un
        consumo.
      {/if}
    </p>
  {:else}
    <div class="cards">
      {#each comidasVisibles as c (c.id)}
        <div class="card">
          <div class="card-head">
            <div class="card-head-left">
              <span class="card-label">{TIPO_LABEL[c.tipo] ?? c.tipo}</span>
              <div class="fecha-picker">
                <svg
                  class="fecha-icon"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                <span class="fecha-larga">{formatoFecha(c.fecha)}</span>
                <!-- Input REAL transparente que cubre toda la píldora: un tap
                     directo abre el picker nativo (lo confiable en mobile).
                     showPicker() es solo refuerzo para desktop; si falla, el
                     tap igual funciona. -->
                <input
                  type="date"
                  class="fecha-input"
                  aria-label="Cambiar fecha de esta comida"
                  value={c.fecha}
                  onclick={(e) => {
                    try {
                      (e.currentTarget as HTMLInputElement).showPicker?.();
                    } catch {
                      /* mobile: el tap ya abrió el picker; showPicker puede lanzar */
                    }
                  }}
                  onchange={(e) =>
                    cambiarFecha(c.id, e.currentTarget.value, e.currentTarget as HTMLInputElement)}
                />
              </div>
            </div>
            <span class="total-kcal">{fmt(totalKcal(c))} kcal</span>
          </div>

          <div class="consumos">
            {#each c.consumos as x (x.id)}
              <div class="consumo">
                <div class="consumo-head">
                  {#if x.platillo}<span class="consumo-platillo">{x.platillo}</span>{/if}
                  <div class="consumo-acciones">
                    <button
                      type="button"
                      class="icon-btn"
                      onclick={() => editarViaIA(c.id, x)}
                      aria-label="Editar consumo con el asistente"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      onclick={() => (confirmandoEliminar = x.id)}
                      aria-label="Eliminar consumo"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="consumo-macros">
                  <span class="macro-mini kcal">{fmt(x.kilocalorias ?? 0)} kcal</span>
                  <span class="macro-mini">{fmt(x.proteinas ?? 0)} g prot</span>
                  <span class="macro-mini">{fmt(x.carbohidratos ?? 0)} g carb</span>
                  <span class="macro-mini">{fmt(x.grasas ?? 0)} g grasa</span>
                </div>

                {#if confirmandoEliminar === x.id}
                  <div class="confirmar-eliminar">
                    <span>¿Eliminar este consumo?</span>
                    <div class="confirmar-acciones">
                      <button
                        type="button"
                        class="cancelar-btn"
                        onclick={() => (confirmandoEliminar = null)}
                        disabled={eliminandoId !== null}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        class="eliminar-btn"
                        onclick={() => eliminarConsumo(c.id, x.id)}
                        disabled={eliminandoId !== null}
                      >
                        {eliminandoId === x.id ? 'Eliminando…' : 'Eliminar'}
                      </button>
                    </div>
                  </div>
                {/if}

                {#if editandoConsumo?.id === x.id && expandedId === c.id}
                  <div class="consumo-panel">
                    <ChatKilocalculator
                      comidaId={c.id}
                      mostrarTitulo={false}
                      preConversationId={x.conversation_id}
                      preResultado={x}
                      onGuardado={(r) => onConsumoGuardado(c.id, r)}
                    />
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <button type="button" class="toggle-hint" onclick={() => toggleExpand(c.id)}>
            {c.id === expandedId && !editandoConsumo ? '− Cerrar' : '+ Agregar consumo'}
          </button>

          {#if c.id === expandedId && !editandoConsumo}
            <div class="consumo-panel">
              <ChatKilocalculator
                comidaId={c.id}
                mostrarTitulo={false}
                onGuardado={(r) => onConsumoGuardado(c.id, r)}
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .listado {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    max-width: 640px;
    margin: 0 auto;
    color: rgba(15, 23, 42, 0.9);
  }

  h1 {
    margin: 0;
    font-size: 1.35rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .estado {
    margin: 0;
    color: rgba(15, 23, 42, 0.6);
    font-size: 0.95rem;
  }

  .estado a {
    color: #1e3a8a;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card {
    padding: 1.1rem 1.3rem;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
  }

  .card-head-left {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.45rem;
  }

  .card-label {
    font-weight: 700;
    font-size: 1.1rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .fecha-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.12);
    color: rgba(15, 23, 42, 0.75);
    width: fit-content;
    cursor: pointer;
  }

  .fecha-picker:hover {
    background: rgba(255, 255, 255, 0.85);
  }

  .fecha-icon {
    flex-shrink: 0;
  }

  .fecha-larga {
    font-size: 0.85rem;
    white-space: nowrap;
  }

  /* Input date REAL cubriendo toda la píldora, transparente pero tappable
     (opacity:0 NO desactiva el hit-testing): un tap abre el picker nativo,
     que es lo confiable en mobile. El texto largo legible va debajo. */
  .fecha-input {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    border: none;
    opacity: 0;
    cursor: pointer;
  }

  .total-kcal {
    font-weight: 700;
    font-size: 0.95rem;
    color: #1e3a8a;
    background: rgba(37, 99, 235, 0.14);
    border: 1px solid rgba(37, 99, 235, 0.35);
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    white-space: nowrap;
  }

  .consumos {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.8rem;
  }

  .consumo {
    padding: 0.6rem 0.8rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
  }

  .consumo-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.35rem;
  }

  .consumo-platillo {
    font-weight: 600;
    font-size: 0.9rem;
    color: rgba(15, 23, 42, 0.9);
  }

  .consumo-acciones {
    flex-shrink: 0;
    display: inline-flex;
    gap: 0.25rem;
  }

  .icon-btn {
    background: none;
    border: none;
    padding: 0.15rem;
    color: rgba(15, 23, 42, 0.4);
    cursor: pointer;
    display: inline-flex;
  }

  .icon-btn:hover {
    color: #1e3a8a;
  }

  .confirmar-eliminar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.6rem;
    padding: 0.5rem 0.7rem;
    border-radius: 8px;
    background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.25);
    font-size: 0.85rem;
    color: rgba(15, 23, 42, 0.8);
  }

  .confirmar-acciones {
    display: flex;
    gap: 0.5rem;
  }

  .cancelar-btn,
  .eliminar-btn {
    padding: 0.35rem 0.75rem;
    border-radius: 8px;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }

  .cancelar-btn {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(15, 23, 42, 0.15);
    color: rgba(15, 23, 42, 0.75);
  }

  .cancelar-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.9);
  }

  .eliminar-btn {
    background: rgba(220, 38, 38, 0.9);
    border: 1px solid rgba(220, 38, 38, 0.9);
    color: #fff;
  }

  .eliminar-btn:hover:not(:disabled) {
    background: #b91c1c;
  }

  .cancelar-btn:disabled,
  .eliminar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .consumo-macros {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .macro-mini {
    font-size: 0.78rem;
    font-weight: 600;
    color: rgba(15, 23, 42, 0.65);
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
  }

  .macro-mini.kcal {
    color: #1e3a8a;
    background: rgba(37, 99, 235, 0.14);
    border-color: rgba(37, 99, 235, 0.35);
  }

  .toggle-hint {
    display: block;
    margin-top: 0.9rem;
    padding: 0;
    background: none;
    border: none;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    color: #2563eb;
    cursor: pointer;
  }

  .toggle-hint:hover {
    text-decoration: underline;
  }

  .consumo-panel {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(15, 23, 42, 0.12);
  }

  .error {
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.35);
    color: #991b1b;
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    font-size: 0.88rem;
  }
</style>
