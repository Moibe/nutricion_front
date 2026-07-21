<script lang="ts">
  // Listado de comidas guardadas: GET /comidas de nutricion_api regresa solo
  // las comidas con al menos un consumo, cada una con sus consumos anidados,
  // ordenadas por fecha (más reciente primero). El total por comida se suma
  // aquí en el cliente.
  import { env } from '$env/dynamic/public';
  import ChatKilocalculator from '$lib/ChatKilocalculator.svelte';

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  type Consumo = {
    id: number;
    platillo: string | null;
    kilocalorias: number | null;
    proteinas: number | null;
    carbohidratos: number | null;
    grasas: number | null;
  };
  type Comida = { id: number; tipo: string; fecha: string; created_at: string; consumos: Consumo[] };
  type EditForm = {
    platillo: string;
    kilocalorias: number;
    proteinas: number;
    carbohidratos: number;
    grasas: number;
  };

  // El back solo distingue 4 tipos (las dos colaciones comparten "colacion").
  const TIPO_LABEL: Record<string, string> = {
    desayuno: 'Desayuno',
    colacion: 'Colación',
    comida: 'Comida',
    cena: 'Cena'
  };

  let comidas = $state<Comida[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  // Solo una tarjeta expandida a la vez, igual que en /nutricion.
  let expandedId = $state<number | null>(null);

  // Edición inline de un consumo ya guardado (id del consumo, no de la comida).
  let editingId = $state<number | null>(null);
  let editForm = $state<EditForm>({
    platillo: '',
    kilocalorias: 0,
    proteinas: 0,
    carbohidratos: 0,
    grasas: 0
  });
  let guardandoEdicion = $state(false);
  let errorEdicion = $state<string | null>(null);

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  function formatoFecha(fecha: string) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function totalKcal(c: Comida) {
    return c.consumos.reduce((acc, x) => acc + (x.kilocalorias ?? 0), 0);
  }

  function toggleExpand(id: number) {
    expandedId = expandedId === id ? null : id;
  }

  // Al guardar un consumo desde el chat embebido: se agrega a la tarjeta y
  // se cierra el diálogo (mismo patrón que /nutricion).
  function onConsumoGuardado(comidaId: number, resultado: Consumo) {
    comidas = comidas.map((c) =>
      c.id === comidaId ? { ...c, consumos: [...c.consumos, resultado] } : c
    );
    expandedId = null;
  }

  function iniciarEdicion(x: Consumo) {
    editingId = x.id;
    editForm = {
      platillo: x.platillo ?? '',
      kilocalorias: x.kilocalorias ?? 0,
      proteinas: x.proteinas ?? 0,
      carbohidratos: x.carbohidratos ?? 0,
      grasas: x.grasas ?? 0
    };
    errorEdicion = null;
  }

  function cancelarEdicion() {
    editingId = null;
    errorEdicion = null;
  }

  async function guardarEdicion(comidaId: number, consumoId: number) {
    if (guardandoEdicion) return;
    guardandoEdicion = true;
    errorEdicion = null;
    try {
      const res = await fetch(`${API_URL}/consumos/${consumoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platillo: editForm.platillo.trim() || null,
          kilocalorias: editForm.kilocalorias,
          proteinas: editForm.proteinas,
          carbohidratos: editForm.carbohidratos,
          grasas: editForm.grasas
        })
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
        } catch {
          /* sin cuerpo JSON */
        }
        throw new Error(detail);
      }
      const actualizado = (await res.json()) as Consumo;
      comidas = comidas.map((c) =>
        c.id === comidaId
          ? { ...c, consumos: c.consumos.map((x) => (x.id === consumoId ? actualizado : x)) }
          : c
      );
      editingId = null;
    } catch (e) {
      errorEdicion =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      guardandoEdicion = false;
    }
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
  <h1>Comidas guardadas</h1>

  {#if cargando}
    <p class="estado">Cargando…</p>
  {:else if error}
    <div class="error">⚠️ {error}</div>
  {:else if comidas.length === 0}
    <p class="estado">
      Aún no hay comidas guardadas. Crea una en <a href="/nutricion">Nutrición</a> y agrégale un
      consumo.
    </p>
  {:else}
    <div class="cards">
      {#each comidas as c (c.id)}
        <div class="card">
          <div class="card-head">
            <div>
              <span class="card-label">{TIPO_LABEL[c.tipo] ?? c.tipo}</span>
              <span class="card-fecha">{formatoFecha(c.fecha)}</span>
            </div>
            <span class="total-kcal">{fmt(totalKcal(c))} kcal</span>
          </div>

          <div class="consumos">
            {#each c.consumos as x (x.id)}
              <div class="consumo">
                {#if editingId === x.id}
                  <div class="consumo-edit">
                    <input
                      type="text"
                      class="edit-platillo"
                      bind:value={editForm.platillo}
                      placeholder="Platillo"
                    />
                    <div class="edit-macros">
                      <label>
                        kcal
                        <input type="number" step="0.1" bind:value={editForm.kilocalorias} />
                      </label>
                      <label>
                        prot (g)
                        <input type="number" step="0.1" bind:value={editForm.proteinas} />
                      </label>
                      <label>
                        carb (g)
                        <input type="number" step="0.1" bind:value={editForm.carbohidratos} />
                      </label>
                      <label>
                        grasa (g)
                        <input type="number" step="0.1" bind:value={editForm.grasas} />
                      </label>
                    </div>
                    {#if errorEdicion}<div class="error">⚠️ {errorEdicion}</div>{/if}
                    <div class="edit-actions">
                      <button
                        type="button"
                        class="cancel-btn"
                        onclick={cancelarEdicion}
                        disabled={guardandoEdicion}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        class="save-btn"
                        onclick={() => guardarEdicion(c.id, x.id)}
                        disabled={guardandoEdicion}
                      >
                        {guardandoEdicion ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="consumo-head">
                    {#if x.platillo}<span class="consumo-platillo">{x.platillo}</span>{/if}
                    <button
                      type="button"
                      class="edit-btn"
                      onclick={() => iniciarEdicion(x)}
                      aria-label="Editar consumo"
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
                  </div>
                  <div class="consumo-macros">
                    <span class="macro-mini kcal">{fmt(x.kilocalorias ?? 0)} kcal</span>
                    <span class="macro-mini">{fmt(x.proteinas ?? 0)} g prot</span>
                    <span class="macro-mini">{fmt(x.carbohidratos ?? 0)} g carb</span>
                    <span class="macro-mini">{fmt(x.grasas ?? 0)} g grasa</span>
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <button type="button" class="toggle-hint" onclick={() => toggleExpand(c.id)}>
            {c.id === expandedId ? '− Cerrar' : '+ Agregar consumo'}
          </button>

          {#if c.id === expandedId}
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
    align-items: baseline;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
  }

  .card-label {
    font-weight: 700;
    font-size: 1.1rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .card-fecha {
    margin-left: 0.6rem;
    font-size: 0.85rem;
    color: rgba(15, 23, 42, 0.6);
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

  .edit-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0.15rem;
    color: rgba(15, 23, 42, 0.4);
    cursor: pointer;
    display: inline-flex;
  }

  .edit-btn:hover {
    color: #1e3a8a;
  }

  .consumo-macros {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .consumo-edit {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .edit-platillo {
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    border: 1px solid rgba(15, 23, 42, 0.15);
    background: rgba(255, 255, 255, 0.7);
    font: inherit;
    font-size: 0.9rem;
    color: rgba(15, 23, 42, 0.9);
  }

  .edit-platillo:focus {
    outline: none;
    border-color: rgba(37, 99, 235, 0.55);
  }

  .edit-macros {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .edit-macros label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.72rem;
    color: rgba(15, 23, 42, 0.6);
  }

  .edit-macros input {
    width: 5.5rem;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    border: 1px solid rgba(15, 23, 42, 0.15);
    background: rgba(255, 255, 255, 0.7);
    font: inherit;
    font-size: 0.85rem;
    color: rgba(15, 23, 42, 0.9);
  }

  .edit-macros input:focus {
    outline: none;
    border-color: rgba(37, 99, 235, 0.55);
  }

  .edit-actions {
    display: flex;
    gap: 0.5rem;
  }

  .cancel-btn,
  .save-btn {
    padding: 0.4rem 0.85rem;
    border-radius: 8px;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .cancel-btn {
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(15, 23, 42, 0.12);
    color: rgba(15, 23, 42, 0.75);
  }

  .cancel-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.8);
  }

  .save-btn {
    background: rgba(37, 99, 235, 0.12);
    border: 1px solid rgba(37, 99, 235, 0.4);
    color: #1e3a8a;
  }

  .save-btn:hover:not(:disabled) {
    background: rgba(37, 99, 235, 0.2);
  }

  .cancel-btn:disabled,
  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
