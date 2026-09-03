<script lang="ts">
  // Barra superior "de vidrio" con tilt 3D al pasar el mouse.
  // Adaptada a fondo CLARO: vidrio esmerilado, texto oscuro, sin glow.
  // El tilt es idéntico al original (estudio-cine): se calcula la posición
  // relativa del cursor (-1..1 en cada eje) y se inclina la barra hacia él.
  // El botón de hamburguesa solo se ve en mobile (ver media query) — ahí
  // reemplaza al sidebar fijo, que en pantallas chicas es demasiado ancho.
  // El indicador de gasto de IA (hoy/mes/total) vive ahora en Sidebar.svelte
  // (arriba del botón de replegar), no aquí. Calendario también se movió
  // aquí (antes vivía en el sidebar) — solo ícono, arriba a la derecha.
  import { page } from '$app/state';

  let {
    mobileOpen = false,
    toggleMobile,
    usuario = null
  }: {
    mobileOpen?: boolean;
    toggleMobile?: () => void;
    usuario?: { id: number; nombre: string } | null;
  } = $props();

  let tiltX = $state(0);
  let tiltY = $state(0);

  function handleMove(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const MAX = 1.2;
    tiltX = -ny * MAX;
    tiltY = nx * MAX;
  }

  function handleLeave() {
    tiltX = 0;
    tiltY = 0;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
  class="topnav"
  style="transform: perspective(900px) rotateX({tiltX}deg) rotateY({tiltY}deg);"
  onmousemove={handleMove}
  onmouseleave={handleLeave}
>
  <button
    type="button"
    class="hamburger"
    onclick={toggleMobile}
    aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      {#if mobileOpen}
        <path d="M6 6l12 12M18 6L6 18" />
      {:else}
        <path d="M4 6h16M4 12h16M4 18h16" />
      {/if}
    </svg>
  </button>

  <a href="/" class="brand" aria-label="Inicio">
    <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2c-1.6 2.8-4.2 4.6-4.2 8.2a4.2 4.2 0 0 0 8.4 0c0-1.1-.3-2-.8-2.9.8.6 1.5 1.5 1.9 2.6.6 1.7.2 3.6-.9 5A5.8 5.8 0 0 1 12 22a5.8 5.8 0 0 1-5.3-8.2C7.6 11.3 9 9.5 9 7.1 9 5 10.1 3.2 12 2Z"
      />
    </svg>
    <span class="brand-title">Kcal</span>
  </a>

  <a
    href="/registro-diario"
    class="totales-link"
    aria-current={page.url.pathname === '/registro-diario' ? 'page' : undefined}
  >
    Totales
  </a>

  <span class="spacer"></span>

  <a
    href="/calendario"
    class="calendario-btn"
    aria-current={page.url.pathname === '/calendario' ? 'page' : undefined}
    aria-label="Calendario"
    title="Calendario"
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  </a>

  {#if usuario}
    <span class="usuario-nombre">{usuario.nombre}</span>
    <a href="/logout" class="salir-btn" aria-label="Salir" title="Salir">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </a>
  {/if}
</header>

<style>
  .topnav {
    position: fixed;
    top: 1rem;
    left: 1rem;
    right: 1rem;
    height: var(--topnav-height, 64px);
    padding: 0 1.25rem;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 4px 16px rgba(15, 15, 15, 0.06);
    /* El tilt se anima suave al volver a plano. */
    transition: transform 0.18s ease-out;
    will-change: transform;
    user-select: none;
    z-index: 9;
  }

  .hamburger {
    display: none;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    margin-right: 0.5rem;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    cursor: pointer;
    flex-shrink: 0;
  }

  .hamburger:hover {
    background: var(--volt);
    border-color: var(--volt);
  }

  /* Atajo al Registro Diario, solo en mobile: ahí el sidebar se reemplaza por
     el drawer y el menú entero queda detrás de la hamburguesa, así que el
     destino más usado necesita estar a la vista. En desktop no aparece — el
     sidebar ya lo lista y sería un duplicado.
     Centrado de verdad (absolute + translate) en vez de por flex: los grupos
     de los lados no miden lo mismo, así que en flujo quedaría descentrado. */
  .totales-link {
    display: none;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    align-items: center;
    padding: 0.4rem 0.8rem;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font-size: 0.85rem;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.18s ease, border-color 0.18s ease;
  }

  .totales-link:hover {
    background: var(--volt);
    border-color: var(--volt);
  }

  .totales-link[aria-current='page'] {
    background: var(--volt);
    border-color: var(--volt);
  }

  @media (max-width: 768px) {
    .hamburger {
      display: inline-flex;
    }

    .totales-link {
      display: inline-flex;
    }
  }

  /* Abajo de 480px el link centrado ya no cabe junto al wordmark: en un
     iPhone "Totales" se encimaba con "Kcal". Se deja solo la flama (sigue
     siendo el link a inicio) — el nombre de la app no se pierde, está en la
     pestaña y en el drawer. */
  @media (max-width: 480px) {
    .brand-title {
      display: none;
    }
  }

  /* Muy angosto (SE y similares): además hay que apretar el link para no
     tocar el botón de calendario. */
  @media (max-width: 360px) {
    .totales-link {
      padding: 0.35rem 0.55rem;
      font-size: 0.8rem;
    }
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: var(--ink);
    text-decoration: none;
    border-radius: 8px;
    padding: 0.25rem 0.4rem;
    transition: background 0.18s ease;
  }

  .brand:hover {
    background: rgba(15, 15, 15, 0.05);
  }

  /* El ícono de la gota se conserva EXACTAMENTE como estaba (azul) — es lo
     único que pidió mantener del look anterior. */
  .brand-mark {
    width: 22px;
    height: 22px;
    fill: #2563eb;
  }

  .brand-title {
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.005em;
  }

  .spacer {
    flex: 1;
  }

  /* Solo ícono, mismo color que ya usaba Calendario en el sidebar (teal),
     para que siga siendo reconocible aunque ya no tenga texto al lado. */
  .calendario-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: #0891b2;
    text-decoration: none;
    transition: background 0.18s ease, border-color 0.18s ease;
  }

  .calendario-btn:hover {
    background: var(--volt);
    border-color: var(--volt);
  }

  .calendario-btn[aria-current='page'] {
    background: var(--ink);
    border-color: var(--ink);
  }

  .usuario-nombre {
    margin-left: 0.75rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink-soft);
    white-space: nowrap;
    /* En mobile no cabe junto al hamburguesa + marca + calendario + salir --
       el ícono de salir solo ya identifica la acción sin el nombre. */
    display: none;
  }

  @media (min-width: 560px) {
    .usuario-nombre {
      display: inline;
    }
  }

  .salir-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    margin-left: 0.5rem;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    text-decoration: none;
    transition: background 0.18s ease, border-color 0.18s ease;
  }

  .salir-btn:hover {
    background: var(--volt);
    border-color: var(--volt);
  }
</style>
