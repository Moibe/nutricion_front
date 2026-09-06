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
  import ChatEjercicio from '$lib/ChatEjercicio.svelte';

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

  // Mismo navegador de días que /hoy (flechitas arriba a la izquierda) --
  // suma/resta en UTC puro (sin horas de por medio) para no depender de la
  // zona horaria del navegador: un YYYY-MM-DD entra y sale igual sin
  // importar dónde esté físicamente el dispositivo.
  function sumarDias(fechaISO: string, delta: number): string {
    const [y, m, d] = fechaISO.split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));
    fecha.setUTCDate(fecha.getUTCDate() + delta);
    return fecha.toISOString().slice(0, 10);
  }

  const fechaAnterior = $derived(sumarDias(fechaObjetivo, -1));
  const fechaSiguiente = $derived(sumarDias(fechaObjetivo, 1));
  // No hay "mañana" que mostrar todavía -- el botón de avanzar se apaga en hoy.
  const puedeAvanzar = $derived(fechaObjetivo < hoyISO);
  const hrefSiguiente = $derived(fechaSiguiente === hoyISO ? '/ejercicio' : `/ejercicio?fecha=${fechaSiguiente}`);

  type Entrada = {
    id: number;
    fecha: string;
    concepto: string;
    kilocalorias: number;
    created_at: string;
    conversation_id?: string | null;
  };
  type ResultadoGuardado = { id: number; conversation_id: string; concepto: string | null; kilocalorias: number };

  let entradas = $state<Entrada[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let errorAccion = $state<string | null>(null);

  // Precargado con lo que más se repite -- ahorra escribirlo en la captura
  // rápida de todos los días; se puede borrar/cambiar sin problema.
  let concepto = $state('Nike Run');
  let calorias = $state('');
  let guardando = $state(false);

  let confirmandoEliminar = $state<number | null>(null);
  let eliminandoId = $state<number | null>(null);

  // Chat de IA: modo "agregar nuevo" (chatAbierto) o "editar" una entrada ya
  // guardada (editandoEntrada, solo posible si tiene conversation_id -- las
  // de la captura manual de siempre nunca la tienen, así que no son
  // reabribles). Mutuamente excluyentes, igual que expandedId/editandoConsumo
  // en ListadoComidas.svelte.
  let chatAbierto = $state(false);
  let editandoEntrada = $state<Entrada | null>(null);

  let guardandoFavoritoId = $state<number | null>(null);
  let favoritoGuardadoIds = $state<Set<number>>(new Set());

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  const entradasDelDia = $derived(
    entradas.filter((e) => e.fecha === fechaObjetivo).slice().sort((a, b) => a.id - b.id)
  );
  const totalDia = $derived(entradasDelDia.reduce((acc, e) => acc + e.kilocalorias, 0));

  // Resumen MUY recortado (solo nombres) de lo que ya se guardó ESE MISMO DÍA,
  // para que al agregar un ejercicio nuevo el usuario pueda aludir a uno
  // anterior sin repetir la descripción completa. Mismo patrón que
  // resumenHermanos en ListadoComidas.svelte (ahí es por comida; acá, por
  // día, que es la unidad de agrupación de ejercicio). Los últimos 10 bastan.
  const contextoHermanos = $derived.by(() => {
    const nombres = entradasDelDia.slice(-10).map((e) => `- ${e.concepto}`);
    return nombres.length > 0 ? nombres.join('\n') : null;
  });

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

  // Métricas de iOS (Atajo → Salud): peso, capturado a mano en /peso o por el
  // Atajo. Best-effort y separado de `entradas`: si este fetch falla,
  // simplemente no se muestra/manda como contexto, sin tumbar el resto de
  // la página -- mismo patrón que ListadoComidas.svelte.
  type MetricaIos = { fecha: string; tipo: string; valor: number };
  let metricasIos = $state<MetricaIos[]>([]);

  $effect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/metricas-ios`);
        if (res.ok) metricasIos = (await res.json()) as MetricaIos[];
      } catch {
        // Best-effort: si falla, simplemente no se muestra/manda como contexto.
      }
    })();
  });

  // Peso capturado ESE DÍA específicamente -- para mostrarlo en el
  // encabezado, igual que "Peso: X kg" en Alimentación Hoy.
  const pesoDelDia = $derived(metricasIos.find((m) => m.fecha === fechaObjetivo && m.tipo === 'peso')?.valor ?? null);

  // Peso más reciente CONOCIDO (no necesariamente el de este día) -- se le
  // pasa al chat de IA como contexto para que no lo tenga que preguntar cada
  // vez que sea relevante para el cálculo. listar_metricas_ios ya viene
  // ordenado fecha DESC, así que el primer match ya es el más nuevo.
  const pesoKg = $derived(metricasIos.find((m) => m.tipo === 'peso')?.valor ?? null);

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
      concepto = 'Nike Run';
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

  function alternarChat() {
    editandoEntrada = null;
    chatAbierto = !chatAbierto;
  }

  // Reabrir la conversación de una entrada ya guardada por el chat (tiene
  // conversation_id) para seguir editándola -- mismo mecanismo que
  // editarViaIA en ListadoComidas.svelte.
  function editarViaIA(e: Entrada) {
    if (editandoEntrada?.id === e.id) {
      editandoEntrada = null;
      return;
    }
    chatAbierto = false;
    editandoEntrada = e;
  }

  // Al guardar desde el chat (agregar nuevo O reabrir uno existente): si el
  // id ya estaba en la lista, lo reemplaza (fue una edición); si no, lo
  // agrega. Mismo patrón que onConsumoGuardado en ListadoComidas.svelte.
  function onGuardadoChat(resultado: ResultadoGuardado, opciones?: { mantenerAbierto?: boolean }) {
    const actualizado: Entrada = {
      id: resultado.id,
      fecha: fechaObjetivo,
      concepto: resultado.concepto ?? '',
      kilocalorias: resultado.kilocalorias,
      created_at: entradas.find((e) => e.id === resultado.id)?.created_at ?? new Date().toISOString(),
      conversation_id: resultado.conversation_id
    };
    const existe = entradas.some((e) => e.id === resultado.id);
    entradas = existe ? entradas.map((e) => (e.id === resultado.id ? actualizado : e)) : [...entradas, actualizado];
    if (opciones?.mantenerAbierto) return;
    chatAbierto = false;
    editandoEntrada = null;
  }

  // Guardar como frecuente una entrada YA guardada (sin pasar por el chat) --
  // mismo botón/idea que guardarConsumoComoFavorito en ListadoComidas.svelte.
  async function guardarEntradaComoFavorito(e: Entrada) {
    if (guardandoFavoritoId !== null || favoritoGuardadoIds.has(e.id)) return;
    guardandoFavoritoId = e.id;
    errorAccion = null;
    try {
      const res = await fetch(`${API_URL}/favoritos-ejercicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: e.concepto, kilocalorias: e.kilocalorias })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      favoritoGuardadoIds = new Set(favoritoGuardadoIds).add(e.id);
    } catch {
      errorAccion = 'No se pudo guardar como frecuente.';
    } finally {
      guardandoFavoritoId = null;
    }
  }
</script>

{#snippet icoChevronIzq()}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" />
  </svg>
{/snippet}

{#snippet icoChevronDer()}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
{/snippet}

<div class="nav-dia">
  <div class="nav-flechas">
    <a href="/ejercicio?fecha={fechaAnterior}" class="nav-flecha" aria-label="Día anterior" title="Día anterior">
      {@render icoChevronIzq()}
    </a>
    {#if puedeAvanzar}
      <a href={hrefSiguiente} class="nav-flecha" aria-label="Día siguiente" title="Día siguiente">
        {@render icoChevronDer()}
      </a>
    {:else}
      <span class="nav-flecha nav-flecha-deshabilitada" aria-hidden="true">
        {@render icoChevronDer()}
      </span>
    {/if}
  </div>
  {#if !esHoy}
    <a href="/ejercicio" class="volver-hoy">Volver a hoy</a>
  {/if}
</div>

<section class="ejercicio-page">
  <h1>Ejercicio</h1>
  <div class="hoy-fila">
    {#if esHoy}
      <p class="hoy">Hoy es: <strong>{fechaLargoObjetivo}</strong></p>
    {:else}
      <p class="hoy">Editando: <strong>{fechaLargoObjetivo}</strong></p>
    {/if}
    {#if pesoDelDia != null}
      <p class="peso-dia">Peso: <strong>{fmt(pesoDelDia)} kg</strong></p>
    {/if}
  </div>

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

    <button type="button" class="toggle-hint" onclick={alternarChat}>
      {chatAbierto ? '− Cerrar' : '+ Preguntarle a la IA'}
    </button>

    {#if chatAbierto}
      <div class="chat-panel">
        <ChatEjercicio fecha={fechaObjetivo} mostrarTitulo={false} {contextoHermanos} {pesoKg} onGuardado={onGuardadoChat} />
      </div>
    {/if}

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
                  class="icon-btn fav-entrada-btn"
                  class:activo={favoritoGuardadoIds.has(e.id)}
                  onclick={() => guardarEntradaComoFavorito(e)}
                  disabled={guardandoFavoritoId !== null || favoritoGuardadoIds.has(e.id)}
                  aria-label={favoritoGuardadoIds.has(e.id) ? 'Ya guardado como frecuente' : 'Guardar como frecuente'}
                  title={favoritoGuardadoIds.has(e.id) ? 'Ya guardado como frecuente' : 'Guardar como frecuente'}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill={favoritoGuardadoIds.has(e.id) ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M12 3.5l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9Z" />
                  </svg>
                </button>
                {#if e.conversation_id}
                  <button
                    type="button"
                    class="icon-btn"
                    class:activo={editandoEntrada?.id === e.id}
                    onclick={() => editarViaIA(e)}
                    aria-label="Editar con el asistente"
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
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                {/if}
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

            {#if editandoEntrada?.id === e.id}
              <div class="chat-panel">
                <ChatEjercicio
                  fecha={fechaObjetivo}
                  mostrarTitulo={false}
                  preConversationId={e.conversation_id}
                  preResultado={{ concepto: e.concepto, kilocalorias: e.kilocalorias }}
                  {pesoKg}
                  onGuardado={onGuardadoChat}
                />
              </div>
            {/if}
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
  .nav-dia {
    max-width: 640px;
    margin: 0 auto 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .nav-flechas {
    display: flex;
    gap: 0.35rem;
  }

  .nav-flecha {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid var(--line);
    color: var(--ink);
    text-decoration: none;
  }

  .nav-flecha:hover {
    background: var(--volt);
    border-color: var(--volt);
    color: var(--volt-ink);
  }

  .nav-flecha-deshabilitada {
    opacity: 0.35;
    pointer-events: none;
  }

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

  .hoy-fila {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
  }

  .hoy {
    margin: 0;
    font-size: 0.95rem;
    color: var(--ink-soft);
  }

  .hoy strong {
    color: var(--ink);
  }

  .peso-dia {
    margin: 0;
    font-size: 0.95rem;
    color: var(--ink-soft);
  }

  .peso-dia strong {
    color: var(--ink);
  }

  .volver-hoy {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--ink);
    text-decoration: none;
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
    border-radius: 6px;
    padding: 0.15rem;
    color: rgba(15, 15, 15, 0.4);
    cursor: pointer;
    display: inline-flex;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .icon-btn:hover:not(:disabled) {
    background: rgba(15, 15, 15, 0.08);
    color: var(--ink);
  }

  .icon-btn:disabled {
    cursor: not-allowed;
  }

  .icon-btn.activo {
    color: #15803d;
  }

  .fav-entrada-btn.activo {
    color: #15803d;
  }

  /* Mismo patrón que "+ Agregar consumo"/"− Cerrar" en ListadoComidas.svelte
     -- abre/cierra el panel del chat de IA sin ser el CTA principal. */
  .toggle-hint {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .toggle-hint:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  .chat-panel {
    padding: 1rem;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid var(--line);
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
