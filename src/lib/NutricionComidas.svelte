<script lang="ts">
  import { env } from '$env/dynamic/public';
  import ChatKilocalculator from '$lib/ChatKilocalculator.svelte';

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  // "Colación 1"/"Colación 2" son dos botones distintos en la UI, pero el
  // schema del back solo distingue 4 tipos (no hay colacion_1/colacion_2) —
  // ambos crean una comida tipo "colacion"; el label completo se guarda solo
  // del lado del cliente para diferenciarlas en pantalla. El índice en este
  // array SÍ se manda al back como `orden`, para poder ordenar el listado
  // en la secuencia real del día (Colación 1 antes de Comida, Colación 2
  // después) aunque ambas compartan tipo.
  const TIPOS = [
    { label: 'Desayuno', tipo: 'desayuno' },
    { label: 'Colación 1', tipo: 'colacion' },
    { label: 'Comida', tipo: 'comida' },
    { label: 'Colación 2', tipo: 'colacion' },
    { label: 'Cena', tipo: 'cena' }
  ] as const;

  type ResultadoGuardado = {
    platillo: string | null;
    kilocalorias: number;
    proteinas: number;
    carbohidratos: number;
    grasas: number;
  };
  type Comida = {
    id: number;
    tipo: string;
    fecha: string;
    created_at: string;
    label: string;
    resultados: ResultadoGuardado[];
  };

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  // Fecha de hoy en CDMX (misma zona con la que el back sella las comidas),
  // capitalizada: "Martes, 21 de julio de 2026".
  const hoyRaw = new Date().toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const hoy = hoyRaw.charAt(0).toUpperCase() + hoyRaw.slice(1);

  // Fecha en formato largo legible ("lunes, 20 de julio de 2026"). El input
  // date nativo solo muestra dd/mm/yyyy, así que este texto va encima y el
  // input queda transparente pero tappable debajo (ver .fecha-input en CSS).
  function formatoFecha(fecha: string) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  let comidas = $state<Comida[]>([]);
  // Solo una tarjeta expandida a la vez — al abrir una se cierra la anterior.
  let expandedId = $state<number | null>(null);
  let creando = $state<string | null>(null);
  let error = $state<string | null>(null);

  async function crearComida(label: string, tipo: string, orden: number) {
    if (creando) return;
    creando = label;
    error = null;
    try {
      const res = await fetch(`${API_URL}/comidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, orden })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const nueva: Comida = { ...data, label, resultados: [] };
      comidas = [...comidas, nueva];
    } catch (e) {
      error =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      creando = null;
    }
  }

  async function cambiarFecha(id: number, nuevaFecha: string, inputEl?: HTMLInputElement) {
    const anterior = comidas.find((c) => c.id === id)?.fecha;
    // Fecha vacía (botón "limpiar" del input nativo): no PATCH y repinta el
    // input a la fecha real para no dejarlo en blanco desincronizado.
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
      comidas = comidas.map((c) => (c.id === id ? { ...c, fecha: anterior ?? c.fecha } : c));
      error = 'No se pudo actualizar la fecha.';
    }
  }

  function toggleExpand(id: number) {
    expandedId = expandedId === id ? null : id;
  }

  // Al guardar un consumo desde el chat embebido: se agrega al resumen de la
  // tarjeta y se cierra el diálogo, dejando solo el cuadro de resultado.
  function onConsumoGuardado(comidaId: number, resultado: ResultadoGuardado) {
    comidas = comidas.map((c) =>
      c.id === comidaId ? { ...c, resultados: [...c.resultados, resultado] } : c
    );
    expandedId = null;
  }


</script>

<section class="comidas">
  <p class="hoy">Hoy es: <strong>{hoy}</strong></p>

  <div class="botones">
    {#each TIPOS as t, i (t.label)}
      <button
        type="button"
        class="tipo-btn"
        onclick={() => crearComida(t.label, t.tipo, i)}
        disabled={creando !== null}
      >
        {creando === t.label ? '…' : t.label}
      </button>
    {/each}
  </div>

  {#if error}
    <div class="error">⚠️ {error}</div>
  {/if}

  {#if comidas.length > 0}
    <div class="cards">
      {#each comidas as c (c.id)}
        <div class="card" class:active={c.id === expandedId}>
          <div class="card-header">
            <span class="card-label">{c.label}</span>
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
              <!-- Input transparente que cubre toda la píldora: un tap abre el
                   picker nativo (confiable en mobile); showPicker es refuerzo
                   para desktop. -->
              <input
                type="date"
                class="fecha-input"
                aria-label="Elegir fecha de {c.label}"
                value={c.fecha}
                onclick={(e) => {
                  try {
                    (e.currentTarget as HTMLInputElement).showPicker?.();
                  } catch {
                    /* mobile: el tap ya abrió el picker */
                  }
                }}
                onchange={(e) =>
                  cambiarFecha(c.id, e.currentTarget.value, e.currentTarget as HTMLInputElement)}
              />
            </div>
          </div>

          {#if c.resultados.length > 0}
            <div class="resultados">
              {#each c.resultados as r, i (i)}
                <div class="resultado-item">
                  {#if r.platillo}<span class="resultado-platillo">{r.platillo}</span>{/if}
                  <div class="resultado-macros">
                    <span class="macro-mini kcal">{fmt(r.kilocalorias)} kcal</span>
                    <span class="macro-mini">{fmt(r.proteinas)} g prot</span>
                    <span class="macro-mini">{fmt(r.carbohidratos)} g carb</span>
                    <span class="macro-mini">{fmt(r.grasas)} g grasa</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

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
  .comidas {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    color: rgba(15, 23, 42, 0.9);
  }

  .hoy {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(15, 23, 42, 0.65);
  }

  .hoy strong {
    color: rgba(15, 23, 42, 0.9);
  }

  .botones {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .tipo-btn {
    flex: 1;
    min-width: 110px;
    padding: 0.8rem 1rem;
    border-radius: 10px;
    border: 1px solid rgba(37, 99, 235, 0.35);
    background: rgba(255, 255, 255, 0.55);
    color: #1e3a8a;
    font: inherit;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition:
      background 0.18s ease,
      border-color 0.18s ease;
  }

  .tipo-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.8);
    border-color: rgba(37, 99, 235, 0.55);
  }

  .tipo-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .cards {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .card {
    width: 100%;
    max-width: 600px;
    padding: 1.4rem 1.6rem;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
    transition:
      background 0.18s ease,
      border-color 0.18s ease;
  }

  .card.active {
    background: rgba(37, 99, 235, 0.14);
    border-color: rgba(37, 99, 235, 0.4);
  }

  .card-header {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .card-label {
    font-weight: 700;
    font-size: 1.2rem;
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
     (opacity:0 NO desactiva el hit-testing): un tap abre el picker nativo, lo
     confiable en mobile. El texto largo legible va debajo. */
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

  .resultados {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.9rem;
    cursor: default;
  }

  .resultado-item {
    padding: 0.6rem 0.8rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
  }

  .resultado-platillo {
    display: block;
    font-weight: 600;
    font-size: 0.9rem;
    color: rgba(15, 23, 42, 0.9);
    margin-bottom: 0.35rem;
  }

  .resultado-macros {
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
    cursor: default;
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
