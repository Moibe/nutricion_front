<script lang="ts">
  // Chat del asistente de ejercicio (POST /chat-ejercicio de nutricion_api).
  // Espejo de ChatKilocalculator.svelte (comida) -- mismo protocolo de
  // conversación y mismas funcionalidades (foto, favoritos, editar, guardar),
  // pero para estimar kilocalorías QUEMADAS por una actividad física en vez
  // de consumidas por un platillo: sin macros (no aplican aquí), "concepto"
  // en vez de "platillo", y `fecha` en vez de `comidaId` -- ejercicio no
  // tiene una tabla "padre" que agrupe entradas del día, así que la fecha se
  // manda directo en el guardado.
  // - Conversación CON ESTADO: guardamos el conversation_id que devuelve el
  //   primer turno y lo reenviamos en cada mensaje siguiente (no reenviamos
  //   historial). Omitirlo = empezar de cero (botón "Reiniciar").
  // - La respuesta tiene DOS MODOS según `requiere_mas_informacion`: pregunta
  //   de seguimiento, o resultado final.
  // - EDITAR un ejercicio ya guardado = reabrir su MISMA conversación
  //   (preConversationId + preResultado): se precarga como si fuera el
  //   último turno ya respondido, y al seguir chateando + Guardar, el back
  //   hace upsert por conversation_id — así que ACTUALIZA esa fila en vez de
  //   crear una nueva.
  import { tick } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { putMuyFrecuenteEjercicio, type MuyFrecuenteEjercicio } from '$lib/muyFrecuentes';

  type ResultadoGuardado = { id: number; conversation_id: string; concepto: string | null; kilocalorias: number };
  type Favorito = { id: number; nombre: string; kilocalorias: number | null };
  type PreResultado = { concepto: string | null; kilocalorias: number | null };

  let {
    fecha,
    mostrarTitulo = true,
    onGuardado,
    preConversationId = null,
    preResultado = null,
    contextoHermanos = null,
    pesoKg = null,
    muyFrecuentes = null,
    onAbrirMuyFrecuente,
    onMuyFrecuenteGuardado,
    onElegirResultado,
    etiquetaElegir = 'Guardar'
  }: {
    // A diferencia de comidaId (nullable) en ChatKilocalculator: ejercicio no
    // tiene una fila "padre" que ya traiga la fecha, así que este chat
    // siempre necesita saber a qué día guardar.
    fecha: string;
    mostrarTitulo?: boolean;
    // Se llama tras un guardado exitoso — el padre lo usa para mostrar el
    // resultado en la bitácora, y por default también para cerrar el panel.
    // mantenerAbierto=true (solo lo manda usarFavorito) le pide NO cerrarlo:
    // agregar un frecuente es una acción rápida que se espera repetir varias
    // veces seguidas, así que replegar el panel en cada una sería de más.
    onGuardado?: (resultado: ResultadoGuardado, opciones?: { mantenerAbierto?: boolean }) => void;
    // Para reabrir la conversación de un ejercicio ya guardado en vez de
    // empezar una nueva.
    preConversationId?: string | null;
    preResultado?: PreResultado | null;
    // Resumen recortado (solo nombres) de los OTROS ejercicios ya guardados
    // ESE MISMO DÍA — para una conversación NUEVA (no edición), así el
    // usuario puede aludir a uno anterior sin repetir la descripción completa.
    contextoHermanos?: string | null;
    // Peso corporal más reciente (de /metricas-ios) — se manda como contexto
    // en el primer turno para que el asistente no lo tenga que preguntar.
    // A diferencia de contextoHermanos, SÍ aplica también al editar.
    pesoKg?: number | null;
    // Las 4 tarjetas fijas (null = la pantalla no las maneja, p.ej. dentro del
    // modal de creación). El dueño del estado es /ejercicio, no este chat.
    muyFrecuentes?: (MuyFrecuenteEjercicio | null)[] | null;
    onAbrirMuyFrecuente?: (slot: number) => void;
    onMuyFrecuenteGuardado?: (mf: MuyFrecuenteEjercicio) => void;
    // Modo elegir-resultado: en vez del Guardar que registra el ejercicio del
    // día, cada resultado ofrece un solo botón (etiquetaElegir) que entrega el
    // concepto y las kcal al padre — lo usa el modal de Muy frecuentes.
    onElegirResultado?: (r: { concepto: string; kilocalorias: number }) => Promise<void> | void;
    etiquetaElegir?: string;
  } = $props();

  const API_URL = env.PUBLIC_API_URL ?? '/api';

  type Respuesta = {
    requiere_mas_informacion: boolean;
    pregunta: string | null;
    concepto: string | null;
    kilocalorias: number | null;
  };
  type ChatResponse = { conversation_id: string; respuesta: Respuesta };
  type Turn =
    | { role: 'user'; text: string; imagen?: string }
    | { role: 'assistant'; respuesta: Respuesta };

  // Tope en el cliente para no ni siquiera intentar leer/mandar una foto
  // gigante (el back tiene su propio tope, esto solo evita el viaje inútil).
  const TOPE_IMAGEN_BYTES = 8 * 1024 * 1024;

  const r1 = (n: number | null) => (n == null ? 0 : Math.round(n * 10) / 10);

  function resumenEjercicio(p: PreResultado): string {
    const nombre = p.concepto ?? 'este ejercicio';
    return `${nombre} — ${r1(p.kilocalorias)} kcal`;
  }

  let conversationId = $state<string | null>(preConversationId ?? null);
  let turns = $state<Turn[]>(
    preResultado
      ? [
          {
            role: 'assistant',
            respuesta: {
              requiere_mas_informacion: true,
              pregunta: `Estás editando: ${resumenEjercicio(preResultado)}.\n\n¿Qué deseas modificar?`,
              concepto: null,
              kilocalorias: null
            }
          }
        ]
      : []
  );
  // Contexto a mandar SOLO en el primer mensaje de edición (luego el hilo ya lo tiene).
  let contextoEdicion = $state<string | null>(preResultado ? resumenEjercicio(preResultado) : null);
  // Idem para contextoHermanos, pero de una conversación NUEVA -- no aplica
  // si esto es una edición (preResultado ya trae lo suyo, y son mutuamente
  // excluyentes: no se edita un ejercicio aludiendo a sus propios hermanos).
  let contextoHermanosPendiente = $state<string | null>(preResultado ? null : contextoHermanos);
  // A diferencia de contextoHermanos, este SÍ aplica también al editar --
  // el peso corporal es relevante para el cálculo sin importar el modo.
  let pesoKgPendiente = $state<number | null>(pesoKg);
  let input = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Foto pendiente de enviar (se adjunta al próximo mensaje, o se manda sola).
  let imagenBase64 = $state<string | null>(null);
  let imagenError = $state<string | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let composerEl = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  // Burbujas del historial, por índice del turno (bind:this en el #each) --
  // más la del spinner de "Calculando…", que vive fuera de `turns`.
  let turnoEls = $state<Record<number, HTMLDivElement | null>>({});
  let loadingEl = $state<HTMLDivElement | null>(null);

  // Lleva la vista hasta el elemento indicado, SIN pasarse: 'nearest' hace el
  // mínimo scroll necesario, y reservar la altura del composer (sticky, tapa
  // esa franja) evita que la burbuja quede escondida detrás del campo de
  // escritura. Se mide en vivo porque el composer va en un renglón en
  // desktop y en dos en mobile.
  function scrollHaciaElemento(el: HTMLDivElement | null | undefined) {
    if (!el) return;
    const alto = composerEl?.offsetHeight ?? 0;
    el.style.scrollMarginBottom = `${alto + 12}px`;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Lleva la vista a lo más nuevo de ESTA conversación: el spinner de
  // "Calculando…" mientras está en pantalla, o si no el último turno.
  // A propósito NO se usa scrollTo(document.documentElement.scrollHeight):
  // scrollIntoView sobre el elemento preciso no depende de cuánto más
  // contenido haya en la página (otras entradas de la bitácora, etc.).
  async function scrollAlFondo() {
    await tick();
    scrollHaciaElemento(loading ? loadingEl : turnoEls[turns.length - 1]);
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
  // screenshot, del explorador de archivos, etc.
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

  // Favoritos: ejercicios ya estimados por la IA que el usuario decide
  // "recordar" para reusarlos con un tap (POST directo a /ejercicios/chat,
  // sin pasar por /chat-ejercicio) en vez de volver a describirlos y gastar
  // otra llamada.
  let favoritos = $state<Favorito[]>([]);
  let guardandoFavoritoIdx = $state<number | null>(null);
  let favoritedIdx = $state<Set<number>>(new Set());
  let usandoFavoritoId = $state<number | null>(null);
  // Empieza replegada, mismo motivo que en ChatKilocalculator.
  let favoritosAbiertos = $state(false);

  // Arrastrar un frecuente a una tarjeta, igual que en comida: el chip lleva el
  // id en dataTransfer y la tarjeta lo busca en `favoritos` al soltarlo. MIME
  // propio del lado de ejercicio para que un frecuente de comida no caiga aquí
  // (ni al revés) si algún día conviven en pantalla.
  const MIME_FAVORITO = 'application/x-kcal-favorito-ejercicio';
  const puedeArrastrar = $derived(
    !!muyFrecuentes && !!onAbrirMuyFrecuente && !!onMuyFrecuenteGuardado
  );
  let arrastrandoFavorito = $state(false);
  let slotSobre = $state<number | null>(null);
  let guardandoSlotDrop = $state<number | null>(null);
  let usandoMuyFrecuenteSlot = $state<number | null>(null);
  let eligiendoIdx = $state<number | null>(null);

  $effect(() => {
    // En modo elegir-resultado no se usan los frecuentes: ni se piden.
    if (onElegirResultado) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/favoritos-ejercicio`);
        if (res.ok) favoritos = (await res.json()) as Favorito[];
      } catch {
        // Best-effort: si falla, simplemente no se muestran frecuentes.
      }
    })();
  });

  // Reactivo (no una llamada suelta desde send()): en CUALQUIER momento que
  // loading pase a true baja al fondo -- ver ChatKilocalculator para el
  // porqué (un call site manual corre el riesgo de que algún camino del
  // código lo salte).
  $effect(() => {
    if (loading) scrollAlFondo();
  });

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  async function send() {
    const mensaje = input.trim();
    const imagen = imagenBase64;
    if ((!mensaje && !imagen) || loading) return;

    turns = [...turns, { role: 'user', text: mensaje, imagen: imagen ?? undefined }];
    input = '';
    imagenBase64 = null;
    loading = true;
    error = null;
    // El scroll al fondo lo dispara el $effect que observa `loading` (ver arriba).

    // El contexto (de edición, o de hermanos) se manda solo una vez (primer
    // mensaje); después el hilo de la conversación ya lo tiene.
    const contexto = contextoEdicion;
    contextoEdicion = null;
    const contextoHermanosAMandar = contextoHermanosPendiente;
    contextoHermanosPendiente = null;
    const pesoKgAMandar = pesoKgPendiente;
    pesoKgPendiente = null;

    try {
      const res = await fetch(`${API_URL}/chat-ejercicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje,
          conversation_id: conversationId,
          contexto,
          contexto_hermanos: contextoHermanosAMandar,
          peso_kg: pesoKgAMandar,
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
      // scrollAlFondo ya resuelve solo a qué apuntar: con loading en false,
      // cae al último turno -- la pregunta de seguimiento, el resultado
      // final, o (si hubo error) el mensaje del usuario que quedó sin
      // respuesta.
      void scrollAlFondo();
    }
  }

  // Guarda en la base (vía POST /ejercicios/chat) el resultado final de la
  // burbuja `i`. Upsert por conversation_id: si esto es una edición,
  // actualiza la fila existente en vez de duplicarla.
  async function guardar(i: number, r: Respuesta) {
    if (savingIdx !== null || savedIdx.has(i) || !conversationId || r.kilocalorias == null) return;
    savingIdx = i;
    saveError = null;
    try {
      const res = await fetch(`${API_URL}/ejercicios/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          fecha,
          concepto: r.concepto,
          kilocalorias: r.kilocalorias
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
      onGuardado?.({ id: data.id, conversation_id: conversationId, concepto: r.concepto, kilocalorias: r.kilocalorias });
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

  // Guarda el resultado de la burbuja `i` como favorito (POST
  // /favoritos-ejercicio), independiente de si ya se guardó en la bitácora
  // de hoy — es "recordar el ejercicio", no "registrarlo hoy".
  async function guardarComoFavorito(i: number, r: Respuesta) {
    if (guardandoFavoritoIdx !== null || favoritedIdx.has(i) || !r.concepto || r.kilocalorias == null) return;
    guardandoFavoritoIdx = i;
    saveError = null;
    try {
      const res = await fetch(`${API_URL}/favoritos-ejercicio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: r.concepto, kilocalorias: r.kilocalorias })
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

  // Usar un favorito: salta la IA por completo, POST directo a
  // /ejercicios/chat con las kcal ya guardadas. conversation_id se sintetiza
  // aquí mismo (no hay conversación real de por medio) — tiene que ser único
  // porque el back hace upsert por ese campo, y cada tap es una entrada
  // nueva, no una edición.
  function alIniciarArrastre(e: DragEvent, fav: Favorito) {
    if (!puedeArrastrar || !e.dataTransfer) return;
    e.dataTransfer.setData(MIME_FAVORITO, String(fav.id));
    e.dataTransfer.effectAllowed = 'copy';
    arrastrandoFavorito = true;
  }

  function alTerminarArrastre() {
    arrastrandoFavorito = false;
    slotSobre = null;
  }

  function esArrastreDeFavorito(e: DragEvent) {
    return !!e.dataTransfer?.types.includes(MIME_FAVORITO);
  }

  function alPasarSobreSlot(e: DragEvent, slot: number) {
    if (!esArrastreDeFavorito(e)) return;
    e.preventDefault(); // sin esto el navegador no permite soltar aquí
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    slotSobre = slot;
  }

  function alSalirDeSlot(e: DragEvent, slot: number) {
    // dragleave también dispara al pasar a un hijo de la misma tarjeta: ahí NO
    // se sale, y apagar el resalte parpadearía.
    const destino = e.relatedTarget;
    if (destino instanceof Node && (e.currentTarget as HTMLElement).contains(destino)) return;
    if (slotSobre === slot) slotSobre = null;
  }

  async function alSoltarEnSlot(e: DragEvent, slot: number) {
    if (!esArrastreDeFavorito(e)) return;
    e.preventDefault();
    const id = Number(e.dataTransfer?.getData(MIME_FAVORITO));
    alTerminarArrastre();
    const fav = favoritos.find((f) => f.id === id);
    if (!fav || !onMuyFrecuenteGuardado || guardandoSlotDrop !== null) return;
    guardandoSlotDrop = slot;
    saveError = null;
    try {
      // Un frecuente viejo sin kcal se guarda con 0, igual que se muestra.
      const mf = await putMuyFrecuenteEjercicio(API_URL, slot, {
        nombre: fav.nombre,
        kilocalorias: fav.kilocalorias ?? 0
      });
      onMuyFrecuenteGuardado(mf);
    } catch (err) {
      saveError =
        err instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : err instanceof Error
            ? err.message
            : String(err);
    } finally {
      guardandoSlotDrop = null;
    }
  }

  // Usar una tarjeta: igual que usarFavorito -- salta la IA, POST directo a
  // /ejercicios/chat con un conversation_id sintético y único (cada toque es
  // una entrada nueva, no una edición), y el panel se queda abierto para tocar
  // otra enseguida.
  async function usarMuyFrecuente(mf: MuyFrecuenteEjercicio) {
    if (usandoMuyFrecuenteSlot !== null) return;
    usandoMuyFrecuenteSlot = mf.slot;
    saveError = null;
    try {
      const cid = crypto.randomUUID();
      const res = await fetch(`${API_URL}/ejercicios/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: cid, fecha, concepto: mf.nombre, kilocalorias: mf.kilocalorias })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { id: number };
      onGuardado?.(
        { id: data.id, conversation_id: cid, concepto: mf.nombre, kilocalorias: mf.kilocalorias ?? 0 },
        { mantenerAbierto: true }
      );
    } catch (e) {
      saveError =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      usandoMuyFrecuenteSlot = null;
    }
  }

  // Modo elegir-resultado: entrega el concepto de la burbuja `i` al padre (el
  // modal lo guarda en su tarjeta).
  async function elegirResultado(i: number, r: Respuesta) {
    if (!onElegirResultado || eligiendoIdx !== null || !r.concepto || r.kilocalorias == null) return;
    eligiendoIdx = i;
    saveError = null;
    try {
      await onElegirResultado({ concepto: r.concepto, kilocalorias: r.kilocalorias });
    } catch (e) {
      saveError =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      eligiendoIdx = null;
    }
  }

  async function usarFavorito(fav: Favorito) {
    if (usandoFavoritoId !== null) return;
    usandoFavoritoId = fav.id;
    saveError = null;
    try {
      const cid = crypto.randomUUID();
      const res = await fetch(`${API_URL}/ejercicios/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: cid, fecha, concepto: fav.nombre, kilocalorias: fav.kilocalorias })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { id: number };
      onGuardado?.(
        { id: data.id, conversation_id: cid, concepto: fav.nombre, kilocalorias: fav.kilocalorias ?? 0 },
        { mantenerAbierto: true }
      );
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
      const res = await fetch(`${API_URL}/favoritos-ejercicio/${fav.id}`, { method: 'DELETE' });
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
        <h1>Calculadora de ejercicio</h1>
        <p class="sub">
          Describe qué hiciste y el asistente preguntará lo que falte hasta darte las kcal quemadas.
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
    <!-- Espejo de la rejilla de comida: 4 tarjetas fijas, siempre presentes (a
         diferencia de "Tus frecuentes", que solo aparece si ya guardaste
         alguno), para los ejercicios de casi todos los días. Vacía = abre el
         modal de creación. Llena = al tocarla se registra en la bitácora del
         día, sin IA; el lápiz la reemplaza. -->
    {#if turns.length === 0 && muyFrecuentes && onAbrirMuyFrecuente}
      <div class="empty muy-frecuentes-wrap">
        <span class="muy-frecuentes-label">Muy frecuentes</span>
        <div class="muy-frecuentes-grid" class:acepta={arrastrandoFavorito}>
          {#each muyFrecuentes as mf, slot (slot)}
            {#if mf}
              <div
                class="muy-frecuente-card llena"
                class:usando={usandoMuyFrecuenteSlot === slot || guardandoSlotDrop === slot}
                class:sobre={slotSobre === slot}
                role="group"
                aria-label={`Muy frecuente ${slot + 1}: ${mf.nombre}`}
                ondragover={(e) => alPasarSobreSlot(e, slot)}
                ondragleave={(e) => alSalirDeSlot(e, slot)}
                ondrop={(e) => alSoltarEnSlot(e, slot)}
              >
                <button
                  type="button"
                  class="mf-usar"
                  onclick={() => usarMuyFrecuente(mf)}
                  disabled={usandoMuyFrecuenteSlot !== null}
                  title={`Agregar ${mf.nombre} a este día`}
                >
                  <span class="mf-nombre">{mf.nombre}</span>
                  <span class="mf-kcal">{fmt(mf.kilocalorias ?? 0)} kcal</span>
                </button>
                <button
                  type="button"
                  class="mf-editar"
                  onclick={() => onAbrirMuyFrecuente(slot)}
                  aria-label={`Reemplazar Muy frecuente ${slot + 1} (${mf.nombre})`}
                  title="Reemplazar esta tarjeta"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </div>
            {:else}
              <button
                type="button"
                class="muy-frecuente-card vacia"
                class:usando={guardandoSlotDrop === slot}
                class:sobre={slotSobre === slot}
                onclick={() => onAbrirMuyFrecuente(slot)}
                ondragover={(e) => alPasarSobreSlot(e, slot)}
                ondragleave={(e) => alSalirDeSlot(e, slot)}
                ondrop={(e) => alSoltarEnSlot(e, slot)}
                aria-label={`Crear Muy frecuente ${slot + 1}`}
                title="Crear Muy frecuente"
              ></button>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    {#if turns.length === 0 && favoritos.length > 0}
      <div class="empty favoritos-wrap">
        <button
          type="button"
          class="favoritos-toggle"
          onclick={() => (favoritosAbiertos = !favoritosAbiertos)}
          aria-expanded={favoritosAbiertos}
        >
          <svg
            class="favoritos-estrella"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 3.5l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.2 6-.9Z" />
          </svg>
          Tus frecuentes:
          <svg
            class="favoritos-chevron"
            class:abierto={favoritosAbiertos}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {#if favoritosAbiertos}
          <div class="favoritos-list">
            {#each favoritos as fav (fav.id)}
              <span
                class="favorito-chip"
                class:usando={usandoFavoritoId === fav.id}
                class:arrastrable={puedeArrastrar}
                role="group"
                aria-label={`Frecuente: ${fav.nombre}`}
                draggable={puedeArrastrar}
                ondragstart={(e) => alIniciarArrastre(e, fav)}
                ondragend={alTerminarArrastre}
                title={puedeArrastrar ? 'Arrástralo a una tarjeta de Muy frecuentes' : undefined}
              >
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
        {/if}
      </div>
    {/if}

    {#each turns as turn, i (i)}
      {#if turn.role === 'user'}
        <div class="bubble user" bind:this={turnoEls[i]}>
          {#if turn.imagen}
            <img class="bubble-imagen" src={turn.imagen} alt="Foto del ejercicio enviada" />
          {/if}
          {#if turn.text}{turn.text}{/if}
        </div>
      {:else if turn.respuesta.requiere_mas_informacion}
        <div class="bubble bot question" bind:this={turnoEls[i]}>
          <span class="tag">Pregunta</span>
          <p>{turn.respuesta.pregunta}</p>
        </div>
      {:else}
        <div class="bubble bot result" bind:this={turnoEls[i]}>
          <span class="tag">Resultado</span>
          {#if turn.respuesta.concepto}
            <h2>{turn.respuesta.concepto}</h2>
          {/if}

          {#if turn.respuesta.kilocalorias != null}
            <div class="macros">
              <div class="macro kcal">
                <span class="val">{fmt(turn.respuesta.kilocalorias)}</span>
                <span class="unit">kcal quemadas</span>
              </div>
            </div>

            {#if onElegirResultado}
              <div class="save-row">
                {#if turn.respuesta.concepto && turn.respuesta.kilocalorias != null}
                  <button
                    type="button"
                    class="save-btn"
                    onclick={() => elegirResultado(i, turn.respuesta)}
                    disabled={eligiendoIdx !== null}
                  >
                    {eligiendoIdx === i ? 'Guardando…' : etiquetaElegir}
                  </button>
                {:else}
                  <!-- Un Muy frecuente necesita nombre y kcal; mejor avisarlo que
                       dejar un botón que no hace nada. -->
                  <span class="mf-aviso">El asistente no dio un nombre para el ejercicio: dime cómo se llama y recalculo.</span>
                {/if}
              </div>
            {:else}
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
              {#if turn.respuesta.concepto}
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
          {/if}
        </div>
      {/if}
    {/each}

    {#if loading}
      <div class="bubble bot loading" bind:this={loadingEl}>
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
      aria-label="Adjuntar foto del ejercicio"
      title="Adjuntar foto del ejercicio"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    </button>
    <input
      type="text"
      placeholder="¿Qué ejercicio hiciste?"
      bind:this={inputEl}
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

  /* Rejilla de Muy frecuentes: mismo look exacto que en comida (ChatKilocalculator)
     para que las dos pantallas se sientan iguales. */
  .muy-frecuentes-wrap {
    margin-bottom: 0.9rem;
    padding-bottom: 0.9rem;
    border-bottom: 1px dashed var(--line);
  }

  .muy-frecuentes-label {
    display: block;
    margin-bottom: 0.4rem;
    color: rgba(15, 23, 42, 0.6);
  }

  .muy-frecuentes-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    /* Un poco más angostas que el ancho completo del chat -- se achican sin
       dejar de ser 4 cuadros iguales en fila ni de ajustarse al ancho de
       pantalla (mobile incluido). Centradas (no pegadas a la izquierda) con
       el margin:auto que deja ese 80% sobrante repartido en ambos lados. */
    max-width: 80%;
    margin: 0 auto;
  }

  .muy-frecuente-card {
    position: relative;
    aspect-ratio: 1;
    border-radius: 10px;
    min-width: 0;
  }

  /* Vacía: el hueco con su borde punteado (el look ya aprobado). Ahora es un
     <button>, así que se le quitan los estilos nativos y se le da respuesta al
     pasar el mouse / enfocar con teclado, que es lo que avisa que se puede
     tocar. */
  .muy-frecuente-card.vacia {
    padding: 0;
    border: 1px dashed var(--line);
    background: rgba(15, 23, 42, 0.02);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.18s ease, background 0.18s ease;
  }

  .muy-frecuente-card.vacia:hover,
  .muy-frecuente-card.vacia:focus-visible {
    border-style: solid;
    border-color: var(--ink);
    background: var(--volt);
    outline: none;
  }

  /* Llena: borde sólido y blanca, para que se distinga de un vistazo de las
     vacías. El botón principal ocupa toda la tarjeta; el lápiz va aparte,
     flotando en la esquina (dos <button> no pueden anidarse). */
  .muy-frecuente-card.llena {
    border: 1px solid var(--line);
    background: #ffffff;
    overflow: hidden;
  }

  .muy-frecuente-card.llena.usando {
    opacity: 0.6;
  }

  .mf-usar {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.3rem;
    width: 100%;
    height: 100%;
    padding: 0.6rem 0.65rem;
    box-sizing: border-box;
    border: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.18s ease;
  }

  .mf-usar:hover:not(:disabled),
  .mf-usar:focus-visible {
    background: var(--volt);
    outline: none;
  }

  .mf-usar:disabled {
    cursor: not-allowed;
  }

  /* Hasta 3 renglones y luego puntos suspensivos: el nombre completo viaja en
     el title del botón. */
  .mf-nombre {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding-right: 1.3rem;
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .mf-kcal {
    flex-shrink: 0;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--volt);
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .mf-editar {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: rgba(15, 23, 42, 0.4);
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease;
  }

  .mf-editar:hover,
  .mf-editar:focus-visible {
    background: var(--ink);
    color: #ffffff;
    outline: none;
  }

  /* Arrastre de un frecuente: mientras dura, todas las tarjetas se marcan como
     destinos posibles (borde oscuro) y la que está bajo el cursor se ilumina.
     Los selectores llevan .muy-frecuentes-grid para ganarle en especificidad a
     .llena y .vacia sin recurrir a !important. */
  .muy-frecuentes-grid.acepta .muy-frecuente-card {
    border-color: var(--ink);
  }

  .muy-frecuentes-grid .muy-frecuente-card.sobre {
    border-style: solid;
    border-color: var(--ink);
    background: var(--volt);
  }

  .muy-frecuente-card.vacia.usando {
    opacity: 0.6;
  }

  /* El chip se agarra: la mano abierta avisa que se puede arrastrar. */
  .favorito-chip.arrastrable {
    cursor: grab;
  }

  .favorito-chip.arrastrable:active {
    cursor: grabbing;
  }

  /* Aviso cuando el resultado no trae nombre, en modo elegir. */
  .mf-aviso {
    font-size: 0.78rem;
    color: rgba(15, 23, 42, 0.6);
  }

  .favoritos-wrap {
    margin-bottom: 0.9rem;
    padding-bottom: 0.9rem;
    border-bottom: 1px dashed var(--line);
  }

  .favoritos-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    color: rgba(15, 23, 42, 0.6);
    font: inherit;
    font-size: inherit;
    cursor: pointer;
  }

  .favoritos-toggle:hover {
    color: var(--ink);
  }

  /* Mismo estilo dropdown que .card-chevron en ListadoComidas.svelte:
     apunta hacia abajo replegada, gira 180° hacia arriba abierta. */
  .favoritos-chevron {
    transition: transform 0.18s ease;
  }

  .favoritos-chevron.abierto {
    transform: rotate(180deg);
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
    /* A diferencia de ChatKilocalculator (4 tarjetas), acá solo hay una --
       sin flex:1 se estiraría a todo el ancho del renglón, que se ve raro
       junto a una sola unidad; así queda del tamaño de su contenido. */
    flex: 0 0 auto;
    min-width: 140px;
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

  /* Secundario respecto a Guardar (outline, no volt sólido) — "recordar el
     ejercicio" no compite con "registrarlo hoy". */
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
    /* Los <input> traen min-width:auto, que en un flex item resuelve al ancho
       intrínseco del control: sin esto el campo se niega a encogerse, se
       come todo el renglón y empuja el botón Enviar fuera de la tarjeta. */
    min-width: 0;
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
    flex-shrink: 0;
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

  /* Mismo quiebre responsive que ChatKilocalculator: abajo de 768px el campo
     se lleva un renglón completo y los dos botones se reparten el de abajo. */
  @media (max-width: 768px) {
    .composer {
      flex-wrap: wrap;
    }

    .composer input[type='text'] {
      order: -1;
      flex-basis: 100%;
    }

    .send {
      flex: 1;
    }
  }
</style>
