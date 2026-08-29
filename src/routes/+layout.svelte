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

  /* Paleta tipo Nike Run Club: blanco/negro de alto contraste + "volt" como
     único acento de color, en vez del degradado azul + vidrio esmerilado de
     antes. Variables globales para que el resto de componentes (TopNav,
     Sidebar, cada página) las reusen en vez de repetir hex sueltos. */
  :global(:root) {
    --volt: #d7ff3d;
    --volt-ink: #1a2400;
    --ink: #0f0f0f;
    --ink-soft: rgba(15, 15, 15, 0.62);
    --line: rgba(15, 15, 15, 0.12);
  }

  :global(body) {
    min-height: 100vh;
    background: #f4f4f2;
    color: var(--ink);
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  main {
    position: fixed;
    top: calc(2rem + var(--topnav-height));
    right: 1rem;
    bottom: 1rem;
    box-sizing: border-box;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 4px 16px rgba(15, 15, 15, 0.06);
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
