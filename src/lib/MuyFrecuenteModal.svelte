<script lang="ts">
  // Modo de creación de un "Muy frecuente": un modal grande, por encima de
  // todo, con el MISMO prompteador de IA del chat de comida (describes el
  // platillo y te va preguntando lo que falte). Cuando llega el resultado, en
  // vez del "Guardar" que registra un consumo de hoy, el chat ofrece "Guardar
  // como Muy frecuente", que llena (o reemplaza) la tarjeta `slot`.
  //
  // Cerrar: con la X o con Esc. A propósito NO se cierra al hacer clic afuera:
  // a media conversación con la IA (que cuesta tokens) un clic de más en el
  // fondo tiraría todo lo escrito.
  import { onMount, tick } from 'svelte';
  import { env } from '$env/dynamic/public';
  import ChatKilocalculator from '$lib/ChatKilocalculator.svelte';
  import { putMuyFrecuente, type MuyFrecuente } from '$lib/muyFrecuentes';

  let {
    slot,
    actual = null,
    onCerrar,
    onGuardado
  }: {
    // Índice 0-3 de la tarjeta que se está creando/reemplazando.
    slot: number;
    // Lo que hay hoy en esa tarjeta (null = vacía), para avisar que se reemplaza.
    actual?: MuyFrecuente | null;
    onCerrar: () => void;
    // Se llama con la fila ya guardada en la API; el padre actualiza la tarjeta
    // y cierra el modal.
    onGuardado: (mf: MuyFrecuente) => void;
  } = $props();

  const API_URL = env.PUBLIC_API_URL ?? '/api';

  let dialogEl = $state<HTMLDivElement | null>(null);
  // PUT en vuelo: mientras dure, ni Esc ni la X cierran. Cerrar a media
  // request no la cancela (la tarjeta se escribiría igual, sin nadie que lo
  // vea) y, si en ese instante se abre otro modal, la respuesta tardía lo
  // cerraría.
  let guardando = $state(false);
  let focoPrevio: HTMLElement | null = null;

  // Cuelga el overlay directo de <body>: <main> del layout es position:fixed
  // con overflow oculto, y un modal que viva adentro depende de que ningún
  // ancestro cree un contexto de apilamiento o de posicionamiento propio.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  type ResultadoElegido = {
    platillo: string;
    kilocalorias: number;
    proteinas: number;
    carbohidratos: number;
    grasas: number;
  };

  // Lanza si algo falla: el chat lo atrapa y muestra el error junto al botón.
  async function guardar(r: ResultadoElegido) {
    guardando = true;
    try {
      await guardarEnApi(r);
    } finally {
      guardando = false;
    }
  }

  async function guardarEnApi(r: ResultadoElegido) {
    onGuardado(
      await putMuyFrecuente(API_URL, slot, {
        nombre: r.platillo,
        kilocalorias: r.kilocalorias,
        proteinas: r.proteinas,
        carbohidratos: r.carbohidratos,
        grasas: r.grasas
      })
    );
  }

  const SELECTOR_FOCO =
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

  function onKeydown(e: KeyboardEvent) {
    // isComposing: con un teclado de composición (acentos con tecla muerta,
    // dictado, IME) Esc cancela la composición, no el modal -- cerrar aquí
    // tiraría lo escrito y la conversación ya pagada.
    if (e.key === 'Escape' && !e.isComposing && !e.defaultPrevented) {
      e.preventDefault();
      if (!guardando) onCerrar();
      return;
    }
    if (e.key === 'Escape') return;
    // Trampa de foco: Tab/Shift+Tab dan la vuelta dentro del diálogo en vez de
    // irse a los controles de la página que quedó detrás.
    if (e.key === 'Tab' && dialogEl) {
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
  }

  onMount(() => {
    focoPrevio = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void (async () => {
      await tick();
      // Directo al campo de escritura: lo primero que se hace aquí es describir
      // el platillo.
      const campo = dialogEl?.querySelector<HTMLElement>('.composer input[type="text"]');
      (campo ?? dialogEl)?.focus();
    })();
    return () => {
      // Devuelve el foco a lo que abrió el modal (la tarjeta), si sigue ahí.
      if (focoPrevio?.isConnected) {
        focoPrevio.focus();
        return;
      }
      // Al guardar, una tarjeta vacía pasa a llena y el botón que abrió el
      // modal deja de existir: sin esto el foco caería a <body> y quien navega
      // con teclado o lector de pantalla perdería su lugar. Se manda a la
      // tarjeta recién llenada (tras el repintado).
      void tick().then(() => {
        document
          .querySelector<HTMLElement>(`.muy-frecuentes-grid > :nth-child(${slot + 1}) .mf-usar`)
          ?.focus();
      });
    };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="mf-overlay" use:portal>
  <div
    class="mf-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="mf-titulo"
    tabindex="-1"
    bind:this={dialogEl}
  >
    <header class="mf-head">
      <div class="mf-titulos">
        <h2 id="mf-titulo">Muy frecuente {slot + 1}</h2>
        <p class="mf-sub">
          {#if actual}
            Esta tarjeta ya tiene <strong>{actual.nombre}</strong>; al guardar, lo reemplazas.
          {:else}
            Describe el platillo y te voy preguntando lo que falte; al terminar, lo guardas en esta tarjeta.
          {/if}
          Sé lo más específico posible.
        </p>
      </div>
      <button type="button" class="mf-cerrar" onclick={onCerrar} disabled={guardando} aria-label="Cerrar" title="Cerrar (Esc)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="mf-body">
      <ChatKilocalculator
        mostrarTitulo={false}
        etiquetaElegir="Guardar como Muy frecuente"
        onElegirResultado={guardar}
      />
    </div>
  </div>
</div>

<style>
  .mf-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(15, 15, 15, 0.5);
  }

  .mf-dialog {
    display: flex;
    flex-direction: column;
    width: min(860px, 100%);
    max-height: min(92vh, 100%);
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 18px 50px rgba(15, 15, 15, 0.3);
    overflow: hidden;
    color: var(--ink);
  }

  .mf-dialog:focus {
    outline: none;
  }

  .mf-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.1rem 1.3rem 0.9rem;
    border-bottom: 1px solid var(--line);
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 800;
  }

  .mf-sub {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }

  .mf-cerrar {
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

  .mf-cerrar:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .mf-cerrar:hover:not(:disabled) {
    background: var(--volt);
    border-color: var(--volt);
    color: var(--volt-ink);
  }

  /* Es quien scrollea (no la página de atrás): el composer del chat es sticky
     al fondo de este contenedor. overscroll-behavior evita que, al llegar al
     tope o al final, el scroll "se escape" y mueva lo que está detrás. */
  .mf-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 1.1rem 1.3rem 1.3rem;
  }

  @media (max-width: 560px) {
    .mf-overlay {
      padding: 0.5rem;
    }

    .mf-head {
      padding: 0.9rem 1rem 0.7rem;
    }

    .mf-body {
      padding: 0.9rem 1rem 1rem;
    }
  }
</style>
