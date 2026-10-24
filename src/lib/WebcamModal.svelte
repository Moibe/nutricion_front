<script lang="ts">
  // Tomar la foto con la webcam (escritorio). Vista en vivo -> "Tomar foto" ->
  // vista fija con "Repetir" / "Usar foto". Entrega un File JPEG: quien lo abre
  // lo pasa por la MISMA validación y lectura que una foto elegida de archivo,
  // así que de aquí en adelante el flujo es idéntico.
  //
  // Lo más importante de una webcam es apagarla: la luz de la cámara no debe
  // quedar prendida después de cerrar. `detener()` corre en TODAS las salidas
  // (cerrar, Esc, usar la foto, destruirse el componente) y hay una guardia
  // contra la carrera "cierro el modal antes de que el navegador conteste el
  // permiso": el stream que llegue tarde se apaga al llegar.
  import { onMount, tick } from 'svelte';
  import { portal } from '$lib/portal';

  let {
    onCapturar,
    onCerrar,
    onElegirArchivo
  }: {
    onCapturar: (archivo: File) => void;
    onCerrar: () => void;
    // Salida alternativa cuando la webcam no sirve (sin permiso, sin cámara,
    // ocupada): abrir el selector de archivos de siempre.
    onElegirArchivo?: () => void;
  } = $props();

  type Estado = 'iniciando' | 'en-vivo' | 'capturada' | 'error';
  let estado = $state<Estado>('iniciando');
  let mensajeError = $state<string | null>(null);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let dialogEl = $state<HTMLDivElement | null>(null);
  let camaras = $state<{ id: string; etiqueta: string }[]>([]);
  let camaraActual = $state('');
  // La foto recién tomada: el Blob (lo que se manda) y su URL (lo que se ve).
  let captura = $state<Blob | null>(null);
  let fotoUrl = $state<string | null>(null);

  let stream: MediaStream | null = null;
  // Cada arranque de la cámara lleva un número; un arranque viejo que termine
  // después de uno más nuevo (cambiar de cámara rápido, cerrar) se descarta.
  let intento = 0;
  let destruido = false;
  let focoPrevio: HTMLElement | null = null;

  const CLAVE_CAMARA = 'kcal.webcam.deviceId';

  function camaraGuardada(): string | null {
    try {
      return localStorage.getItem(CLAVE_CAMARA);
    } catch {
      return null;
    }
  }

  function guardarCamara(id: string) {
    try {
      localStorage.setItem(CLAVE_CAMARA, id);
    } catch {
      // Sin almacenamiento (modo privado, bloqueado): simplemente no se recuerda.
    }
  }

  function detener() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (videoEl) videoEl.srcObject = null;
  }

  function liberarFoto() {
    if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    fotoUrl = null;
    captura = null;
  }

  function mensajeDeError(e: unknown): string {
    const nombre = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
    switch (nombre) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'No hay permiso para usar la cámara. Permítela desde el candado de la barra de direcciones (Cámara → Permitir) y vuelve a intentar.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No se encontró ninguna cámara conectada.';
      case 'NotReadableError':
      case 'TrackStartError':
      case 'AbortError':
        return 'No se pudo abrir la cámara: puede que otra aplicación la esté usando. Ciérrala y vuelve a intentar.';
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return 'La cámara elegida no está disponible.';
      case 'SecurityError':
        return 'El navegador no permite usar la cámara en esta página.';
      default:
        return 'No se pudo abrir la cámara.';
    }
  }

  const VIDEO_BASE = { width: { ideal: 1280 }, height: { ideal: 720 } };

  async function iniciar(idPreferido: string | null) {
    const mi = ++intento;
    detener();
    liberarFoto();
    estado = 'iniciando';
    mensajeError = null;
    try {
      let obtenido: MediaStream;
      try {
        obtenido = await navigator.mediaDevices.getUserMedia({
          video: idPreferido ? { ...VIDEO_BASE, deviceId: { exact: idPreferido } } : VIDEO_BASE,
          audio: false
        });
      } catch (e) {
        // La cámara que se había elegido ya no está (se desconectó): se
        // reintenta con la predeterminada en vez de mostrar un error.
        if (idPreferido && e && typeof e === 'object' && (e as { name?: string }).name === 'OverconstrainedError') {
          obtenido = await navigator.mediaDevices.getUserMedia({ video: VIDEO_BASE, audio: false });
        } else {
          throw e;
        }
      }
      // Llegó tarde: el modal se cerró, o ya hay un arranque más nuevo. Se
      // apaga aquí mismo -- nadie más sabe de este stream.
      if (destruido || mi !== intento) {
        obtenido.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = obtenido;
      if (videoEl) {
        videoEl.srcObject = obtenido;
        // play() puede rechazar si el stream se reemplaza a media carga; no es un error.
        await videoEl.play().catch(() => {});
      }
      camaraActual = obtenido.getVideoTracks()[0]?.getSettings().deviceId ?? '';
      try {
        // Las etiquetas solo existen una vez concedido el permiso: por eso la
        // lista se pide DESPUÉS de abrir la cámara.
        const lista = await navigator.mediaDevices.enumerateDevices();
        camaras = lista
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({ id: d.deviceId, etiqueta: d.label || `Cámara ${i + 1}` }));
      } catch {
        camaras = [];
      }
      if (destruido || mi !== intento) return;
      estado = 'en-vivo';
    } catch (e) {
      if (destruido || mi !== intento) return;
      detener();
      estado = 'error';
      mensajeError = mensajeDeError(e);
    }
  }

  function tomarFoto() {
    const v = videoEl;
    // videoWidth es 0 hasta que llega el primer cuadro: no hay nada que capturar.
    if (!v || estado !== 'en-vivo' || !v.videoWidth) return;
    const lienzo = document.createElement('canvas');
    lienzo.width = v.videoWidth;
    lienzo.height = v.videoHeight;
    const ctx = lienzo.getContext('2d');
    if (!ctx) {
      mensajeError = 'No se pudo capturar la imagen.';
      return;
    }
    // Sin espejo: lo que se muestra es lo que se manda (importa para leer texto
    // de la pantalla de un reloj o una app de ejercicio).
    ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
    mensajeError = null;
    v.pause();
    estado = 'capturada';
    lienzo.toBlob(
      (blob) => {
        if (destruido) return;
        if (!blob) {
          mensajeError = 'No se pudo capturar la imagen.';
          v.play().catch(() => {});
          estado = 'en-vivo';
          return;
        }
        captura = blob;
        fotoUrl = URL.createObjectURL(blob);
      },
      'image/jpeg',
      0.92
    );
  }

  function repetir() {
    liberarFoto();
    mensajeError = null;
    videoEl?.play().catch(() => {});
    estado = 'en-vivo';
  }

  function usarFoto() {
    if (!captura) return;
    const archivo = new File([captura], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' });
    detener();
    onCapturar(archivo);
  }

  function cambiarCamara(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value;
    guardarCamara(id);
    void iniciar(id);
  }

  const SELECTOR_FOCO =
    'button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // En fase de CAPTURA y con stopPropagation: este modal puede abrirse desde
  // dentro de otro (el de Muy frecuente, con el chat adentro), cuyos propios
  // Esc y Tab van en la fase de burbuja de window. Sin esto, un Esc aquí
  // también cerraría el modal de abajo y tiraría su conversación, y su trampa
  // de foco le quitaría el foco a este.
  function alTeclear(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCerrar();
      return;
    }
    if (e.key !== 'Tab' || !dialogEl) return;
    e.stopPropagation();
    const foco = [...dialogEl.querySelectorAll<HTMLElement>(SELECTOR_FOCO)];
    if (foco.length === 0) {
      e.preventDefault();
      dialogEl.focus();
      return;
    }
    const primero = foco[0];
    const ultimo = foco[foco.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || activo === dialogEl)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && activo === ultimo) {
      e.preventDefault();
      primero.focus();
    } else if (!dialogEl.contains(activo)) {
      e.preventDefault();
      primero.focus();
    }
  }

  // Cada fase lleva el foco a su acción principal -- salvo que el usuario ya
  // esté en otro control del diálogo (p. ej. cambiando de cámara con las
  // flechas del select), a quien no se le debe arrebatar.
  $effect(() => {
    void estado;
    void captura;
    void tick().then(() => {
      if (destruido || !dialogEl) return;
      const activo = document.activeElement;
      const libre = !activo || activo === document.body || activo === dialogEl || !dialogEl.contains(activo);
      if (!libre) return;
      dialogEl.querySelector<HTMLElement>('[data-principal]:not([disabled])')?.focus();
    });
  });

  onMount(() => {
    focoPrevio = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.addEventListener('keydown', alTeclear, true);
    dialogEl?.focus();
    void iniciar(camaraGuardada());
    return () => {
      destruido = true;
      intento++;
      window.removeEventListener('keydown', alTeclear, true);
      detener();
      liberarFoto();
      // Devuelve el foco a lo que abrió el modal, si sigue ahí.
      if (focoPrevio?.isConnected) focoPrevio.focus();
    };
  });
</script>

<div class="wc-overlay" use:portal>
  <div
    class="wc-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="wc-titulo"
    tabindex="-1"
    bind:this={dialogEl}
  >
    <header class="wc-head">
      <h2 id="wc-titulo">Tomar foto con la webcam</h2>
      <button type="button" class="wc-cerrar" onclick={onCerrar} aria-label="Cerrar" title="Cerrar (Esc)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="wc-cuerpo">
      <div class="wc-visor">
        <!-- El <video> siempre está en el DOM: hay que poder asignarle el stream
             en cuanto llegue, aunque todavía se esté mostrando el "Iniciando". -->
        <video
          bind:this={videoEl}
          class="wc-video"
          class:oculto={estado === 'capturada' || estado === 'error'}
          autoplay
          playsinline
          muted
        ></video>
        {#if fotoUrl}
          <img class="wc-foto" src={fotoUrl} alt="Foto capturada con la webcam" />
        {/if}
        {#if estado === 'iniciando'}
          <div class="wc-estado" role="status">
            Iniciando cámara…
            <span class="wc-ayuda">Si el navegador lo pide, permite el acceso a la cámara.</span>
          </div>
        {:else if estado === 'error'}
          <div class="wc-estado wc-estado-error" role="alert">{mensajeError}</div>
        {/if}
      </div>

      {#if estado !== 'error' && mensajeError}
        <p class="wc-aviso" role="alert">{mensajeError}</p>
      {/if}

      {#if camaras.length > 1 && estado !== 'error'}
        <label class="wc-camaras">
          <span>Cámara</span>
          <select value={camaraActual} onchange={cambiarCamara} disabled={estado === 'iniciando'}>
            {#each camaras as c (c.id)}
              <option value={c.id}>{c.etiqueta}</option>
            {/each}
          </select>
        </label>
      {/if}

      <div class="wc-acciones">
        {#if estado === 'capturada'}
          <button type="button" class="wc-secundario" onclick={repetir}>Repetir</button>
          <button type="button" class="wc-primario" data-principal onclick={usarFoto} disabled={!captura}>
            Usar foto
          </button>
        {:else if estado === 'error'}
          <button type="button" class="wc-secundario" onclick={() => iniciar(camaraGuardada())}>Reintentar</button>
          {#if onElegirArchivo}
            <button type="button" class="wc-primario" data-principal onclick={onElegirArchivo}>
              Elegir archivo
            </button>
          {/if}
        {:else}
          <button
            type="button"
            class="wc-primario"
            data-principal
            onclick={tomarFoto}
            disabled={estado !== 'en-vivo'}
          >
            Tomar foto
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  /* Mismo lenguaje que MuyFrecuenteModal (overlay, tarjeta blanca, cabecera con
     X). z-index 200: este modal puede abrirse desde dentro de aquel (z-index
     100) y tiene que quedar encima. */
  .wc-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(15, 15, 15, 0.5);
  }

  .wc-dialog {
    display: flex;
    flex-direction: column;
    width: min(720px, 100%);
    max-height: min(92vh, 100%);
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 18px 50px rgba(15, 15, 15, 0.3);
    overflow: hidden;
    color: var(--ink);
  }

  .wc-dialog:focus {
    outline: none;
  }

  .wc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.3rem;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
  }

  .wc-cerrar {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: #ffffff;
    color: var(--ink-soft);
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  }

  .wc-cerrar:hover {
    background: var(--volt);
    border-color: var(--volt);
    color: var(--volt-ink);
  }

  .wc-cuerpo {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    min-height: 0;
    padding: 1.1rem 1.3rem 1.3rem;
    overflow-y: auto;
  }

  /* Negro detrás para que el video o la foto (que van "contain", sin recortar
     lo que se va a mandar) se vean bien aunque el aspecto de la cámara no sea
     16:9. */
  .wc-visor {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 16 / 9;
    width: 100%;
    background: #0f0f0f;
    border-radius: 12px;
    overflow: hidden;
  }

  .wc-video,
  .wc-foto {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .wc-video.oculto {
    visibility: hidden;
  }

  .wc-estado {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    max-width: 85%;
    color: #ffffff;
    text-align: center;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .wc-ayuda {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .wc-aviso {
    margin: 0;
    padding: 0.6rem 0.85rem;
    border-radius: 10px;
    background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.35);
    color: #991b1b;
    font-size: 0.88rem;
  }

  .wc-camaras {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .wc-camaras select {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.7rem;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: #ffffff;
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
  }

  .wc-camaras select:focus {
    outline: none;
    border-color: var(--ink);
  }

  .wc-acciones {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }

  .wc-primario,
  .wc-secundario {
    padding: 0.65rem 1.3rem;
    border-radius: 10px;
    font: inherit;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    transition: filter 0.18s ease, background 0.18s ease, border-color 0.18s ease;
  }

  /* CTA principal: volt sólido + texto negro, igual que "Enviar". */
  .wc-primario {
    border: 1px solid var(--volt);
    background: var(--volt);
    color: var(--ink);
  }

  .wc-primario:hover:not(:disabled) {
    filter: brightness(0.94);
  }

  .wc-secundario {
    border: 1px solid var(--line);
    background: #ffffff;
    color: var(--ink);
  }

  .wc-secundario:hover:not(:disabled) {
    background: rgba(15, 15, 15, 0.04);
  }

  .wc-primario:disabled,
  .wc-secundario:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 560px) {
    .wc-overlay {
      padding: 0.5rem;
    }

    .wc-head {
      padding: 0.8rem 1rem;
    }

    .wc-cuerpo {
      padding: 0.9rem 1rem 1rem;
    }
  }
</style>
