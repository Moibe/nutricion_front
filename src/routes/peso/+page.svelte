<script lang="ts">
  // Captura manual del peso del día (complemento al Atajo de iOS): un campo
  // + botón Guardar que hacen upsert directo a POST /metricas-ios
  // (tipo=peso), el mismo "cachador" genérico que usa el Atajo. Si ya hay un
  // valor guardado hoy (por el Atajo o por esta misma página antes), se
  // precarga en el campo en vez de arrancar vacío.
  import { env } from '$env/dynamic/public';

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  // Misma zona horaria que usa el resto de la app para "hoy" (CDMX).
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const hoyLargoRaw = new Date().toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const hoyLargo = hoyLargoRaw.charAt(0).toUpperCase() + hoyLargoRaw.slice(1);

  let peso = $state('');
  let cargando = $state(true);
  let guardando = $state(false);
  let guardado = $state(false);
  let error = $state<string | null>(null);

  // Perfil (fecha de nacimiento/estatura/sexo) para calcular metabolismo
  // basal junto al peso. null = todavía no se ha capturado (primera vez).
  type Perfil = { fecha_nacimiento: string; estatura_cm: number; sexo: 'hombre' | 'mujer' };
  let perfil = $state<Perfil | null>(null);
  let perfilCargado = $state(false);
  let mostrarFormPerfil = $state(false);
  let fechaNacimientoInput = $state('');
  let estaturaInput = $state('');
  let sexoInput = $state<'hombre' | 'mujer'>('hombre');
  let guardandoPerfil = $state(false);
  let errorPerfil = $state<string | null>(null);

  $effect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/metricas-ios`);
        if (res.ok) {
          const datos = (await res.json()) as { fecha: string; tipo: string; valor: number }[];
          const deHoy = datos.find((m) => m.fecha === hoyISO && m.tipo === 'peso');
          if (deHoy) peso = String(deHoy.valor);
        }
      } catch {
        // Si falla la carga, simplemente arranca vacío — no bloquea poder capturar.
      } finally {
        cargando = false;
      }
    })();
  });

  $effect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/perfil`);
        if (res.ok) {
          const datos = await res.json();
          if (datos) {
            perfil = datos as Perfil;
            fechaNacimientoInput = datos.fecha_nacimiento;
            estaturaInput = String(datos.estatura_cm);
            sexoInput = datos.sexo;
          }
        }
      } catch {
        // Best-effort: si falla, simplemente no se muestra el metabolismo basal.
      } finally {
        perfilCargado = true;
      }
    })();
  });

  // Edad calculada al vuelo desde fecha_nacimiento, no guardada como número
  // fijo (la edad cambia con el tiempo, un número guardado se volvería viejo).
  function calcularEdad(fechaNacimiento: string, hoyStr: string): number {
    const [an, mn, dn] = fechaNacimiento.split('-').map(Number);
    const [ah, mh, dh] = hoyStr.split('-').map(Number);
    let edad = ah - an;
    if (mh < mn || (mh === mn && dh < dn)) edad--;
    return edad;
  }

  const pesoNumerico = $derived(peso === '' || peso === null || peso === undefined ? null : Number(peso));

  // Metabolismo basal (Mifflin-St Jeor) con el peso que esté en el campo en
  // este momento (aunque no se haya guardado todavía) + el perfil.
  const bmr = $derived.by(() => {
    if (!perfil || pesoNumerico === null || Number.isNaN(pesoNumerico) || pesoNumerico <= 0) return null;
    const edad = calcularEdad(perfil.fecha_nacimiento, hoyISO);
    const base = 10 * pesoNumerico + 6.25 * perfil.estatura_cm - 5 * edad;
    return Math.round(perfil.sexo === 'hombre' ? base + 5 : base - 161);
  });

  function extraerError(detalle: unknown, fallback: string): string {
    const d = (detalle as { detail?: unknown } | null)?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d[0] && typeof d[0] === 'object' && 'msg' in d[0]) {
      return String((d[0] as { msg: unknown }).msg);
    }
    return fallback;
  }

  async function guardarPerfil() {
    if (!fechaNacimientoInput) {
      errorPerfil = 'Ingresa tu fecha de nacimiento.';
      return;
    }
    const estatura = Number(estaturaInput);
    if (estaturaInput === '' || Number.isNaN(estatura) || estatura <= 0) {
      errorPerfil = 'Ingresa una estatura válida.';
      return;
    }
    guardandoPerfil = true;
    errorPerfil = null;
    try {
      const res = await fetch(`${API_URL}/perfil`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_nacimiento: fechaNacimientoInput,
          estatura_cm: estatura,
          sexo: sexoInput
        })
      });
      if (!res.ok) {
        const detalle = await res.json().catch(() => null);
        throw new Error(extraerError(detalle, `HTTP ${res.status}`));
      }
      perfil = (await res.json()) as Perfil;
      mostrarFormPerfil = false;
    } catch (e) {
      errorPerfil =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      guardandoPerfil = false;
    }
  }

  async function guardar() {
    // bind:value en <input type="number"> guarda un NÚMERO, no texto — por
    // eso se checa "=== ''" para vacío de verdad en vez de "!peso" (0 es
    // falsy en JS y se confundiría con vacío, aunque aquí igual es inválido).
    if (peso === '' || peso === null || peso === undefined) {
      error = 'Ingresa un peso válido.';
      return;
    }
    const valor = Number(peso);
    if (Number.isNaN(valor) || valor <= 0) {
      error = 'Ingresa un peso válido.';
      return;
    }
    guardando = true;
    error = null;
    try {
      const res = await fetch(`${API_URL}/metricas-ios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'peso', fecha: hoyISO, valor, fuente: 'manual' })
      });
      if (!res.ok) {
        const detalle = await res.json().catch(() => null);
        throw new Error(extraerError(detalle, `HTTP ${res.status}`));
      }
      guardado = true;
    } catch (e) {
      error =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      guardando = false;
    }
  }
</script>

<section class="peso-page">
  <h1>Peso</h1>
  <p class="hoy">Hoy es: <strong>{hoyLargo}</strong></p>

  {#if error}
    <div class="error">⚠️ {error}</div>
  {/if}

  {#if cargando}
    <p class="estado">Cargando…</p>
  {:else}
    <div class="card">
      <label for="peso-input">Peso de hoy (kg)</label>
      <div class="fila-input">
        <input
          id="peso-input"
          type="number"
          inputmode="decimal"
          step="0.1"
          min="0"
          placeholder="Ej. 74.5"
          bind:value={peso}
          oninput={() => (guardado = false)}
          onkeydown={(e) => e.key === 'Enter' && guardar()}
        />
        <button type="button" onclick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {#if guardado}
        <p class="ok">✓ Guardado</p>
      {/if}
    </div>

    {#if !perfilCargado}
      <!-- Sin estado de carga propio: si tarda, simplemente no aparece nada
           todavía en vez de un "Cargando…" aparte que compita con el de arriba. -->
    {:else if mostrarFormPerfil}
      <div class="card">
        <p class="perfil-intro">
          Para calcular tu metabolismo basal necesito estos 3 datos (una sola vez):
        </p>

        {#if errorPerfil}
          <div class="error">⚠️ {errorPerfil}</div>
        {/if}

        <label for="fecha-nacimiento-input">Fecha de nacimiento</label>
        <input id="fecha-nacimiento-input" type="date" max={hoyISO} bind:value={fechaNacimientoInput} />

        <label for="estatura-input">Estatura (cm)</label>
        <input
          id="estatura-input"
          type="number"
          inputmode="decimal"
          step="1"
          min="0"
          placeholder="Ej. 175"
          bind:value={estaturaInput}
        />

        <label for="sexo-input">Sexo</label>
        <select id="sexo-input" bind:value={sexoInput}>
          <option value="hombre">Hombre</option>
          <option value="mujer">Mujer</option>
        </select>

        <div class="fila-input">
          <button type="button" onclick={guardarPerfil} disabled={guardandoPerfil}>
            {guardandoPerfil ? 'Guardando…' : 'Guardar perfil'}
          </button>
          {#if perfil}
            <button
              type="button"
              class="secundario"
              onclick={() => (mostrarFormPerfil = false)}
              disabled={guardandoPerfil}
            >
              Cancelar
            </button>
          {/if}
        </div>
      </div>
    {:else if !perfil}
      <div class="card">
        <p class="perfil-intro">
          Para calcular tu metabolismo basal necesito tu fecha de nacimiento, estatura y sexo.
        </p>
        <button type="button" onclick={() => (mostrarFormPerfil = true)}>Completar perfil</button>
      </div>
    {:else}
      <div class="card">
        {#if bmr !== null}
          <p class="bmr">
            Metabolismo basal (reposo): <strong>{bmr.toLocaleString('es-MX')} kcal/día</strong>
          </p>
        {:else}
          <p class="estado">Captura tu peso arriba para ver tu metabolismo basal.</p>
        {/if}
        <button type="button" class="link-btn" onclick={() => (mostrarFormPerfil = true)}>
          Editar perfil
        </button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .peso-page {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    max-width: 640px;
    margin: 0 auto;
    color: rgba(15, 23, 42, 0.9);
  }

  h1 {
    margin: 0;
    font-size: 1.35rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .hoy {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(15, 23, 42, 0.65);
  }

  .hoy strong {
    color: rgba(15, 23, 42, 0.9);
  }

  .estado {
    margin: 0;
    color: rgba(15, 23, 42, 0.6);
    font-size: 0.95rem;
  }

  .card {
    padding: 1.1rem 1.3rem;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  label {
    font-weight: 600;
    font-size: 0.9rem;
    color: rgba(15, 23, 42, 0.75);
  }

  .fila-input {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  input {
    flex: 1;
    min-width: 140px;
    padding: 0.7rem 0.9rem;
    border-radius: 10px;
    border: 1px solid rgba(15, 23, 42, 0.15);
    background: rgba(255, 255, 255, 0.7);
    font: inherit;
    font-size: 1rem;
    color: rgba(15, 23, 42, 0.95);
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: rgba(37, 99, 235, 0.5);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }

  select {
    padding: 0.7rem 0.9rem;
    border-radius: 10px;
    border: 1px solid rgba(15, 23, 42, 0.15);
    background: rgba(255, 255, 255, 0.7);
    font: inherit;
    font-size: 1rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .perfil-intro {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(15, 23, 42, 0.75);
  }

  .bmr {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(15, 23, 42, 0.75);
  }

  .bmr strong {
    color: #1e3a8a;
  }

  button {
    flex-shrink: 0;
    padding: 0.7rem 1.3rem;
    border-radius: 10px;
    border: 1px solid rgba(37, 99, 235, 0.35);
    background: #2563eb;
    color: #fff;
    font: inherit;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition:
      background 0.18s ease,
      opacity 0.18s ease;
  }

  button:hover:not(:disabled) {
    background: #1d4fd1;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button.secundario {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(15, 23, 42, 0.15);
    color: rgba(15, 23, 42, 0.75);
  }

  button.secundario:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.9);
  }

  button.link-btn {
    align-self: flex-start;
    padding: 0;
    background: none;
    border: none;
    color: #2563eb;
    font-weight: 600;
    font-size: 0.85rem;
  }

  button.link-btn:hover:not(:disabled) {
    background: none;
    text-decoration: underline;
  }

  .ok {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #166534;
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
