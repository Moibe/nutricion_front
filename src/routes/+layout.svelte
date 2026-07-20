<script lang="ts">
  import { page } from '$app/state';
  import favicon from '$lib/assets/favicon.svg';
  import Sidebar from '$lib/Sidebar.svelte';
  import TopNav from '$lib/TopNav.svelte';

  let { children } = $props();
  let collapsed = $state(false);
  // Drawer de mobile — independiente de `collapsed` (que es la preferencia de
  // escritorio). En mobile el sidebar fijo es demasiado ancho, así que se
  // reemplaza por este drawer controlado desde el hamburguesa del TopNav.
  let mobileOpen = $state(false);

  // Usa View Transitions cuando el browser las soporta para que el repliegue
  // de la barra se anime; si no, hace el cambio directo.
  function withTransition(fn: () => void) {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(fn);
    } else {
      fn();
    }
  }

  function toggleCollapsed() {
    withTransition(() => {
      collapsed = !collapsed;
    });
  }

  function toggleMobile() {
    mobileOpen = !mobileOpen;
  }

  function closeMobile() {
    mobileOpen = false;
  }

  // Cierra el drawer solo al cambiar de ruta (no al abrirlo).
  $effect(() => {
    page.url.pathname;
    mobileOpen = false;
  });
</script>

<svelte:head>
  <title>Kcal</title>
  <link rel="icon" href={favicon} />
</svelte:head>

<TopNav {mobileOpen} {toggleMobile} />
<Sidebar {collapsed} {toggleCollapsed} {mobileOpen} {closeMobile} />
<main class={collapsed ? 'collapsed' : ''}>
  <div class="work-scroll">
    {@render children()}
  </div>
</main>

<style>
  :global(:root) {
    --topnav-height: 64px;
  }

  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
  }

  :global(body) {
    min-height: 100vh;
    background: linear-gradient(135deg, #bae6fd 0%, #60a5fa 100%);
    background-attachment: fixed;
    color: rgba(15, 23, 42, 0.9);
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  main {
    position: fixed;
    top: calc(2rem + var(--topnav-height));
    right: 1rem;
    bottom: 1rem;
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(10px) saturate(120%);
    -webkit-backdrop-filter: blur(10px) saturate(120%);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 16px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.55),
      0 4px 16px rgba(15, 23, 42, 0.12);
    overflow: hidden;
    transition: left 0.22s ease-out;
    left: calc(var(--sidebar-width, 240px) + 2rem);
  }

  main.collapsed {
    left: 2rem;
  }

  @media (max-width: 768px) {
    main,
    main.collapsed {
      left: 1rem;
    }
  }

  .work-scroll {
    position: absolute;
    top: 16px;
    bottom: 16px;
    left: 0;
    right: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 16px;
  }
</style>
