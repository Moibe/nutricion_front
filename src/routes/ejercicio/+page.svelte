<script lang="ts">
  // Captura manual de ejercicio del día (complemento al Atajo de iOS): dos
  // campos (concepto + calorías quemadas) + botón Guardar que hacen upsert
  // directo a POST /metricas-ios (tipo=calorias_quemadas), el mismo
  // "cachador" genérico que usa el Atajo. El Atajo solo manda el número
  // (nunca concepto — no tiene forma de describir el ejercicio), y el back
  // conserva el concepto ya guardado si una llamada posterior no lo manda
  // (COALESCE), así que el Atajo actualizando el total no te borra lo que
  // escribiste aquí. Si ya hay datos guardados hoy, se precargan.
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

  let concepto = $state('');
  let calorias = $state('');
  let cargando = $state(true);
  let guardando = $state(false);
  let guardado = $state(false);
  let error = $state<string | null>(null);

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
        const res = await fetch(`${API_URL}/metricas-ios`);
        if (res.ok) {
          const datos = (await res.json()) as {
            fecha: string;
            tipo: string;
            valor: number;
            concepto: string | null;
          }[];
          const deHoy = datos.find((m) => m.fecha === hoyISO && m.tipo === 'calorias_quemadas');
          if (deHoy) {
            calorias = String(deHoy.valor);
            concepto = deHoy.concepto ?? '';
          }
        }
      } catch {
        // Si falla la carga, simplemente arranca vacío — no bloquea poder capturar.
      } finally {
        cargando = false;
      }
    })();
  });

  async function guardar() {
    if (!concepto.trim()) {
      error = 'Describe brevemente el ejercicio (ej. "Correr 5km").';
      return;
    }
    // OJO: bind:value en <input type="number"> guarda un NÚMERO, no texto —
    // "!calorias" trataría un 0 legítimo como vacío (0 es falsy en JS). Por
    // eso se checa "=== ''" para vacío de verdad, aparte de validar el número.
    // 0 sí es válido aquí (día sin ejercicio registrado); solo se rechaza
    // vacío, no-numérico o negativo.
    if (calorias === '' || calorias === null || calorias === undefined) {
      error = 'Ingresa un número de calorías válido.';
      return;
    }
    const valor = Number(calorias);
    if (Number.isNaN(valor) || valor < 0) {
      error = 'Ingresa un número de calorías válido.';
      return;
    }
    guardando = true;
    error = null;
    try {
      const res = await fetch(`${API_URL}/metricas-ios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'calorias_quemadas',
          fecha: hoyISO,
          valor,
          fuente: 'manual',
          concepto: concepto.trim()
        })
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

<section class="ejercicio-page">
  <h1>Ejercicio</h1>
  <p class="hoy">Hoy es: <strong>{hoyLargo}</strong></p>

  {#if error}
    <div class="error">⚠️ {error}</div>
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
            oninput={() => (guardado = false)}
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
            oninput={() => (guardado = false)}
            onkeydown={(e) => e.key === 'Enter' && guardar()}
          />
        </div>
        <button type="button" onclick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {#if guardado}
        <p class="ok">✓ Guardado</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .ejercicio-page {
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
    border: 1px solid rgba(15, 23, 42, 0.15);
    background: rgba(255, 255, 255, 0.7);
    font: inherit;
    font-size: 1rem;
    color: rgba(15, 23, 42, 0.95);
  }

  input:focus {
    outline: none;
    border-color: rgba(37, 99, 235, 0.5);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
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
