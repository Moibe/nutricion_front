<script lang="ts">
  // El botón de la cámara del composer de los chats (comida y ejercicio),
  // compartido para que los dos se comporten igual.
  //
  //  - Móvil (o sin webcam disponible): un toque abre directo el selector del
  //    sistema. Ahí la hoja nativa de iOS/Android ya ofrece Fotos / Tomar foto /
  //    Archivos, así que no hace falta nada más. A propósito el <input> NO lleva
  //    `capture`: forzaba la cámara trasera y no dejaba elegir una foto ya hecha.
  //  - Escritorio con webcam: un toque abre un menú con "Elegir archivo" y "Usar
  //    la webcam". La webcam se detecta en onMount (depende del dispositivo, no
  //    existe en el servidor): hace falta la API de cámara Y un puntero fino (un
  //    mouse); en un celular o tableta táctil no se ofrece.
  //
  // Sea cual sea la vía, entrega un File a `onArchivo`, que es quien ya sabe
  // validarlo y adjuntarlo.
  import { onMount, tick } from 'svelte';
  import WebcamModal from '$lib/WebcamModal.svelte';

  let {
    disabled = false,
    etiqueta = 'Adjuntar foto',
    onArchivo
  }: {
    disabled?: boolean;
    // Nombre accesible y tooltip del botón (cambia por chat: platillo / ejercicio).
    etiqueta?: string;
    onArchivo: (archivo: File) => void;
  } = $props();

  let rootEl = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);
  let botonEl = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let menuAbierto = $state(false);
  let webcamAbierta = $state(false);
  let webcamDisponible = $state(false);

  onMount(() => {
    const hayCamara = !!navigator.mediaDevices?.getUserMedia;
    const hayMouse = matchMedia('(hover: hover) and (pointer: fine)').matches;
    webcamDisponible = hayCamara && hayMouse;
  });

  // Mientras el chat espera respuesta (disabled) no se puede adjuntar: si el
  // menú estaba abierto, se cierra.
  $effect(() => {
    if (disabled) menuAbierto = false;
  });

  // Al abrirse, el foco entra al menú (a la primera opción).
  $effect(() => {
    if (!menuAbierto) return;
    void tick().then(() => menuEl?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  });

  function alPulsar() {
    if (webcamDisponible) menuAbierto = !menuAbierto;
    else inputEl?.click();
  }

  function elegirArchivo() {
    menuAbierto = false;
    inputEl?.click();
  }

  function abrirWebcam() {
    menuAbierto = false;
    webcamAbierta = true;
  }

  function cerrarWebcam() {
    webcamAbierta = false;
    // El foco vuelve al botón: la opción del menú que abrió la webcam ya no existe.
    void tick().then(() => botonEl?.focus());
  }

  function alCapturar(archivo: File) {
    cerrarWebcam();
    onArchivo(archivo);
  }

  // La webcam falló (sin permiso, sin cámara, ocupada) y el usuario prefiere un
  // archivo. El click() va en el mismo gesto del usuario para que el navegador
  // deje abrir el selector.
  function webcamAArchivo() {
    cerrarWebcam();
    inputEl?.click();
  }

  function alElegirArchivo(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    // Limpiar el input ya: así elegir el MISMO archivo dos veces seguidas vuelve
    // a disparar el evento change.
    input.value = '';
    if (archivo) onArchivo(archivo);
  }

  function alClicFuera(e: MouseEvent) {
    if (menuAbierto && rootEl && !rootEl.contains(e.target as Node)) menuAbierto = false;
  }

  function alTeclear(e: KeyboardEvent) {
    if (!menuAbierto) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      // stopPropagation: el chat puede estar dentro de un modal (Muy frecuente)
      // que también cierra con Esc; este Esc es solo del menú.
      e.stopPropagation();
      menuAbierto = false;
      botonEl?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...(menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const sig = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[sig].focus();
    } else if (e.key === 'Tab') {
      // Salir con Tab cierra el menú (el foco sigue su camino natural). No se
      // cierra con focusout: en Safari un botón no recibe foco al hacer clic y
      // eso cerraría el menú ANTES de que el clic llegue a la opción.
      menuAbierto = false;
    }
  }
</script>

<svelte:window onclick={alClicFuera} />

<div class="adjuntar" bind:this={rootEl} role="presentation" onkeydown={alTeclear}>
  <input
    bind:this={inputEl}
    type="file"
    accept="image/*"
    class="oculto"
    onchange={alElegirArchivo}
  />
  <button
    bind:this={botonEl}
    type="button"
    class="adjuntar-btn"
    class:abierto={menuAbierto}
    onclick={alPulsar}
    {disabled}
    aria-label={etiqueta}
    title={etiqueta}
    aria-haspopup={webcamDisponible ? 'menu' : undefined}
    aria-expanded={webcamDisponible ? menuAbierto : undefined}
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  </button>

  {#if menuAbierto}
    <div class="menu" role="menu" aria-label={etiqueta} bind:this={menuEl}>
      <button type="button" role="menuitem" class="item" onclick={elegirArchivo}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        Elegir archivo
      </button>
      <button type="button" role="menuitem" class="item" onclick={abrirWebcam}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M23 7l-7 5 7 5V7Z" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
        Usar la webcam
      </button>
    </div>
  {/if}
</div>

{#if webcamAbierta}
  <WebcamModal onCapturar={alCapturar} onCerrar={cerrarWebcam} onElegirArchivo={webcamAArchivo} />
{/if}

<style>
  /* El wrapper es el que hace de ítem del flex del composer (antes lo era el
     botón): mismo ancho fijo de 42px, y el botón lo llena. position:relative
     ancla el menú. */
  .adjuntar {
    position: relative;
    display: flex;
    flex-shrink: 0;
    width: 42px;
  }

  .oculto {
    display: none;
  }

  /* Mismo tratamiento visual que .ghost de los chats -- secundario, no compite
     con Enviar. */
  .adjuntar-btn {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--ink);
    cursor: pointer;
    transition: filter 0.18s ease, background 0.18s ease, border-color 0.18s ease;
  }

  .adjuntar-btn:hover:not(:disabled) {
    filter: brightness(0.96);
  }

  .adjuntar-btn.abierto {
    background: var(--volt);
    border-color: var(--volt);
  }

  .adjuntar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Se abre hacia ARRIBA: el composer vive pegado al fondo del panel. */
  .menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 6px);
    z-index: 30;
    display: flex;
    flex-direction: column;
    min-width: 200px;
    padding: 4px;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(15, 15, 15, 0.15);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.75rem;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .item:hover,
  .item:focus-visible {
    background: var(--volt);
    outline: none;
  }
</style>
