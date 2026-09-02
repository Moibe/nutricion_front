<script lang="ts">
  // Chat del Kilocalculator (POST /chat de nutricion_api). Se usa embebido
  // dentro de una tarjeta de la página /hoy (comidaId=id de la comida,
  // así el consumo que se guarde queda asociado a esa comida). Los props
  // comidaId (nullable) y mostrarTitulo se conservan por si se quiere reusar
  // suelto.
  // - Conversación CON ESTADO: guardamos el conversation_id que devuelve el
  //   primer turno y lo reenviamos en cada mensaje siguiente (no reenviamos
  //   historial). Omitirlo = empezar de cero (botón "Reiniciar").
  // - La respuesta tiene DOS MODOS según `requiere_mas_informacion`: pregunta
  //   de seguimiento, o resultado final.
  // - LECTURA TOLERANTE a la transición del back: si aún manda el schema viejo
  //   (totales.kcal / proteinas_g / ...), igual lo leemos.
  // - EDITAR un consumo ya guardado = reabrir su MISMA conversación
  //   (preConversationId + preResultado, típicamente desde /hoy o /calendario): se
  //   precarga como si fuera el último turno ya respondido, y al seguir
  //   chateando + Guardar, el back hace upsert por conversation_id — así que
  //   ACTUALIZA esa fila en vez de crear una nueva.
  import { tick } from 'svelte';
  import { env } from '$env/dynamic/public';

  type Macros = { kilocalorias: number; proteinas: number; carbohidratos: number; grasas: number };
  type ResultadoGuardado = { id: number; conversation_id: string; platillo: string | null } & Macros;
  type Favorito = {
    id: number;
    nombre: string;
    kilocalorias: number | null;
    proteinas: number | null;
    carbohidratos: number | null;
    grasas: number | null;
  };
  type PreResultado = {
    platillo: string | null;
    kilocalorias: number | null;
    proteinas: number | null;
    carbohidratos: number | null;
    grasas: number | null;
  };

  let {
    comidaId = null,
    mostrarTitulo = true,
    onGuardado,
    preConversationId = null,
    preResultado = null
  }: {
    comidaId?: number | null;
    mostrarTitulo?: boolean;
    // Se llama tras un guardado exitoso — el padre lo usa (p.ej. en
    // /hoy) para cerrar el panel y mostrar el resultado en la tarjeta.
    onGuardado?: (resultado: ResultadoGuardado) => void;
    // Para reabrir la conversación de un consumo ya guardado en vez de
    // empezar una nueva.
    preConversationId?: string | null;
    preResultado?: PreResultado | null;
  } = $props();

  const API_URL = env.PUBLIC_API_URL ?? '/api';

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
  type Turn =
    | { role: 'user'; text: string; imagen?: string }
    | { role: 'assistant'; respuesta: Respuesta };

  // Tope en el cliente para no ni siquiera intentar leer/mandar una foto
  // gigante (el back tiene su propio tope, esto solo evita el viaje inútil).
  const TOPE_IMAGEN_BYTES = 8 * 1024 * 1024;

  // Modo edición (viene preResultado): reusa el conversation_id original para
  // que al Guardar el back haga upsert sobre la MISMA fila, y arranca con un
  // saludo de edición generado localmente (sin gastar tokens). El contexto del
  // consumo se inyecta en el back con el primer mensaje del usuario, porque el
  // hilo de OpenAI ya no conserva ese contexto de forma confiable.
  const r1 = (n: number | null) => (n == null ? 0 : Math.round(n * 10) / 10);

  function resumenConsumo(p: PreResultado): string {
    const nombre = p.platillo ?? 'este consumo';
    return `${nombre} — ${r1(p.kilocalorias)} kcal, ${r1(p.proteinas)} g proteínas, ${r1(p.carbohidratos)} g carbohidratos, ${r1(p.grasas)} g grasas`;
  }

  let conversationId = $state<string | null>(preConversationId ?? null);
  let turns = $state<Turn[]>(
    preResultado
      ? [
          {
            role: 'assistant',
            respuesta: {
              requiere_mas_informacion: true,
              pregunta: `Estás editando: ${resumenConsumo(preResultado)}.\n\n¿Qué deseas modificar?`,
              platillo: null,
              kilocalorias: null,
              proteinas: null,
              carbohidratos: null,
              grasas: null
            }
          }
        ]
      : []
  );
  // Contexto a mandar SOLO en el primer mensaje de edición (luego el hilo ya lo tiene).
  let contextoEdicion = $state<string | null>(preResultado ? resumenConsumo(preResultado) : null);
  let input = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Foto pendiente de enviar (se adjunta al próximo mensaje, o se manda sola).
  let imagenBase64 = $state<string | null>(null);
  let imagenError = $state<string | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let composerEl = $state<HTMLDivElement | null>(null);

  // Tras mandar un mensaje (o recibir la respuesta), llevar la vista hasta el
  // composer — si no, en una conversación larga el usuario se queda viendo
  // donde estaba antes y tiene que scrollear a mano para ver lo nuevo.
  async function scrollAlFondo() {
    await tick();
    composerEl?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function elegirImagen() {
    fileInputEl?.click();
  }

  // Compartido entre "elegir archivo" y "pegar" (Ctrl+V) — misma validación y
  // lectura a data URI para cualquiera de las dos formas de adjuntar la foto.
  function procesarImagenArchivo(archivo: File) {
    imagenError = null;
    if (!archivo.type.startsWith('image/')) {
      imagenError = 'Ese archivo no es una imagen.';
      return;
    }
    if (archivo.size > TOPE_IMAGEN_BYTES) {
      imagenError = 'La foto pesa demasiado (máx. 8 MB).';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      imagenBase64 = reader.result as string;
    };
    reader.onerror = () => {
      imagenError = 'No se pudo leer la imagen.';
    };
    reader.readAsDataURL(archivo);
  }

  function onImagenSeleccionada(e: Event) {
    const archivo = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
    // Limpiar el input ya — así elegir el MISMO archivo dos veces seguidas
    // vuelve a disparar el evento change.
    (e.currentTarget as HTMLInputElement).value = '';
    if (archivo) procesarImagenArchivo(archivo);
  }

  // Pegar una imagen (Ctrl+V) directo en el campo de texto — copiada de un
  // screenshot, del explorador de archivos, etc. Si el portapapeles trae una
  // imagen se adjunta igual que con el botón de cámara; si trae texto, se
  // deja el comportamiento normal del input.
  function onPegarImagen(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const archivo = item.getAsFile();
        if (archivo) {
          e.preventDefault();
          procesarImagenArchivo(archivo);
        }
        return;
      }
    }
  }

  function quitarImagen() {
    imagenBase64 = null;
    imagenError = null;
  }

  let savingIdx = $state<number | null>(null);
  let savedIdx = $state<Set<number>>(new Set());
  let saveError = $state<string | null>(null);

  // Favoritos: platillos ya calculados por la IA que el usuario decide
  // "recordar" para reusarlos con un tap (POST directo a /consumos, sin pasar
  // por /chat) en vez de volver a describirlos y gastar otra llamada.
  let favoritos = $state<Favorito[]>([]);
  let guardandoFavoritoIdx = $state<number | null>(null);
  let favoritedIdx = $state<Set<number>>(new Set());
  let usandoFavoritoId = $state<number | null>(null);

  $effect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/favoritos`);
        if (res.ok) favoritos = (await res.json()) as Favorito[];
      } catch {
        // Best-effort: si falla, simplemente no se muestran frecuentes.
      }
    })();
  });

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
    const imagen = imagenBase64;
    if ((!mensaje && !imagen) || loading) return;

    turns = [...turns, { role: 'user', text: mensaje, imagen: imagen ?? undefined }];
    input = '';
    imagenBase64 = null;
    loading = true;
    error = null;
    void scrollAlFondo();

    // El contexto de edición se manda solo una vez (primer mensaje); después
    // el hilo de la conversación ya lo tiene.
    const contexto = contextoEdicion;
    contextoEdicion = null;

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje,
          conversation_id: conversationId,
          contexto,
          imagen_base64: imagen
        })
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
      void scrollAlFondo();
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
      const data = (await res.json()) as { id: number };
      savedIdx = new Set(savedIdx).add(i);
      if (m) onGuardado?.({ id: data.id, conversation_id: conversationId, platillo: r.platillo, ...m });
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

  // Guarda el resultado de la burbuja `i` como favorito (POST /favoritos),
  // independiente de si ya se guardó como consumo de hoy — es "recordar la
  // receta", no "registrarla hoy".
  async function guardarComoFavorito(i: number, r: Respuesta) {
    if (guardandoFavoritoIdx !== null || favoritedIdx.has(i) || !r.platillo) return;
    const m = macros(r);
    if (!m) return;
    guardandoFavoritoIdx = i;
    saveError = null;
    try {
      const res = await fetch(`${API_URL}/favoritos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: r.platillo, ...m })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const nuevo = (await res.json()) as Favorito;
      favoritos = [nuevo, ...favoritos];
      favoritedIdx = new Set(favoritedIdx).add(i);
    } catch (e) {
      saveError =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      guardandoFavoritoIdx = null;
    }
  }

  // Usar un favorito: salta la IA por completo, POST directo a /consumos con
  // las macros ya guardadas. conversation_id se sintetiza aquí mismo (no hay
  // conversación real de por medio) — tiene que ser único porque el back
  // hace upsert por ese campo, y cada tap es un consumo nuevo, no una edición.
  async function usarFavorito(fav: Favorito) {
    if (usandoFavoritoId !== null) return;
    usandoFavoritoId = fav.id;
    saveError = null;
    try {
      const cid = crypto.randomUUID();
      const res = await fetch(`${API_URL}/consumos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: cid,
          comida_id: comidaId,
          platillo: fav.nombre,
          kilocalorias: fav.kilocalorias,
          proteinas: fav.proteinas,
          carbohidratos: fav.carbohidratos,
          grasas: fav.grasas
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { id: number };
      onGuardado?.({
        id: data.id,
        conversation_id: cid,
        platillo: fav.nombre,
        kilocalorias: fav.kilocalorias ?? 0,
        proteinas: fav.proteinas ?? 0,
        carbohidratos: fav.carbohidratos ?? 0,
        grasas: fav.grasas ?? 0
      });
    } catch (e) {
      saveError =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      usandoFavoritoId = null;
    }
  }

  async function eliminarFavorito(fav: Favorito) {
    const anteriores = favoritos;
    favoritos = favoritos.filter((f) => f.id !== fav.id);
    try {
      const res = await fetch(`${API_URL}/favoritos/${fav.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      favoritos = anteriores;
    }
  }

  function reset() {
    conversationId = null;
    turns = [];
    error = null;
    input = '';
    imagenBase64 = null;
    imagenError = null;
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
      {#if favoritos.length > 0}
        <div class="empty favoritos-wrap">
          <p>Tus frecuentes:</p>
          <div class="favoritos-list">
            {#each favoritos as fav (fav.id)}
              <span class="favorito-chip" class:usando={usandoFavoritoId === fav.id}>
                <button
                  type="button"
                  class="favorito-btn"
                  onclick={() => usarFavorito(fav)}
                  disabled={usandoFavoritoId !== null}
                >
                  {fav.nombre}{fav.kilocalorias != null ? ` · ${fmt(fav.kilocalorias)} kcal` : ''}
                  {usandoFavoritoId === fav.id ? '…' : ''}
                </button>
                <button
                  type="button"
                  class="favorito-borrar"
                  onclick={() => eliminarFavorito(fav)}
                  disabled={usandoFavoritoId !== null}
                  aria-label={`Quitar ${fav.nombre} de frecuentes`}
                  title="Quitar de frecuentes"
                >
                  ×
                </button>
              </span>
            {/each}
          </div>
        </div>
      {/if}
      <div class="empty">
        <p>Prueba con algo como:</p>
        <button type="button" class="suggestion" onclick={() => (input = 'Me comí unos tacos al pastor.')}>
          "Me comí unos tacos al pastor."
        </button>
      </div>
    {/if}

    {#each turns as turn, i (i)}
      {#if turn.role === 'user'}
        <div class="bubble user">
          {#if turn.imagen}
            <img class="bubble-imagen" src={turn.imagen} alt="Foto del platillo enviada" />
          {/if}
          {#if turn.text}{turn.text}{/if}
        </div>
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
                <span class="guardar-flecha guardar-flecha-in" aria-hidden="true">»</span>
                <button
                  type="button"
                  class="save-btn"
                  onclick={() => guardar(i, turn.respuesta)}
                  disabled={savingIdx !== null}
                >
                  {savingIdx === i ? 'Guardando…' : 'Guardar'}
                </button>
                <span class="guardar-flecha guardar-flecha-out" aria-hidden="true">«</span>
              {/if}
              {#if turn.respuesta.platillo}
                <button
                  type="button"
                  class="fav-btn"
                  class:activo={favoritedIdx.has(i)}
                  onclick={() => guardarComoFavorito(i, turn.respuesta)}
                  disabled={guardandoFavoritoIdx !== null || favoritedIdx.has(i)}
                  title="Guardar como frecuente para no volver a escribirlo"
                >
                  {favoritedIdx.has(i) ? '★ Frecuente' : guardandoFavoritoIdx === i ? '☆ …' : '☆ Frecuente'}
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

  {#if imagenError}
    <div class="error">⚠️ {imagenError}</div>
  {/if}

  {#if imagenBase64}
    <div class="imagen-pendiente">
      <img src={imagenBase64} alt="Foto a enviar" />
      <button type="button" class="imagen-quitar" onclick={quitarImagen} aria-label="Quitar foto" title="Quitar foto">
        ×
      </button>
    </div>
  {/if}

  <div class="composer" bind:this={composerEl}>
    <input
      bind:this={fileInputEl}
      type="file"
      accept="image/*"
      capture="environment"
      class="imagen-input-oculto"
      onchange={onImagenSeleccionada}
    />
    <button
      type="button"
      class="adjuntar-btn"
      onclick={elegirImagen}
      disabled={loading}
      aria-label="Adjuntar foto del platillo"
      title="Adjuntar foto del platillo"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    </button>
    <input
      type="text"
      placeholder="¿Qué comiste?"
      bind:value={input}
      onkeydown={onKeydown}
      onpaste={onPegarImagen}
      disabled={loading}
    />
    <button
      type="button"
      class="send"
      onclick={send}
      disabled={loading || (input.trim().length === 0 && !imagenBase64)}
    >
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
    background: var(--volt);
    border-color: var(--volt);
    color: var(--volt-ink);
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
    background: #ffffff;
    border: 1px dashed rgba(15, 15, 15, 0.35);
    border-radius: 10px;
    padding: 0.5rem 0.8rem;
    color: var(--ink);
    cursor: pointer;
    font: inherit;
    font-size: 0.9rem;
  }

  .suggestion:hover {
    background: var(--volt);
    border-color: var(--volt);
    border-style: solid;
  }

  .favoritos-wrap {
    margin-bottom: 0.9rem;
    padding-bottom: 0.9rem;
    border-bottom: 1px dashed var(--line);
  }

  .favoritos-list {
    margin-top: 0.4rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .favorito-chip {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: #ffffff;
    overflow: hidden;
  }

  .favorito-chip.usando {
    opacity: 0.6;
  }

  .favorito-btn {
    background: transparent;
    border: none;
    padding: 0.4rem 0.7rem;
    color: var(--ink);
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
  }

  .favorito-btn:hover:not(:disabled) {
    background: var(--volt);
  }

  .favorito-btn:disabled {
    cursor: not-allowed;
  }

  .favorito-borrar {
    background: transparent;
    border: none;
    border-left: 1px solid var(--line);
    padding: 0.4rem 0.55rem;
    color: rgba(15, 23, 42, 0.4);
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
  }

  .favorito-borrar:hover:not(:disabled) {
    color: #dc2626;
  }

  .favorito-borrar:disabled {
    cursor: not-allowed;
  }

  .bubble {
    border-radius: 12px;
    padding: 0.7rem 0.95rem;
    border: 1px solid transparent;
    max-width: 100%;
  }

  /* Burbuja propia en negro sólido (como el resto de los "esto está
     seleccionado/activo" de la app), no un tinte azul. */
  .bubble.user {
    align-self: flex-end;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: var(--ink);
    border-color: var(--ink);
    color: #ffffff;
    max-width: 80%;
  }

  .bubble-imagen {
    display: block;
    max-width: 100%;
    max-height: 220px;
    border-radius: 8px;
    object-fit: cover;
  }

  .bubble.bot {
    align-self: flex-start;
    background: #ffffff;
    border-color: var(--line);
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
    white-space: pre-line;
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
    background: #ffffff;
    border: 1px solid var(--line);
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
    background: var(--volt);
    border-color: var(--volt);
  }

  .macro.kcal .val {
    color: var(--ink);
  }

  .save-row {
    margin-top: 0.7rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* Mismo patrón que "subtab-arrow-indicator" en buzzword-agentes-ui (ya
     reusado en Registro Diario para la fila de hoy): un glifo que pulsa
     acercándose a lo que señala — acá, el botón de Guardar, para que no se
     pase por alto. Solo vive mientras el botón existe (desaparece junto con
     él al guardar). */
  .guardar-flecha {
    display: inline-flex;
    color: var(--ink);
    font-weight: 900;
    user-select: none;
  }

  .guardar-flecha-in {
    animation: guardar-flecha-in-pulso 1.2s ease-in-out infinite;
  }

  .guardar-flecha-out {
    animation: guardar-flecha-out-pulso 1.2s ease-in-out infinite;
  }

  @keyframes guardar-flecha-in-pulso {
    0%,
    100% {
      transform: translateX(0);
      opacity: 0.8;
    }
    50% {
      transform: translateX(4px);
      opacity: 1;
    }
  }

  @keyframes guardar-flecha-out-pulso {
    0%,
    100% {
      transform: translateX(0);
      opacity: 0.8;
    }
    50% {
      transform: translateX(-4px);
      opacity: 1;
    }
  }

  /* CTA principal del panel de resultado: volt sólido + texto negro. */
  .save-btn {
    background: var(--volt);
    border: 1px solid var(--volt);
    color: var(--ink);
    border-radius: 8px;
    padding: 0.4rem 0.9rem;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: filter 0.18s ease;
  }

  .save-btn:hover:not(:disabled) {
    filter: brightness(0.94);
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

  /* Secundario respecto a Guardar (outline, no volt sólido) — "recordar la
     receta" no compite con "registrarla hoy". */
  .fav-btn {
    background: #ffffff;
    border: 1px solid var(--line);
    color: var(--ink);
    border-radius: 8px;
    padding: 0.4rem 0.7rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition: filter 0.18s ease;
  }

  .fav-btn:hover:not(:disabled) {
    filter: brightness(0.96);
  }

  .fav-btn:disabled {
    cursor: not-allowed;
  }

  .fav-btn.activo {
    background: rgba(21, 128, 61, 0.08);
    border-color: rgba(21, 128, 61, 0.3);
    color: #15803d;
    opacity: 1;
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
    border: 2px solid rgba(15, 15, 15, 0.15);
    border-top-color: var(--ink);
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

  .imagen-pendiente {
    position: relative;
    display: inline-block;
    align-self: flex-start;
  }

  .imagen-pendiente img {
    display: block;
    max-height: 96px;
    border-radius: 10px;
    border: 1px solid var(--line);
  }

  .imagen-quitar {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--ink);
    color: #ffffff;
    border: 2px solid #ffffff;
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
  }

  .imagen-input-oculto {
    display: none;
  }

  /* Mismo tratamiento visual que .ghost — secundario, no compite con Enviar. */
  .adjuntar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 42px;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--ink);
    cursor: pointer;
    transition: filter 0.18s ease;
  }

  .adjuntar-btn:hover:not(:disabled) {
    filter: brightness(0.96);
  }

  .adjuntar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .composer {
    display: flex;
    gap: 0.6rem;
    position: sticky;
    bottom: 0;
    /* Sin fondo sólido, el texto de las burbujas anteriores se veía a
       través/detrás del input al hacer scroll con una conversación larga —
       este fondo + padding lo tapa y separa visualmente del log. */
    background: #ffffff;
    padding-top: 0.6rem;
    margin-top: -0.3rem;
  }

  .composer input {
    flex: 1;
    padding: 0.7rem 0.95rem;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: #ffffff;
    color: var(--ink);
    font: inherit;
    font-size: 0.95rem;
  }

  .composer input:focus {
    outline: none;
    border-color: var(--ink);
  }

  /* CTA principal del composer: mismo volt sólido que .save-btn. */
  .send {
    padding: 0.7rem 1.3rem;
    border-radius: 10px;
    border: 1px solid var(--volt);
    background: var(--volt);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: filter 0.18s ease;
  }

  .send:hover:not(:disabled) {
    filter: brightness(0.94);
  }

  .send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
