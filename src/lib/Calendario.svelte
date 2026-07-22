<script lang="ts">
  // Calendario mensual: marca con un punto los días que ya tienen comidas
  // guardadas (fetch propio y ligero de GET /comidas, solo para saber qué
  // fechas tienen datos) y deja elegir un día, cuya selección se reporta al
  // padre via onSeleccionar. El padre es quien le pasa esa fecha a
  // <ListadoComidas fechaFiltro> para mostrar las comidas de ese día.
  import { env } from '$env/dynamic/public';

  let {
    seleccionada,
    onSeleccionar
  }: {
    seleccionada: string;
    onSeleccionar: (fecha: string) => void;
  } = $props();

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  // "Hoy" en CDMX, misma zona con la que el back sella cada comida.
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const [hoyAnio, hoyMes] = hoyISO.split('-').map(Number);

  let anio = $state(hoyAnio);
  let mes = $state(hoyMes - 1); // 0-indexado

  let diasConDatos = $state<Set<string>>(new Set());
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
        const res = await fetch(`${API_URL}/comidas`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { fecha: string }[];
        diasConDatos = new Set(data.map((c) => c.fecha));
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
            {Number(fecha.slice(-2))}
            {#if diasConDatos.has(fecha)}<span class="punto"></span>{/if}
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
    padding: 1.1rem 1.3rem;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
  }

  .cal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cal-titulo {
    font-weight: 700;
    font-size: 1.05rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .cal-nav {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-radius: 8px;
    width: 2rem;
    height: 2rem;
    font-size: 1.1rem;
    line-height: 1;
    color: #1e3a8a;
    cursor: pointer;
  }

  .cal-nav:hover {
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(37, 99, 235, 0.4);
  }

  .cal-dias-semana {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
    font-size: 0.78rem;
    font-weight: 600;
    color: rgba(15, 23, 42, 0.5);
  }

  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.3rem;
  }

  .cal-grid.cargando {
    opacity: 0.6;
  }

  .cal-celda {
    position: relative;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid transparent;
    background: none;
    font: inherit;
    font-size: 0.88rem;
    color: rgba(15, 23, 42, 0.8);
    cursor: pointer;
  }

  .cal-celda.vacia {
    cursor: default;
  }

  button.cal-celda:hover {
    background: rgba(255, 255, 255, 0.7);
    border-color: rgba(15, 23, 42, 0.12);
  }

  .cal-celda.hoy {
    border-color: rgba(37, 99, 235, 0.4);
    font-weight: 700;
  }

  .cal-celda.seleccionada {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }

  .cal-celda.seleccionada:hover {
    background: #1e4fc4;
  }

  .punto {
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: #2563eb;
  }

  .cal-celda.seleccionada .punto {
    background: #fff;
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
