<script lang="ts">
  // Bitácora de ejercicio del día: cada "Guardar" AGREGA una entrada nueva
  // (no reemplaza la anterior) — mismo espíritu que comidas/consumos. El
  // total mostrado abajo es la suma de las entradas del día. El Atajo de iOS
  // sigue guardando su propio valor (calorías activas del Watch) por
  // separado en /metricas-ios; el resto de la app (Registro Diario,
  // Calendario, Total del día de Alimentación) suma ambas fuentes para
  // "kcal quemadas".
  //
  // ?fecha=YYYY-MM-DD (opcional, en la URL): permite ver/agregar entradas de
  // un día PASADO, no solo hoy — mismo patrón que /peso, así puede llegar
  // directo desde el resumen de /calendario.
  import { env } from '$env/dynamic/public';
  import { page } from '$app/state';

  const API_URL = env.PUBLIC_API_URL ?? '/api';

  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

  function formatoFechaLarga(fecha: string): string {
    const [y, m, d] = fecha.split('-').map(Number);
    const raw = new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  const fechaParam = $derived(page.url.searchParams.get('fecha'));
  const fechaValida = $derived(
    fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) && fechaParam <= hoyISO ? fechaParam : null
  );
  const fechaObjetivo = $derived(fechaValida ?? hoyISO);
  const esHoy = $derived(fechaObjetivo === hoyISO);
  const fechaLargoObjetivo = $derived(formatoFechaLarga(fechaObjetivo));

  type Entrada = { id: number; fecha: string; concepto: string; kilocalorias: number; created_at: string };

  let entradas = $state<Entrada[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let errorAccion = $state<string | null>(null);

  let concepto = $state('');
  let calorias = $state('');
  let guardando = $state(false);

  let confirmandoEliminar = $state<number | null>(null);
  let eliminandoId = $state<number | null>(null);

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  const entradasDelDia = $derived(
    entradas.filter((e) => e.fecha === fechaObjetivo).slice().sort((a, b) => a.id - b.id)
  );
  const totalDia = $derived(entradasDelDia.reduce((acc, e) => acc + e.kilocalorias, 0));

  function extraerError(detalle: unknown, fallback: string): string {
    const d = (detalle as { detail?: unknown } | null)?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d[0] && typeof d[0] === 'object' && 'msg' in d[0]) {
      return String((d[0] as { msg: unknown }).msg);
    }
    return fallback;
  }

  $effect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/ejercicios`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        entradas = (await res.json()) as Entrada[];
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

  async function guardar() {
    if (!concepto.trim()) {
      errorAccion = 'Describe brevemente el ejercicio (ej. "Correr 5km").';
      return;
    }
    // bind:value en <input type="number"> guarda un NÚMERO, no texto — por
    // eso se checa "=== ''" para vacío de verdad en vez de "!calorias" (0 es
    // falsy en JS y se confundiría con vacío, aunque 0 sí es válido aquí).
    if (calorias === '' || calorias === null || calorias === undefined) {
      errorAccion = 'Ingresa un número de calorías válido.';
      return;
    }
    const valor = Number(calorias);
    if (Number.isNaN(valor) || valor < 0) {
      errorAccion = 'Ingresa un número de calorías válido.';
      return;
    }
    guardando = true;
    errorAccion = null;
    try {
      const res = await fetch(`${API_URL}/ejercicios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: fechaObjetivo, concepto: concepto.trim(), kilocalorias: valor })
      });
      if (!res.ok) {
        const detalle = await res.json().catch(() => null);
        throw new Error(extraerError(detalle, `HTTP ${res.status}`));
      }
      const creado = (await res.json()) as Entrada;
      entradas = [...entradas, creado];
      concepto = '';
      calorias = '';
    } catch (e) {
      errorAccion =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      guardando = false;
    }
  }

  async function eliminar(id: number) {
    if (eliminandoId !== null) return;
    eliminandoId = id;
    errorAccion = null;
    try {
      const res = await fetch(`${API_URL}/ejercicios/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      entradas = entradas.filter((e) => e.id !== id);
      confirmandoEliminar = null;
    } catch {
      errorAccion = 'No se pudo eliminar la entrada.';
    } finally {
      eliminandoId = null;
    }
  }
</script>

<section class="ejercicio-page">
  <h1>Ejercicio</h1>
  {#if esHoy}
    <p class="hoy">Hoy es: <strong>{fechaLargoObjetivo}</strong></p>
  {:else}
    <p class="hoy">
      Editando: <strong>{fechaLargoObjetivo}</strong>
      <a href="/ejercicio" class="volver-hoy">volver a hoy</a>
    </p>
  {/if}

  {#if error}
    <div class="error">⚠️ {error}</div>
  {/if}
  {#if errorAccion}
    <div class="error">⚠️ {errorAccion}</div>
  {/if}

  {#if cargando}
    <p class="estado">Cargando…</p>
  {:else}
    <div class="card">
      <div class="fila-input">
        <div class="campo campo-concepto">
          <label for="concepto-input">Concepto</label>
          <input
            id="concepto-input"
            type="text"
            placeholder="Ej. Correr 5km"
            bind:value={concepto}
            onkeydown={(e) => e.key === 'Enter' && guardar()}
          />
        </div>
        <div class="campo campo-calorias">
          <label for="calorias-input">Kcal</label>
          <input
            id="calorias-input"
            type="number"
            inputmode="decimal"
            step="1"
            min="0"
            placeholder="350"
            bind:value={calorias}
            onkeydown={(e) => e.key === 'Enter' && guardar()}
          />
        </div>
        <button type="button" onclick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>

    {#if entradasDelDia.length > 0}
      <div class="total-dia">
        <span class="total-dia-label">Total del día</span>
        <span class="total-big">{fmt(totalDia)} kcal</span>
      </div>

      <div class="entradas">
        {#each entradasDelDia as e (e.id)}
          <div class="entrada">
            <div class="entrada-head">
              <span class="entrada-concepto">{e.concepto}</span>
              <div class="entrada-acciones">
                <span class="entrada-kcal">{fmt(e.kilocalorias)} kcal</span>
                <button
                  type="button"
                  class="icon-btn"
                  onclick={() => (confirmandoEliminar = e.id)}
                  aria-label="Eliminar entrada"
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
            {#if confirmandoEliminar === e.id}
              <div class="confirmar-eliminar">
                <span>¿Eliminar esta entrada?</span>
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
                    onclick={() => eliminar(e.id)}
                    disabled={eliminandoId !== null}
                  >
                    {eliminandoId === e.id ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="estado">Aún no hay ejercicio capturado {esHoy ? 'hoy' : 'ese día'}.</p>
    {/if}
  {/if}
</section>

<style>
  .ejercicio-page {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    max-width: 640px;
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

  .hoy {
    margin: 0;
    font-size: 0.95rem;
    color: var(--ink-soft);
  }

  .hoy strong {
    color: var(--ink);
  }

  .volver-hoy {
    margin-left: 0.5rem;
    font-size: 0.85rem;
    color: var(--ink);
    font-weight: 700;
  }

  .volver-hoy:hover {
    text-decoration: underline;
  }

  .estado {
    margin: 0;
    color: var(--ink-soft);
    font-size: 0.95rem;
  }

  .card {
    padding: 1.1rem 1.3rem;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  label {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }

  .fila-input {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: 0.9rem;
  }

  .campo {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .campo-concepto {
    flex: 2;
    min-width: 160px;
  }

  .campo-calorias {
    flex: 0 0 100px;
  }

  /* El input global trae min-width: 140px (ver más abajo) — se pisa aquí
     para que este campo sí pueda quedar angosto como se pidió. box-sizing:
     border-box es clave: sin él, width:100px + el padding/borde del input
     global suman ~130px reales, se salen de este contenedor de 100px y se
     comen el espacio del botón de al lado (el bug que se vio en producción).
     Sin flechitas de spinner tampoco: en un campo tan angosto solo
     apachurran el número. */
  .campo-calorias input {
    box-sizing: border-box;
    min-width: 0;
    width: 100px;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .campo-calorias input::-webkit-outer-spin-button,
  .campo-calorias input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .fila-input > button {
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 140px;
    padding: 0.7rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: #ffffff;
    font: inherit;
    font-size: 1rem;
    color: var(--ink);
  }

  input:focus {
    outline: none;
    border-color: var(--ink);
  }

  /* CTA principal: volt sólido + texto negro, mismo lenguaje que el resto
     de la app. */
  button {
    flex-shrink: 0;
    padding: 0.7rem 1.3rem;
    border-radius: 10px;
    border: 1px solid var(--volt);
    background: var(--volt);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    transition:
      filter 0.18s ease,
      opacity 0.18s ease;
  }

  button:hover:not(:disabled) {
    filter: brightness(0.94);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Suma de las entradas del día — mismo tratamiento que "Total del día" en
     Alimentación Hoy. */
  .total-dia {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.9rem 1.1rem;
    border-radius: 14px;
    background: rgba(215, 255, 61, 0.4);
    border: 1px solid rgba(15, 15, 15, 0.15);
  }

  .total-dia-label {
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--ink);
  }

  .total-big {
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--ink);
    background: var(--volt);
    border: 1px solid var(--volt);
    border-radius: 999px;
    padding: 0.3rem 0.85rem;
    white-space: nowrap;
  }

  .entradas {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .entrada {
    padding: 0.9rem 1.1rem;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid var(--line);
  }

  .entrada-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .entrada-concepto {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--ink);
    min-width: 0;
    overflow-wrap: break-word;
  }

  .entrada-acciones {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .entrada-kcal {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--ink);
    background: rgba(215, 255, 61, 0.4);
    border: 1px solid rgba(15, 15, 15, 0.12);
    border-radius: 999px;
    padding: 0.2rem 0.65rem;
    white-space: nowrap;
  }

  .icon-btn {
    background: none;
    border: none;
    padding: 0.15rem;
    color: rgba(15, 15, 15, 0.4);
    cursor: pointer;
    display: inline-flex;
  }

  .icon-btn:hover {
    color: var(--ink);
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
    color: var(--ink);
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
    border: none;
  }

  .cancelar-btn {
    background: #ffffff;
    border: 1px solid var(--line);
    color: var(--ink);
  }

  .cancelar-btn:hover:not(:disabled) {
    background: rgba(15, 15, 15, 0.05);
  }

  .eliminar-btn {
    background: rgba(220, 38, 38, 0.9);
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

  .error {
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.35);
    color: #991b1b;
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    font-size: 0.88rem;
  }
</style>
