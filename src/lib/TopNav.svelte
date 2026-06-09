<script lang="ts">
  // Barra superior "de vidrio" con tilt 3D al pasar el mouse.
  // Adaptada a fondo CLARO: vidrio esmerilado, texto oscuro, sin glow.
  // El tilt es idéntico al original (estudio-cine): se calcula la posición
  // relativa del cursor (-1..1 en cada eje) y se inclina la barra hacia él.
  import { page } from '$app/state';

  const isActive = (href: string) => page.url.pathname === href;

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
  <a href="/" class="brand" aria-label="Inicio">
    <span class="brand-mark" aria-hidden="true"></span>
    <span class="brand-title">App</span>
  </a>

  <nav>
    <a href="/" class="nav-item" aria-current={isActive('/') ? 'page' : undefined}>Inicio</a>
    <a
      href="/seccion-uno"
      class="nav-item"
      aria-current={isActive('/seccion-uno') ? 'page' : undefined}
    >
      Sección uno
    </a>
  </nav>

  <div class="spacer"></div>
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
    border-radius: 6px;
    background: linear-gradient(135deg, #2563eb, #1e3a8a);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }

  .brand-title {
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.005em;
  }

  nav {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: 1.25rem;
    padding-left: 1.25rem;
    border-left: 1px solid rgba(15, 23, 42, 0.12);
    height: 60%;
  }

  .nav-item {
    display: inline-flex;
    align-items: center;
    padding: 0.45rem 0.95rem;
    color: rgba(15, 23, 42, 0.82);
    text-decoration: none;
    font-size: 0.95rem;
    letter-spacing: 0.01em;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.6);
    border-color: rgba(15, 23, 42, 0.1);
  }

  .nav-item[aria-current='page'] {
    color: #1e3a8a;
    background: rgba(37, 99, 235, 0.16);
    border-color: rgba(37, 99, 235, 0.4);
  }

  .spacer {
    flex: 1;
  }
</style>
