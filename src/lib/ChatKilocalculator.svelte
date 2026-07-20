<script lang="ts">
  // Chat del Kilocalculator (POST /chat de nutricion_api). Se usa embebido
  // dentro de una tarjeta de /comidas (comidaId=id de la comida, así el
  // consumo que se guarde queda asociado a esa comida). Los props comidaId
  // (nullable) y mostrarTitulo se conservan por si se quiere reusar suelto.
  // - Conversación CON ESTADO: guardamos el conversation_id que devuelve el
  //   primer turno y lo reenviamos en cada mensaje siguiente (no reenviamos
  //   historial). Omitirlo = empezar de cero (botón "Reiniciar").
  // - La respuesta tiene DOS MODOS según `requiere_mas_informacion`: pregunta
  //   de seguimiento, o resultado final.
  // - LECTURA TOLERANTE a la transición del back: si aún manda el schema viejo
  //   (totales.kcal / proteinas_g / ...), igual lo leemos.
  import { env } from '$env/dynamic/public';

  type Macros = { kilocalorias: number; proteinas: number; carbohidratos: number; grasas: number };
  type ResultadoGuardado = { platillo: string | null } & Macros;

  let {
    comidaId = null,
    mostrarTitulo = true,
    onGuardado
  }: {
    comidaId?: number | null;
    mostrarTitulo?: boolean;
    // Se llama tras un guardado exitoso — el padre lo usa (p.ej. en
    // /comidas) para cerrar el panel y mostrar el resultado en la tarjeta.
    onGuardado?: (resultado: ResultadoGuardado) => void;
  } = $props();

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  type Respuesta = {
    requiere_mas_informacion: boolean;
    pregunta: string | null;
    platillo: string | null;
    kilocalorias?: number | null;
    proteinas?: number | null;
    carbohidratos?: number | null;
    grasas?: number | null;
    totales?: { kcal: number; proteinas_g: number; carbohidratos_g: number; grasas_g: number } | null;
  };
  type ChatResponse = { conversation_id: string; respuesta: Respuesta };
  type Turn = { role: 'user'; text: string } | { role: 'assistant'; respuesta: Respuesta };

  let conversationId = $state<string | null>(null);
  let turns = $state<Turn[]>([]);
  let input = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  let savingIdx = $state<number | null>(null);
  let savedIdx = $state<Set<number>>(new Set());
  let saveError = $state<string | null>(null);

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  function macros(r: Respuesta): Macros | null {
    if (typeof r.kilocalorias === 'number') {
      return {
        kilocalorias: r.kilocalorias,
        proteinas: r.proteinas ?? 0,
        carbohidratos: r.carbohidratos ?? 0,
        grasas: r.grasas ?? 0
      };
    }
    if (r.totales) {
      return {
        kilocalorias: r.totales.kcal,
        proteinas: r.totales.proteinas_g,
        carbohidratos: r.totales.carbohidratos_g,
        grasas: r.totales.grasas_g
      };
    }
    return null;
  }

  async function send() {
    const mensaje = input.trim();
    if (!mensaje || loading) return;

    turns = [...turns, { role: 'user', text: mensaje }];
    input = '';
    loading = true;
    error = null;

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje, conversation_id: conversationId })
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
        } catch {
          /* respuesta sin cuerpo JSON */
        }
        throw new Error(detail);
      }

      const data = (await res.json()) as ChatResponse;
      conversationId = data.conversation_id;
      turns = [...turns, { role: 'assistant', respuesta: data.respuesta }];
    } catch (e) {
      error =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}. ¿Está corriendo? (npm run dev la levanta)`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      loading = false;
    }
  }

  // Guarda en la base (vía POST /consumos) el resultado final de la burbuja `i`.
  // Manda comidaId para que el consumo quede asociado a esa comida (o null
  // si el chat se usa suelto, fuera de una comida).
  async function guardar(i: number, r: Respuesta) {
    if (savingIdx !== null || savedIdx.has(i) || !conversationId) return;
    const m = macros(r);
    savingIdx = i;
    saveError = null;
    try {
      const res = await fetch(`${API_URL}/consumos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          comida_id: comidaId,
          platillo: r.platillo,
          kilocalorias: m?.kilocalorias ?? null,
          proteinas: m?.proteinas ?? null,
          carbohidratos: m?.carbohidratos ?? null,
          grasas: m?.grasas ?? null
        })
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
        } catch {
          /* sin cuerpo JSON */
        }
        throw new Error(detail);
      }
      savedIdx = new Set(savedIdx).add(i);
      if (m) onGuardado?.({ platillo: r.platillo, ...m });
    } catch (e) {
      saveError =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      savingIdx = null;
    }
  }

  function reset() {
    conversationId = null;
    turns = [];
    error = null;
    input = '';
    savingIdx = null;
    savedIdx = new Set();
    saveError = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }
</script>

<section class="chat">
  <header class="chat-head">
    {#if mostrarTitulo}
      <div>
        <h1>Prueba de la API · Kilocalculator</h1>
        <p class="sub">
          Escribe un platillo y el asistente preguntará lo que falte hasta darte kcal y macros.
        </p>
      </div>
    {:else}
      <div></div>
    {/if}
    <div class="head-right">
      <span class="conv" title="conversation_id de la API">
        {conversationId ? `conv · ${conversationId.slice(0, 12)}…` : 'nueva conversación'}
      </span>
      <button type="button" class="ghost" onclick={reset} disabled={loading || turns.length === 0}>
        Reiniciar
      </button>
    </div>
  </header>

  <div class="log">
    {#if turns.length === 0}
      <div class="empty">
        <p>Prueba con algo como:</p>
        <button type="button" class="suggestion" onclick={() => (input = 'Me comí unos tacos al pastor.')}>
          “Me comí unos tacos al pastor.”
        </button>
      </div>
    {/if}

    {#each turns as turn, i (i)}
      {#if turn.role === 'user'}
        <div class="bubble user">{turn.text}</div>
      {:else if turn.respuesta.requiere_mas_informacion}
        <div class="bubble bot question">
          <span class="tag">Pregunta</span>
          <p>{turn.respuesta.pregunta}</p>
        </div>
      {:else}
        {@const m = macros(turn.respuesta)}
        <div class="bubble bot result">
          <span class="tag">Resultado</span>
          {#if turn.respuesta.platillo}
            <h2>{turn.respuesta.platillo}</h2>
          {/if}

          {#if m}
            <div class="macros">
              <div class="macro kcal">
                <span class="val">{fmt(m.kilocalorias)}</span>
                <span class="unit">kcal</span>
              </div>
              <div class="macro">
                <span class="val">{fmt(m.proteinas)}</span>
                <span class="unit">g proteínas</span>
              </div>
              <div class="macro">
                <span class="val">{fmt(m.carbohidratos)}</span>
                <span class="unit">g carbohidratos</span>
              </div>
              <div class="macro">
                <span class="val">{fmt(m.grasas)}</span>
                <span class="unit">g grasas</span>
              </div>
            </div>

            <div class="save-row">
              {#if savedIdx.has(i)}
                <span class="saved">Guardado ✓</span>
              {:else}
                <button
                  type="button"
                  class="save-btn"
                  onclick={() => guardar(i, turn.respuesta)}
                  disabled={savingIdx !== null}
                >
                  {savingIdx === i ? 'Guardando…' : 'Guardar'}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    {/each}

    {#if loading}
      <div class="bubble bot loading">
        <span class="spinner" aria-hidden="true"></span>
        Calculando… (puede tardar 2–8 s)
      </div>
    {/if}

    {#if error}
      <div class="error">⚠️ {error}</div>
    {/if}

    {#if saveError}
      <div class="error">⚠️ Guardado: {saveError}</div>
    {/if}
  </div>

  <div class="composer">
    <input
      type="text"
      placeholder="¿Qué comiste?"
      bind:value={input}
      onkeydown={onKeydown}
      disabled={loading}
    />
    <button type="button" class="send" onclick={send} disabled={loading || input.trim().length === 0}>
      Enviar
    </button>
  </div>
</section>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 760px;
    margin: 0 auto;
    color: rgba(15, 23, 42, 0.9);
  }

  .chat-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    font-size: 1.35rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .sub {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
    color: rgba(15, 23, 42, 0.6);
  }

  .head-right {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .conv {
    font-size: 0.72rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: rgba(15, 23, 42, 0.55);
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
  }

  .ghost {
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-radius: 8px;
    padding: 0.35rem 0.7rem;
    color: rgba(15, 23, 42, 0.75);
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  }

  .ghost:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.75);
    color: #1e3a8a;
  }

  .ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .log {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    min-height: 120px;
  }

  .empty {
    color: rgba(15, 23, 42, 0.6);
    font-size: 0.9rem;
  }

  .suggestion {
    margin-top: 0.4rem;
    background: rgba(255, 255, 255, 0.55);
    border: 1px dashed rgba(37, 99, 235, 0.4);
    border-radius: 10px;
    padding: 0.5rem 0.8rem;
    color: #1e3a8a;
    cursor: pointer;
    font: inherit;
    font-size: 0.9rem;
  }

  .suggestion:hover {
    background: rgba(255, 255, 255, 0.8);
  }

  .bubble {
    border-radius: 12px;
    padding: 0.7rem 0.95rem;
    border: 1px solid transparent;
    max-width: 100%;
  }

  .bubble.user {
    align-self: flex-end;
    background: rgba(37, 99, 235, 0.16);
    border-color: rgba(37, 99, 235, 0.35);
    color: #1e3a8a;
    max-width: 80%;
  }

  .bubble.bot {
    align-self: flex-start;
    background: rgba(255, 255, 255, 0.55);
    border-color: rgba(15, 23, 42, 0.1);
    width: 100%;
    box-sizing: border-box;
  }

  .tag {
    display: inline-block;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
    color: rgba(15, 23, 42, 0.5);
    margin-bottom: 0.35rem;
  }

  .bubble.question p {
    margin: 0;
  }

  .bubble.result h2 {
    margin: 0 0 0.7rem;
    font-size: 1.05rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .macros {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .macro {
    flex: 1;
    min-width: 92px;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.7rem 0.85rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
  }

  .macro .val {
    font-size: 1.25rem;
    font-weight: 700;
    color: rgba(15, 23, 42, 0.95);
    font-variant-numeric: tabular-nums;
  }

  .macro .unit {
    font-size: 0.72rem;
    color: rgba(15, 23, 42, 0.55);
  }

  .macro.kcal {
    background: rgba(37, 99, 235, 0.14);
    border-color: rgba(37, 99, 235, 0.35);
  }

  .macro.kcal .val {
    color: #1e3a8a;
  }

  .save-row {
    margin-top: 0.7rem;
  }

  .save-btn {
    background: rgba(37, 99, 235, 0.12);
    border: 1px solid rgba(37, 99, 235, 0.4);
    color: #1e3a8a;
    border-radius: 8px;
    padding: 0.4rem 0.9rem;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.18s ease;
  }

  .save-btn:hover:not(:disabled) {
    background: rgba(37, 99, 235, 0.2);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .saved {
    font-size: 0.85rem;
    font-weight: 600;
    color: #15803d;
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: rgba(15, 23, 42, 0.7);
    font-size: 0.9rem;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(37, 99, 235, 0.3);
    border-top-color: #2563eb;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
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

  .composer {
    display: flex;
    gap: 0.6rem;
    position: sticky;
    bottom: 0;
  }

  .composer input {
    flex: 1;
    padding: 0.7rem 0.95rem;
    border-radius: 10px;
    border: 1px solid rgba(15, 23, 42, 0.15);
    background: rgba(255, 255, 255, 0.7);
    color: rgba(15, 23, 42, 0.95);
    font: inherit;
    font-size: 0.95rem;
  }

  .composer input:focus {
    outline: none;
    border-color: rgba(37, 99, 235, 0.55);
    background: rgba(255, 255, 255, 0.9);
  }

  .send {
    padding: 0.7rem 1.3rem;
    border-radius: 10px;
    border: 1px solid rgba(37, 99, 235, 0.5);
    background: rgba(37, 99, 235, 0.85);
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.18s ease;
  }

  .send:hover:not(:disabled) {
    background: #2563eb;
  }

  .send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
