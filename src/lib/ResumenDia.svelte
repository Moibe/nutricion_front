<script lang="ts">
  // Resumen compacto de UN día: 3 filas (Comida/Ejercicio/Peso) marcando qué
  // ya se capturó (ícono a color + palomita) y qué falta (ícono apagado).
  // Reemplaza el detalle completo que antes se mostraba embebido en
  // /calendario (ListadoComidas con fechaFiltro): ahora cada fila es un link
  // que manda a la página donde se llena eso — /hoy, /ejercicio, /peso, cada
  // una con ?fecha= para poder editar un día pasado — en vez de editar
  // inline aquí.
  import { env } from '$env/dynamic/public';

  let { fecha }: { fecha: string } = $props();

  const API_URL = env.PUBLIC_API_URL ?? '/api';

  type Consumo = { kilocalorias: number | null };
  type Comida = { fecha: string; consumos: Consumo[] };
  type MetricaIos = { fecha: string; tipo: string; valor: number };
  type EjercicioEntrada = { fecha: string; kilocalorias: number };

  let cargando = $state(true);
  let error = $state<string | null>(null);
  let kcalComidas = $state<number | null>(null);
  let numComidas = $state(0);
  let kcalEjercicio = $state<number | null>(null);
  let peso = $state<number | null>(null);

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  function formatoFechaLarga(f: string): string {
    const [y, m, d] = f.split('-').map(Number);
    const raw = new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  $effect(() => {
    const f = fecha;
    cargando = true;
    error = null;
    (async () => {
      try {
        const [resComidas, resMetricas, resEjercicios] = await Promise.all([
          fetch(`${API_URL}/comidas`),
          fetch(`${API_URL}/metricas-ios`),
          fetch(`${API_URL}/ejercicios`)
        ]);
        if (!resComidas.ok) throw new Error(`HTTP ${resComidas.status}`);
        const comidas = (await resComidas.json()) as Comida[];
        const delDia = comidas.filter((c) => c.fecha === f);
        numComidas = delDia.length;
        kcalComidas = delDia.length
          ? delDia.reduce((acc, c) => acc + c.consumos.reduce((a, x) => a + (x.kilocalorias ?? 0), 0), 0)
          : null;

        // "kcal quemadas" = Atajo de iOS (metricas-ios) + bitácora manual
        // (ejercicios) — best-effort: si algún fetch falla, comida ya se
        // mostró bien y simplemente ejercicio/peso quedan como "sin capturar".
        let quemadasAtajo: number | null = null;
        if (resMetricas.ok) {
          const metricas = (await resMetricas.json()) as MetricaIos[];
          const eje = metricas.find((m) => m.fecha === f && m.tipo === 'calorias_quemadas');
          const pes = metricas.find((m) => m.fecha === f && m.tipo === 'peso');
          quemadasAtajo = eje ? eje.valor : null;
          peso = pes ? pes.valor : null;
        } else {
          peso = null;
        }

        let quemadasManual: number | null = null;
        if (resEjercicios.ok) {
          const ejercicios = (await resEjercicios.json()) as EjercicioEntrada[];
          const delDiaEje = ejercicios.filter((e) => e.fecha === f);
          quemadasManual = delDiaEje.length
            ? delDiaEje.reduce((acc, e) => acc + e.kilocalorias, 0)
            : null;
        }

        kcalEjercicio =
          quemadasAtajo === null && quemadasManual === null
            ? null
            : (quemadasAtajo ?? 0) + (quemadasManual ?? 0);
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

{#snippet check()}
  <span class="check" aria-hidden="true">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  </span>
{/snippet}

<section class="resumen-dia">
  <h1>Resumen del {formatoFechaLarga(fecha)}</h1>

  {#if error}
    <div class="error">⚠️ {error}</div>
  {:else if cargando}
    <p class="estado">Cargando…</p>
  {:else}
    <div class="filas">
      <a class="fila" href="/peso?fecha={fecha}">
        <span class="ico-wrap" class:vacio={peso === null}>
          <svg class="ico peso" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <circle cx="12" cy="13" r="4" />
            <path d="M12 13l1.8-1.8" />
          </svg>
          {#if peso !== null}{@render check()}{/if}
        </span>
        <span class="fila-texto">
          <span class="fila-label">Peso</span>
          <span class="fila-valor">{peso !== null ? `${fmt(peso)} kg` : 'Sin capturar'}</span>
        </span>
        <span class="fila-flecha" aria-hidden="true">›</span>
      </a>

      <a class="fila" href="/hoy?fecha={fecha}">
        <span class="ico-wrap" class:vacio={kcalComidas === null}>
          <svg class="ico comida" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          {#if kcalComidas !== null}{@render check()}{/if}
        </span>
        <span class="fila-texto">
          <span class="fila-label">Comida</span>
          <span class="fila-valor">
            {kcalComidas !== null
              ? `${fmt(kcalComidas)} kcal · ${numComidas} ${numComidas === 1 ? 'comida' : 'comidas'}`
              : 'Sin capturar'}
          </span>
        </span>
        <span class="fila-flecha" aria-hidden="true">›</span>
      </a>

      <a class="fila" href="/ejercicio?fecha={fecha}">
        <span class="ico-wrap" class:vacio={kcalEjercicio === null}>
          <svg class="ico ejercicio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12h4l2-7 4 14 2-7h6" />
          </svg>
          {#if kcalEjercicio !== null}{@render check()}{/if}
        </span>
        <span class="fila-texto">
          <span class="fila-label">Ejercicio</span>
          <span class="fila-valor">
            {kcalEjercicio !== null ? `${fmt(kcalEjercicio)} kcal quemadas` : 'Sin capturar'}
          </span>
        </span>
        <span class="fila-flecha" aria-hidden="true">›</span>
      </a>
    </div>
  {/if}
</section>

<style>
  .resumen-dia {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: var(--ink);
  }

  .estado {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.95rem;
  }

  .filas {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .fila {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 1rem 1.2rem;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid var(--line);
    text-decoration: none;
    color: var(--ink);
    transition: border-color 0.18s ease, background 0.18s ease;
  }

  .fila:hover {
    background: var(--volt);
    border-color: var(--volt);
  }

  .ico-wrap {
    position: relative;
    flex-shrink: 0;
    display: inline-flex;
  }

  .ico {
    width: 26px;
    height: 26px;
  }

  .ico.comida {
    color: #2563eb;
  }

  .ico.ejercicio {
    color: #ea580c;
  }

  .ico.peso {
    color: #7c3aed;
  }

  /* Sin capturar: ícono apagado a gris, para que salte a la vista cuál falta. */
  .ico-wrap.vacio .ico {
    color: rgba(15, 15, 15, 0.25);
  }

  .check {
    position: absolute;
    bottom: -3px;
    right: -3px;
    width: 15px;
    height: 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: #16a34a;
    border: 2px solid #ffffff;
  }

  .fila-texto {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .fila-label {
    font-weight: 700;
    font-size: 0.95rem;
  }

  .fila-valor {
    font-size: 0.85rem;
    color: var(--ink-soft);
  }

  .fila:hover .fila-valor {
    color: var(--ink);
  }

  .fila-flecha {
    margin-left: auto;
    font-size: 1.3rem;
    color: var(--ink-soft);
    flex-shrink: 0;
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
