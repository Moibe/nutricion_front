<script lang="ts">
  // Listado de comidas guardadas: GET /comidas de nutricion_api regresa solo
  // las comidas con al menos un consumo, cada una con sus consumos anidados,
  // ordenadas por fecha (más reciente primero). El total por comida se suma
  // aquí en el cliente.
  import { env } from '$env/dynamic/public';
  import ChatKilocalculator from '$lib/ChatKilocalculator.svelte';

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  type Consumo = {
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

  let comidas = $state<Comida[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  // Solo una tarjeta expandida a la vez, igual que en /nutricion.
  let expandedId = $state<number | null>(null);

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
            {#each c.consumos as x, i (i)}
              <div class="consumo">
                {#if x.platillo}<span class="consumo-platillo">{x.platillo}</span>{/if}
                <div class="consumo-macros">
                  <span class="macro-mini kcal">{fmt(x.kilocalorias ?? 0)} kcal</span>
                  <span class="macro-mini">{fmt(x.proteinas ?? 0)} g prot</span>
                  <span class="macro-mini">{fmt(x.carbohidratos ?? 0)} g carb</span>
                  <span class="macro-mini">{fmt(x.grasas ?? 0)} g grasa</span>
                </div>
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

  .consumo-platillo {
    display: block;
    font-weight: 600;
    font-size: 0.9rem;
    color: rgba(15, 23, 42, 0.9);
    margin-bottom: 0.35rem;
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
