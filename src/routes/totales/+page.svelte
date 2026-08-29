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

  type Consumo = { kilocalorias: number | null };
  type Comida = { fecha: string; consumos: Consumo[] };
  type MetricaIos = { fecha: string; tipo: string; valor: number };
  type Perfil = { fecha_nacimiento: string; estatura_cm: number; sexo: 'hombre' | 'mujer' };

  type Fila = {
    fecha: string;
    peso: number | null;
    kcalBasal: number | null;
    kcalComidas: number;
    kcalEjercicio: number;
    total: number | null;
  };

  let cargando = $state(true);
  let error = $state<string | null>(null);
  let filas = $state<Fila[]>([]);
  let perfil = $state<Perfil | null>(null);

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

  // Edad AL DÍA de esa fila (no la de hoy) — un día de hace tiempo debe usar
  // la edad que tenías entonces, aunque sea prácticamente siempre la misma.
  function calcularEdad(fechaNacimiento: string, enFecha: string): number {
    const [an, mn, dn] = fechaNacimiento.split('-').map(Number);
    const [af, mf, df] = enFecha.split('-').map(Number);
    let edad = af - an;
    if (mf < mn || (mf === mn && df < dn)) edad--;
    return edad;
  }

  $effect(() => {
    (async () => {
      try {
        const [resComidas, resMetricas, resPerfil] = await Promise.all([
          fetch(`${API_URL}/comidas`),
          fetch(`${API_URL}/metricas-ios`),
          fetch(`${API_URL}/perfil`)
        ]);
        if (!resComidas.ok) throw new Error(`HTTP ${resComidas.status}`);
        if (!resMetricas.ok) throw new Error(`HTTP ${resMetricas.status}`);

        const comidas = (await resComidas.json()) as Comida[];
        const metricas = (await resMetricas.json()) as MetricaIos[];
        perfil = resPerfil.ok ? ((await resPerfil.json()) as Perfil | null) : null;

        const kcalComidasPorDia = new Map<string, number>();
        for (const c of comidas) {
          const totalComida = c.consumos.reduce((acc, x) => acc + (x.kilocalorias ?? 0), 0);
          kcalComidasPorDia.set(c.fecha, (kcalComidasPorDia.get(c.fecha) ?? 0) + totalComida);
        }

        const pesoPorDia = new Map<string, number>();
        const ejercicioPorDia = new Map<string, number>();
        for (const m of metricas) {
          if (m.tipo === 'peso') pesoPorDia.set(m.fecha, m.valor);
          if (m.tipo === 'calorias_quemadas') ejercicioPorDia.set(m.fecha, m.valor);
        }

        const todasLasFechas = new Set([
          ...kcalComidasPorDia.keys(),
          ...pesoPorDia.keys(),
          ...ejercicioPorDia.keys()
        ]);

        filas = [...todasLasFechas]
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

<section class="totales-page">
  <h1>Totales</h1>
  <p class="sub">Consumidas − (basales + ejercitadas) = superávit o déficit del día.</p>

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
    <p class="estado">Aún no hay datos guardados en ningún día.</p>
  {:else}
    <div class="tabla-scroll">
      <table class="tabla-totales">
        <thead>
          <tr>
            <th class="col-fecha">Fecha</th>
            <th class="col-peso">Peso (kg)</th>
            <th class="col-basal">Basal (kcal)</th>
            <th class="col-comidas">Comidas (kcal)</th>
            <th class="col-ejercicio">Ejercicio (kcal)</th>
            <th class="col-total">Total (kcal)</th>
          </tr>
        </thead>
        <tbody>
          {#each filas as f (f.fecha)}
            <tr class:hoy={f.fecha === hoyISO}>
              <td class="col-fecha">
                {#if f.fecha === hoyISO}
                  <span class="hoy-flecha hoy-flecha-in" aria-hidden="true">»</span>
                {/if}
                {formatoFecha(f.fecha)}
                {#if f.fecha === hoyISO}
                  <span class="hoy-flecha hoy-flecha-out" aria-hidden="true">«</span>
                {/if}
              </td>
              <td class="col-peso">{f.peso !== null ? fmt(f.peso) : '—'}</td>
              <td class="col-basal">{f.kcalBasal !== null ? fmt(f.kcalBasal) : '—'}</td>
              <td class="col-comidas">{fmt(f.kcalComidas)}</td>
              <td class="col-ejercicio">{fmt(f.kcalEjercicio)}</td>
              <td
                class="col-total"
                class:superavit={f.total !== null && f.total >= 0}
                class:deficit={f.total !== null && f.total < 0}
              >
                {f.total !== null ? fmt(f.total) : '—'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .totales-page {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    max-width: 720px;
    margin: 0 auto;
    color: rgba(15, 23, 42, 0.9);
  }

  h1 {
    margin: 0;
    font-size: 1.35rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .sub {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(15, 23, 42, 0.55);
  }

  .estado {
    margin: 0;
    color: rgba(15, 23, 42, 0.6);
    font-size: 0.95rem;
  }

  .aviso {
    background: rgba(219, 39, 119, 0.08);
    border: 1px solid rgba(219, 39, 119, 0.3);
    color: rgba(15, 23, 42, 0.8);
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .aviso a {
    color: #db2777;
    font-weight: 600;
  }

  /* Tabla tipo Excel: columnas y filas rectas en vez de tarjetas con chips. */
  .tabla-scroll {
    overflow-x: auto;
    border-radius: 12px;
    border: 1px solid rgba(15, 23, 42, 0.15);
    background: rgba(255, 255, 255, 0.55);
  }

  .tabla-totales {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .tabla-totales th,
  .tabla-totales td {
    padding: 0.55rem 0.9rem;
    border-bottom: 1px solid rgba(15, 23, 42, 0.1);
    border-right: 1px solid rgba(15, 23, 42, 0.08);
    text-align: right;
  }

  .tabla-totales th:last-child,
  .tabla-totales td:last-child {
    border-right: none;
  }

  .tabla-totales tbody tr:last-child td {
    border-bottom: none;
  }

  .col-fecha {
    text-align: left;
  }

  .tabla-totales thead th {
    background: rgba(15, 23, 42, 0.04);
    font-weight: 700;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(15, 23, 42, 0.55);
  }

  .tabla-totales thead th.col-peso {
    color: #6d28d9;
  }

  .tabla-totales thead th.col-comidas {
    color: #1e3a8a;
  }

  .tabla-totales thead th.col-ejercicio {
    color: #9a3412;
  }

  .tabla-totales tbody tr:nth-child(even) {
    background: rgba(15, 23, 42, 0.02);
  }

  .tabla-totales tbody tr.hoy {
    background: rgba(245, 158, 11, 0.12);
  }

  .tabla-totales tbody td {
    font-variant-numeric: tabular-nums;
    color: rgba(15, 23, 42, 0.85);
  }

  .col-total.superavit {
    color: #9a3412;
    font-weight: 700;
  }

  .col-total.deficit {
    color: #166534;
    font-weight: 700;
  }

  /* Mismo patrón que "subtab-arrow-indicator" en buzzword-agentes-ui: un
     glifo que pulsa acercándose a lo que señala. Uno de cada lado de la
     fecha de hoy, apuntando los dos hacia el centro. */
  .hoy-flecha {
    display: inline-flex;
    color: #f59e0b;
    font-weight: 900;
    text-shadow: 0 0 6px rgba(245, 158, 11, 0.55);
    user-select: none;
  }

  .hoy-flecha-in {
    margin-right: 0.25rem;
    animation: hoy-flecha-in-pulso 1.2s ease-in-out infinite;
  }

  .hoy-flecha-out {
    margin-left: 0.25rem;
    animation: hoy-flecha-out-pulso 1.2s ease-in-out infinite;
  }

  @keyframes hoy-flecha-in-pulso {
    0%,
    100% {
      transform: translateX(0);
      opacity: 0.8;
    }
    50% {
      transform: translateX(3px);
      opacity: 1;
    }
  }

  @keyframes hoy-flecha-out-pulso {
    0%,
    100% {
      transform: translateX(0);
      opacity: 0.8;
    }
    50% {
      transform: translateX(-3px);
      opacity: 1;
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
