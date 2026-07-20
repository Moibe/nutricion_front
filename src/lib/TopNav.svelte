<script lang="ts">
  // Barra superior "de vidrio" con tilt 3D al pasar el mouse.
  // Adaptada a fondo CLARO: vidrio esmerilado, texto oscuro, sin glow.
  // El tilt es idéntico al original (estudio-cine): se calcula la posición
  // relativa del cursor (-1..1 en cada eje) y se inclina la barra hacia él.
  // El botón de hamburguesa solo se ve en mobile (ver media query) — ahí
  // reemplaza al sidebar fijo, que en pantallas chicas es demasiado ancho.
  let { mobileOpen = false, toggleMobile }: { mobileOpen?: boolean; toggleMobile?: () => void } =
    $props();

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
    background: rgba(255, 255, 255, 0.35);
    backdrop-filter: blur(10px) saturate(120%);
    -webkit-backdrop-filter: blur(10px) saturate(120%);
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: 16px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.6),
      0 4px 16px rgba(15, 23, 42, 0.12);
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
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-radius: 8px;
    color: rgba(15, 23, 42, 0.75);
    cursor: pointer;
    flex-shrink: 0;
  }

  .hamburger:hover {
    background: rgba(255, 255, 255, 0.65);
    color: #1e3a8a;
  }

  @media (max-width: 768px) {
    .hamburger {
      display: inline-flex;
    }
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: rgba(15, 23, 42, 0.95);
    text-decoration: none;
    border-radius: 8px;
    padding: 0.25rem 0.4rem;
    transition: background 0.18s ease;
  }

  .brand:hover {
    background: rgba(255, 255, 255, 0.5);
  }

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
</style>
