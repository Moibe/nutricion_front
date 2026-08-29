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

  function formatoFechaLarga(fecha: string) {
    const [y, m, d] = fecha.split('-').map(Number);
    const raw = new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
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
    <div class="filas">
      {#each filas as f (f.fecha)}
        <div class="dia-card" class:hoy={f.fecha === hoyISO}>
          {#if f.fecha === hoyISO}
            <span class="hoy-flecha hoy-flecha-in" aria-hidden="true">»</span>
            <span class="hoy-flecha hoy-flecha-out" aria-hidden="true">«</span>
          {/if}
          <span class="dia-fecha">{formatoFechaLarga(f.fecha)}</span>
          <div class="dia-scroll">
            <span class="pill peso">{f.peso !== null ? `${fmt(f.peso)} kg` : '— kg'}</span>
            <span class="pill basal"
              >{f.kcalBasal !== null ? `${fmt(f.kcalBasal)} kcal basal` : '— kcal basal'}</span
            >
            <span class="pill comidas">{fmt(f.kcalComidas)} kcal comidas</span>
            <span class="pill ejercicio">{fmt(f.kcalEjercicio)} kcal ejercicio</span>
            <span class="pill total" class:superavit={f.total !== null && f.total >= 0}>
              {f.total !== null ? `${fmt(f.total)} kcal total` : '— kcal total'}
            </span>
          </div>
        </div>
      {/each}
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

  .filas {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .dia-card {
    position: relative;
    padding: 0.9rem 1.1rem;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .dia-card.hoy {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.35);
  }

  /* Mismo patrón que "subtab-arrow-indicator" en buzzword-agentes-ui: un
     glifo que pulsa acercándose a lo que señala. Acá van dos, AFUERA de la
     tarjeta completa (no solo de la fecha), apuntando los dos hacia el
     centro de la tarjeta de hoy. */
  .hoy-flecha {
    position: absolute;
    top: 50%;
    display: inline-flex;
    color: #f59e0b;
    font-size: 1.4rem;
    font-weight: 900;
    line-height: 1;
    text-shadow: 0 0 6px rgba(245, 158, 11, 0.55);
    user-select: none;
  }

  .hoy-flecha-in {
    left: -1.5rem;
    animation: hoy-flecha-in-pulso 1.2s ease-in-out infinite;
  }

  .hoy-flecha-out {
    right: -1.5rem;
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

  .dia-fecha {
    font-weight: 700;
    font-size: 0.9rem;
    color: rgba(15, 23, 42, 0.85);
  }

  /* nowrap + scroll horizontal (mismo patrón que ListadoComidas): en vez de
     que las píldoras se bajen a una 2a línea y agranden la tarjeta. */
  .dia-scroll {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    gap: 0.4rem;
  }

  .dia-scroll::-webkit-scrollbar {
    display: none;
  }

  .pill {
    flex-shrink: 0;
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: 999px;
    padding: 0.3rem 0.65rem;
    white-space: nowrap;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(15, 23, 42, 0.12);
    color: rgba(15, 23, 42, 0.75);
  }

  .pill.peso {
    color: #6d28d9;
    background: rgba(124, 58, 237, 0.12);
    border-color: rgba(124, 58, 237, 0.3);
  }

  .pill.basal {
    color: rgba(15, 23, 42, 0.7);
    background: rgba(15, 23, 42, 0.06);
    border-color: rgba(15, 23, 42, 0.15);
  }

  .pill.comidas {
    color: #1e3a8a;
    background: rgba(37, 99, 235, 0.12);
    border-color: rgba(37, 99, 235, 0.3);
  }

  .pill.ejercicio {
    color: #9a3412;
    background: rgba(234, 88, 12, 0.12);
    border-color: rgba(234, 88, 12, 0.3);
  }

  .pill.total {
    color: #166534;
    background: rgba(22, 163, 74, 0.14);
    border-color: rgba(22, 163, 74, 0.35);
  }

  .pill.total.superavit {
    color: #9a3412;
    background: rgba(234, 88, 12, 0.14);
    border-color: rgba(234, 88, 12, 0.35);
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
