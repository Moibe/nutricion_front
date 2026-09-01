<script lang="ts">
  // Un renglón por día: peso, kcal basales (Mifflin-St Jeor con el peso DE
  // ESE día + el perfil), kcal de comidas, kcal de ejercicio, y el total =
  // consumidas - (basales + ejercitadas) — superávit si es positivo, déficit
  // si es negativo. Junta datos de /comidas + /metricas-ios + /perfil, todo
  // client-side (mismo patrón que el resto de la app).
  import { env } from '$env/dynamic/public';

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  // Misma zona horaria que usa el resto de la app para "hoy" (CDMX), para
  // marcar el renglón de hoy con las flechitas animadas.
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const [hoyAnio, hoyMesNum] = hoyISO.split('-').map(Number);

  // Paginado por mes (mismo patrón que /calendario): sin esto, cada carga
  // traía TODO el historial de comidas/métricas para armar una tabla que solo
  // crece. anio/mes acotan qué mes se pide al back vía ?desde=&hasta=.
  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  let anio = $state(hoyAnio);
  let mes = $state(hoyMesNum - 1); // 0-indexado, igual que Calendario.svelte

  const pad = (n: number) => String(n).padStart(2, '0');
  const desde = $derived(`${anio}-${pad(mes + 1)}-01`);
  const hasta = $derived.by(() => {
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    return `${anio}-${pad(mes + 1)}-${pad(ultimoDia)}`;
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

  type Consumo = { kilocalorias: number | null };
  type Comida = { fecha: string; consumos: Consumo[] };
  type MetricaIos = { fecha: string; tipo: string; valor: number };
  type EjercicioEntrada = { fecha: string; kilocalorias: number };
  type Perfil = { fecha_nacimiento: string; estatura_cm: number; sexo: 'hombre' | 'mujer' };

  let cargando = $state(true);
  let error = $state<string | null>(null);
  let comidasRaw = $state<Comida[]>([]);
  let metricasRaw = $state<MetricaIos[]>([]);
  let ejerciciosRaw = $state<EjercicioEntrada[]>([]);
  let perfil = $state<Perfil | null>(null);

  // Posición vertical (px, relativa a .tabla-wrap) de la fila de hoy, para
  // flotar las flechas AFUERA de .tabla-scroll (que sí necesita su propio
  // overflow-x:auto para pantallas angostas) sobre el fondo de la página en
  // vez de sobre el blanco de la tabla. Medido en vez de calculado a mano
  // porque el alto real de una fila depende de fuente/renderizado del
  // navegador. null mientras no hay fila de hoy que señalar.
  let tablaWrapEl = $state<HTMLDivElement | null>(null);
  let flechaTop = $state<number | null>(null);

  $effect(() => {
    filas;
    if (!tablaWrapEl) return;
    const filaHoy = tablaWrapEl.querySelector<HTMLTableRowElement>('tr.hoy');
    if (!filaHoy) {
      flechaTop = null;
      return;
    }
    const filaRect = filaHoy.getBoundingClientRect();
    const wrapRect = tablaWrapEl.getBoundingClientRect();
    flechaTop = filaRect.top - wrapRect.top + filaRect.height / 2;
  });

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  // Corta (no el formato largo con día de semana): en una tabla, cada
  // renglón ya deja claro que es un día — no hace falta repetirlo.
  function formatoFecha(fecha: string) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  // Mobile: la columna de fecha compite con cinco columnas de kcal, así que
  // se recorta a d/m. No se pierde información — el mes y el año ya los da
  // el header de arriba, y la tabla nunca mezcla meses (está paginada por
  // mes), así que el día basta para identificar el renglón.
  function formatoFechaCorto(fecha: string) {
    const [, m, d] = fecha.split('-').map(Number);
    return `${d}/${m}`;
  }

  // Edad AL DÍA de esa fila (no la de hoy) — un día de hace tiempo debe usar
  // la edad que tenías entonces, aunque sea prácticamente siempre la misma.
  function calcularEdad(fechaNacimiento: string, enFecha: string): number {
    const [an, mn, dn] = fechaNacimiento.split('-').map(Number);
    const [af, mf, df] = enFecha.split('-').map(Number);
    let edad = af - an;
    if (mf < mn || (mf === mn && df < dn)) edad--;
    return edad;
  }

  // Derivado (no calculado inline en el fetch) para que se recalcule solo si
  // perfil llega DESPUÉS de comidas/métricas — perfil se carga en un efecto
  // aparte (no depende del mes), así que su orden de llegada no está
  // garantizado respecto al de comidas/métricas.
  const filas = $derived.by(() => {
    const kcalComidasPorDia = new Map<string, number>();
    for (const c of comidasRaw) {
      const totalComida = c.consumos.reduce((acc, x) => acc + (x.kilocalorias ?? 0), 0);
      kcalComidasPorDia.set(c.fecha, (kcalComidasPorDia.get(c.fecha) ?? 0) + totalComida);
    }

    const pesoPorDia = new Map<string, number>();
    // "kcal ejercitadas" = Atajo de iOS (metricas-ios) + bitácora manual
    // (ejercicios) sumadas por día.
    const ejercicioPorDia = new Map<string, number>();
    for (const m of metricasRaw) {
      if (m.tipo === 'peso') pesoPorDia.set(m.fecha, m.valor);
      if (m.tipo === 'calorias_quemadas') {
        ejercicioPorDia.set(m.fecha, (ejercicioPorDia.get(m.fecha) ?? 0) + m.valor);
      }
    }
    for (const e of ejerciciosRaw) {
      ejercicioPorDia.set(e.fecha, (ejercicioPorDia.get(e.fecha) ?? 0) + e.kilocalorias);
    }

    const todasLasFechas = new Set([
      ...kcalComidasPorDia.keys(),
      ...pesoPorDia.keys(),
      ...ejercicioPorDia.keys()
    ]);

    // Hoy SIEMPRE aparece cuando el mes en pantalla es el actual, aunque
    // todavía no tenga ningún dato capturado — si no, la fila (y las
    // flechitas que la señalan) simplemente no existen hasta que captures
    // algo, y "hoy" se vuelve invisible en la tabla apenas cambia el día.
    if (hoyISO >= desde && hoyISO <= hasta) {
      todasLasFechas.add(hoyISO);
    }

    return [...todasLasFechas]
      .sort((a, b) => b.localeCompare(a))
      .map((fecha) => {
        const peso = pesoPorDia.get(fecha) ?? null;
        const kcalComidas = kcalComidasPorDia.get(fecha) ?? 0;
        const kcalEjercicio = ejercicioPorDia.get(fecha) ?? 0;

        let kcalBasal: number | null = null;
        if (peso !== null && perfil) {
          const edad = calcularEdad(perfil.fecha_nacimiento, fecha);
          const base = 10 * peso + 6.25 * perfil.estatura_cm - 5 * edad;
          kcalBasal = perfil.sexo === 'hombre' ? base + 5 : base - 161;
        }

        const total = kcalBasal !== null ? kcalComidas - (kcalBasal + kcalEjercicio) : null;

        return { fecha, peso, kcalBasal, kcalComidas, kcalEjercicio, total };
      });
  });

  // Perfil es un singleton (no depende del mes en pantalla) — se carga una
  // sola vez, aparte del efecto que sí se repite cada vez que cambias de mes.
  $effect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/perfil`);
        perfil = res.ok ? ((await res.json()) as Perfil | null) : null;
      } catch {
        // Best-effort: si falla, el aviso de "completa tu perfil" ya cubre
        // el caso de basal/total no disponibles.
      }
    })();
  });

  $effect(() => {
    // Leídos SÍNCRONO (antes del IIFE) para que el effect quede suscrito a
    // desde/hasta y vuelva a correr al navegar de mes.
    const d = desde;
    const h = hasta;
    cargando = true;
    error = null;
    (async () => {
      try {
        const [resComidas, resMetricas, resEjercicios] = await Promise.all([
          fetch(`${API_URL}/comidas?desde=${d}&hasta=${h}`),
          fetch(`${API_URL}/metricas-ios?desde=${d}&hasta=${h}`),
          fetch(`${API_URL}/ejercicios?desde=${d}&hasta=${h}`)
        ]);
        if (!resComidas.ok) throw new Error(`HTTP ${resComidas.status}`);
        if (!resMetricas.ok) throw new Error(`HTTP ${resMetricas.status}`);
        if (!resEjercicios.ok) throw new Error(`HTTP ${resEjercicios.status}`);

        comidasRaw = (await resComidas.json()) as Comida[];
        metricasRaw = (await resMetricas.json()) as MetricaIos[];
        ejerciciosRaw = (await resEjercicios.json()) as EjercicioEntrada[];
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

<section class="registro-page">
  <h1>Registro Diario</h1>
  <p class="sub">Consumidas − (basales + ejercitadas) = superávit o déficit del día.</p>

  <div class="mes-header">
    <button type="button" class="mes-nav" onclick={mesAnterior} aria-label="Mes anterior">‹</button>
    <span class="mes-titulo">{MESES[mes]} {anio}</span>
    <button type="button" class="mes-nav" onclick={mesSiguiente} aria-label="Mes siguiente">›</button>
  </div>

  {#if error}
    <div class="error">⚠️ {error}</div>
  {/if}

  {#if !cargando && !error && !perfil}
    <div class="aviso">
      Completa tu perfil en <a href="/peso">Peso Hoy</a> para ver las calorías basales y el total —
      sin eso solo se pueden mostrar comidas y ejercicio.
    </div>
  {/if}

  {#if cargando}
    <p class="estado">Cargando…</p>
  {:else if filas.length === 0}
    <p class="estado">Aún no hay datos guardados este mes.</p>
  {:else}
    <div class="tabla-wrap" bind:this={tablaWrapEl}>
      {#if flechaTop !== null}
        <span class="hoy-flecha hoy-flecha-in" style="top: {flechaTop}px" aria-hidden="true">»</span>
        <span class="hoy-flecha hoy-flecha-out" style="top: {flechaTop}px" aria-hidden="true">«</span>
      {/if}
      <div class="tabla-scroll">
        <table class="tabla-registro">
          <thead>
            <tr>
              <th class="col-fecha"><span class="completo">Fecha</span><span class="compacto">Día</span></th>
              <th class="col-peso"><span class="completo">Peso (kg)</span><span class="compacto">Peso</span></th>
              <th class="col-basal"><span class="completo">Basal (kcal)</span><span class="compacto">Basal</span></th>
              <th class="col-comidas"><span class="completo">Comidas (kcal)</span><span class="compacto">Comida</span></th>
              <th class="col-ejercicio"><span class="completo">Ejercicio (kcal)</span><span class="compacto">Ejerc.</span></th>
              <th class="col-total"><span class="completo">Total (kcal)</span><span class="compacto">Total</span></th>
            </tr>
          </thead>
          <tbody>
            {#each filas as f (f.fecha)}
              <tr class:hoy={f.fecha === hoyISO}>
                <td class="col-fecha">
                  <span class="completo">{formatoFecha(f.fecha)}</span>
                  <span class="compacto">{formatoFechaCorto(f.fecha)}</span>
                </td>
                <td class="col-peso">
                  {#if f.peso !== null}
                    <a class="celda-link" href="/peso?fecha={f.fecha}" title="Ver/editar el peso de este día">{fmt(f.peso)}</a>
                  {:else}
                    <a class="vacio" href="/peso?fecha={f.fecha}" title="Capturar peso de este día">—</a>
                  {/if}
                </td>
                <td class="col-basal">
                  {#if f.kcalBasal !== null}
                    <a class="celda-link" href="/peso?fecha={f.fecha}" title="Ver/editar el peso de este día">{fmt(f.kcalBasal)}</a>
                  {:else}
                    <a class="vacio" href="/peso?fecha={f.fecha}" title="Capturar peso de este día">—</a>
                  {/if}
                </td>
                <td class="col-comidas">
                  <a class="celda-link" href="/hoy?fecha={f.fecha}" title="Ver/editar las comidas de este día">{fmt(f.kcalComidas)}</a>
                </td>
                <td class="col-ejercicio">
                  <a class="celda-link" href="/ejercicio?fecha={f.fecha}" title="Ver/editar el ejercicio de este día">{fmt(f.kcalEjercicio)}</a>
                </td>
                <td
                  class="col-total"
                  class:superavit={f.total !== null && f.total >= 0}
                  class:deficit={f.total !== null && f.total < 0}
                >
                  {#if f.total !== null}
                    <a class="celda-link" href="/hoy?fecha={f.fecha}" title="Ver el día completo">{fmt(f.total)}</a>
                  {:else}
                    <a class="vacio" href="/peso?fecha={f.fecha}" title="Capturar peso de este día">—</a>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</section>

<style>
  .registro-page {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    max-width: 720px;
    margin: 0 auto;
    color: var(--ink);
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: var(--ink);
  }

  .sub {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }

  .estado {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.95rem;
  }

  /* Mismo lenguaje visual que el header de mes de Calendario.svelte, para
     que navegar por mes se sienta igual en ambas pantallas. */
  .mes-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .mes-titulo {
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--ink);
    min-width: 9rem;
    text-align: center;
  }

  .mes-nav {
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

  .mes-nav:hover {
    background: var(--volt);
    border-color: var(--volt);
  }

  .aviso {
    background: #ffffff;
    border: 1px solid var(--ink);
    color: var(--ink);
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .aviso a {
    color: var(--ink);
    font-weight: 700;
    text-decoration: underline;
  }

  /* .tabla-wrap es el contenedor SIN overflow ni fondo propio: ahí flotan
     las flechas de "hoy", sobre el fondo translúcido de la página en vez del
     blanco de la tabla. .tabla-scroll es quien recorta con overflow-x:auto
     (pantallas angostas) y quien SÍ trae el fondo/borde/radius de la tabla —
     al ser hermanas (no hijas de .tabla-scroll), las flechas no se recortan. */
  .tabla-wrap {
    position: relative;
  }

  .tabla-scroll {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: #ffffff;
  }

  .tabla-registro {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .tabla-registro th,
  .tabla-registro td {
    padding: 0.55rem 0.9rem;
    border-bottom: 1px solid var(--line);
    border-right: 1px solid var(--line);
    text-align: right;
  }

  .tabla-registro th:last-child,
  .tabla-registro td:last-child {
    border-right: none;
  }

  .tabla-registro tbody tr:last-child td {
    border-bottom: none;
  }

  .col-fecha {
    text-align: left;
  }

  /* Par de etiquetas que se intercambian por ancho: ambas se renderizan y el
     CSS decide cuál se ve (ver media query al final). Se usa tanto en los
     encabezados como en la celda de fecha. */
  .compacto {
    display: none;
  }

  .tabla-registro thead th {
    background: #fafaf8;
    font-weight: 800;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink-soft);
  }

  .tabla-registro thead th.col-peso {
    color: #6d28d9;
  }

  .tabla-registro thead th.col-comidas {
    color: #1e3a8a;
  }

  .tabla-registro thead th.col-ejercicio {
    color: #9a3412;
  }

  .tabla-registro tbody tr:nth-child(even) {
    background: rgba(15, 15, 15, 0.02);
  }

  /* El acento volt reservado para EL momento más importante de la tabla: el
     día de hoy — como fondo (nunca como texto: volt sobre blanco casi no
     contrasta, solo funciona bien como relleno detrás de texto negro). */
  .tabla-registro tbody tr.hoy {
    background: rgba(215, 255, 61, 0.4);
  }

  .tabla-registro tbody td {
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .col-total.superavit {
    color: #9a3412;
    font-weight: 700;
  }

  .col-total.deficit {
    color: #166534;
    font-weight: 700;
  }

  /* Celda vacía (peso/basal/total sin dato): clicable → /peso?fecha=X para
     capturarlo ahí mismo. Guion con línea punteada en vez de link azul, para
     no romper el aspecto plano de la tabla hasta que se pase el mouse. */
  .vacio {
    color: inherit;
    text-decoration: none;
    border-bottom: 1px dashed rgba(15, 15, 15, 0.35);
    cursor: pointer;
  }

  .vacio:hover {
    color: var(--ink);
    border-bottom-color: var(--ink);
    border-bottom-style: solid;
  }

  /* Celda con dato ya capturado: también clicable (a /peso, /hoy o
     /ejercicio según la columna), pero sin el guion punteado de .vacio —
     nada resalta hasta que pasas el mouse, para no perder el aspecto plano
     tipo Excel. Mantiene el color heredado (incl. superávit/déficit de
     .col-total) tanto en reposo como en hover, el subrayado es la única
     señal de "esto es un link". */
  .celda-link {
    color: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  .celda-link:hover {
    text-decoration: underline;
  }

  /* Mismo patrón que "subtab-arrow-indicator" en buzzword-agentes-ui: un
     glifo que pulsa acercándose a lo que señala. `top` llega por JS (medido
     contra la fila de hoy real, ver $effect arriba) porque el alto de fila
     depende del navegador; `left`/`right` las sacan del todo de .tabla-scroll,
     flotando sobre .tabla-wrap (fondo translúcido de la página, no blanco).
     Negro (no volt): volt como texto/glifo sobre blanco casi no se ve. */
  .hoy-flecha {
    position: absolute;
    display: inline-flex;
    color: var(--ink);
    font-weight: 900;
    user-select: none;
  }

  .hoy-flecha-in {
    left: -1.35rem;
    animation: hoy-flecha-in-pulso 1.2s ease-in-out infinite;
  }

  .hoy-flecha-out {
    right: -1.35rem;
    animation: hoy-flecha-out-pulso 1.2s ease-in-out infinite;
  }

  @keyframes hoy-flecha-in-pulso {
    0%,
    100% {
      transform: translateY(-50%) translateX(0);
      opacity: 0.8;
    }
    50% {
      transform: translateY(-50%) translateX(4px);
      opacity: 1;
    }
  }

  @keyframes hoy-flecha-out-pulso {
    0%,
    100% {
      transform: translateY(-50%) translateX(0);
      opacity: 0.8;
    }
    50% {
      transform: translateY(-50%) translateX(-4px);
      opacity: 1;
    }
  }

  /* Mismo breakpoint que Sidebar/TopNav/layout. Abajo de 768px la tabla
     tiene que meter seis columnas en ~390px, así que: fecha en d/m,
     encabezados sin unidad — el "(kcal)" se repetía en cuatro de las seis y
     la línea de arriba ya explica que todo son calorías — y celdas con la
     mitad del padding horizontal. */
  @media (max-width: 768px) {
    .completo {
      display: none;
    }

    .compacto {
      display: inline;
    }

    .tabla-registro th,
    .tabla-registro td {
      padding: 0.5rem 0.45rem;
    }
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
