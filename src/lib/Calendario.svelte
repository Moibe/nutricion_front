<script lang="ts">
  // Calendario mensual: marca cada día con hasta 3 iconitos (comida,
  // ejercicio, peso — mismos glifos que el sidebar, para consistencia) según
  // qué se haya capturado ese día. Fetch propio y ligero a GET /comidas +
  // GET /metricas-ios, solo para saber qué fechas tienen qué. Deja elegir un
  // día, cuya selección se reporta al padre via onSeleccionar; el padre le
  // pasa esa fecha a <ListadoComidas fechaFiltro> para mostrar el detalle.
  import { env } from '$env/dynamic/public';

  let {
    seleccionada,
    onSeleccionar
  }: {
    seleccionada: string;
    onSeleccionar: (fecha: string) => void;
  } = $props();

  const API_URL = env.PUBLIC_API_URL ?? '/api';

  // "Hoy" en CDMX, misma zona con la que el back sella cada comida.
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const [hoyAnio, hoyMes] = hoyISO.split('-').map(Number);

  let anio = $state(hoyAnio);
  let mes = $state(hoyMes - 1); // 0-indexado

  let diasComida = $state<Set<string>>(new Set());
  let diasEjercicio = $state<Set<string>>(new Set());
  let diasPeso = $state<Set<string>>(new Set());
  let cargando = $state(true);
  let error = $state<string | null>(null);

  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const DIAS_SEMANA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  const pad = (n: number) => String(n).padStart(2, '0');

  // Celdas del mes en turno: null de relleno antes del día 1 (para alinear
  // con la columna del día de semana correcto) + una por cada día del mes.
  const celdas = $derived.by(() => {
    const inicioOffset = new Date(anio, mes, 1).getDay();
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
    const resultado: (string | null)[] = new Array(inicioOffset).fill(null);
    for (let d = 1; d <= diasEnMes; d++) {
      resultado.push(`${anio}-${pad(mes + 1)}-${pad(d)}`);
    }
    return resultado;
  });

  function mesAnterior() {
    if (mes === 0) {
      mes = 11;
      anio -= 1;
    } else {
      mes -= 1;
    }
  }

  function mesSiguiente() {
    if (mes === 11) {
      mes = 0;
      anio += 1;
    } else {
      mes += 1;
    }
  }

  $effect(() => {
    (async () => {
      try {
        const [resComidas, resMetricas, resEjercicios] = await Promise.all([
          fetch(`${API_URL}/comidas`),
          fetch(`${API_URL}/metricas-ios`),
          fetch(`${API_URL}/ejercicios`)
        ]);
        if (!resComidas.ok) throw new Error(`HTTP ${resComidas.status}`);
        const comidas = (await resComidas.json()) as { fecha: string }[];
        diasComida = new Set(comidas.map((c) => c.fecha));

        // Ejercicio: día tiene ícono si hay dato del Atajo de iOS (metricas)
        // O una entrada manual en la bitácora (ejercicios) — best-effort, si
        // alguno falla comida ya se mostró bien y simplemente no aparece ese
        // iconito.
        const diasEjercicioSet = new Set<string>();
        if (resMetricas.ok) {
          const metricas = (await resMetricas.json()) as { fecha: string; tipo: string }[];
          for (const m of metricas.filter((m) => m.tipo === 'calorias_quemadas')) {
            diasEjercicioSet.add(m.fecha);
          }
          diasPeso = new Set(metricas.filter((m) => m.tipo === 'peso').map((m) => m.fecha));
        }
        if (resEjercicios.ok) {
          const ejercicios = (await resEjercicios.json()) as { fecha: string }[];
          for (const e of ejercicios) diasEjercicioSet.add(e.fecha);
        }
        diasEjercicio = diasEjercicioSet;
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

<div class="calendario">
  <div class="cal-header">
    <button type="button" class="cal-nav" onclick={mesAnterior} aria-label="Mes anterior">‹</button>
    <span class="cal-titulo">{MESES[mes]} {anio}</span>
    <button type="button" class="cal-nav" onclick={mesSiguiente} aria-label="Mes siguiente">›</button>
  </div>

  {#if error}
    <div class="error">⚠️ {error}</div>
  {:else}
    <div class="cal-dias-semana" aria-hidden="true">
      {#each DIAS_SEMANA as d, i (i)}
        <span>{d}</span>
      {/each}
    </div>
    <div class="cal-grid" class:cargando>
      {#each celdas as fecha, i (i)}
        {#if fecha === null}
          <div class="cal-celda vacia"></div>
        {:else}
          <button
            type="button"
            class="cal-celda"
            class:hoy={fecha === hoyISO}
            class:seleccionada={fecha === seleccionada}
            onclick={() => onSeleccionar(fecha)}
            aria-current={fecha === seleccionada ? 'date' : undefined}
          >
            <span class="cal-numero">{Number(fecha.slice(-2))}</span>
            {#if diasComida.has(fecha) || diasEjercicio.has(fecha) || diasPeso.has(fecha)}
              <span class="cal-iconos">
                {#if diasComida.has(fecha)}
                  <svg
                    class="cal-ico comida"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                {/if}
                {#if diasEjercicio.has(fecha)}
                  <svg
                    class="cal-ico ejercicio"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 12h4l2-7 4 14 2-7h6" />
                  </svg>
                {/if}
                {#if diasPeso.has(fecha)}
                  <svg
                    class="cal-ico peso"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="17" rx="2" />
                    <circle cx="12" cy="13" r="4" />
                    <path d="M12 13l1.8-1.8" />
                  </svg>
                {/if}
              </span>
            {/if}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .calendario {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.2rem 1.4rem;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid var(--line);
  }

  .cal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cal-titulo {
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--ink);
  }

  .cal-nav {
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 8px;
    width: 2rem;
    height: 2rem;
    font-size: 1.1rem;
    line-height: 1;
    color: var(--ink);
    cursor: pointer;
  }

  .cal-nav:hover {
    background: var(--volt);
    border-color: var(--volt);
  }

  .cal-dias-semana {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.45rem;
  }

  .cal-grid.cargando {
    opacity: 0.6;
  }

  .cal-celda {
    position: relative;
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: none;
    font: inherit;
    color: var(--ink);
    cursor: pointer;
  }

  .cal-numero {
    font-size: 0.85rem;
  }

  .cal-iconos {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 9px;
  }

  .cal-ico {
    width: 9px;
    height: 9px;
    flex-shrink: 0;
  }

  .cal-ico.comida {
    color: #2563eb;
  }

  .cal-ico.ejercicio {
    color: #ea580c;
  }

  .cal-ico.peso {
    color: #7c3aed;
  }

  .cal-celda.seleccionada .cal-ico {
    color: #fff;
  }

  .cal-celda.vacia {
    cursor: default;
  }

  button.cal-celda:hover {
    background: rgba(15, 15, 15, 0.05);
    border-color: var(--line);
  }

  .cal-celda.hoy {
    border-color: var(--ink);
    font-weight: 700;
  }

  /* Mismo negro sólido que la selección activa del sidebar — un solo
     lenguaje de "esto está elegido" en toda la app. */
  .cal-celda.seleccionada {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }

  .cal-celda.seleccionada:hover {
    background: #2a2a2a;
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
