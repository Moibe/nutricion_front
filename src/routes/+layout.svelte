<script lang="ts">
  import { page } from '$app/state';
  import favicon from '$lib/assets/favicon.svg';
  import Sidebar from '$lib/Sidebar.svelte';
  import TopNav from '$lib/TopNav.svelte';

  let { children, data } = $props();
  const esLogin = $derived(page.url.pathname === '/login');
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

  // iPad/iPhone: al abrir el teclado, el LAYOUT viewport no se encoge -- solo
  // el visual. Como <main> es position:fixed (y por tanto se mide contra el
  // layout viewport), su borde inferior se queda detrás del teclado, y con él
  // la barra de escritura del chat, que es sticky al fondo de .work-scroll:
  // escribes sin ver lo que escribes. Safari tampoco lo rescata solo, porque
  // su "llevar el campo enfocado a la vista" scrollea el documento y aquí
  // quien scrollea es un contenedor interno.
  //
  // visualViewport sí reporta el alto realmente visible, así que de ahí sale
  // cuánto tapa el teclado y se le resta al fondo de <main>.
  $effect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const raiz = document.documentElement;
    const actualizar = () => {
      // Con pinch-zoom el visual viewport también se encoge sin que haya
      // teclado; scale acota el ajuste al caso que nos interesa.
      const tapado = vv.scale > 1.01 ? 0 : window.innerHeight - vv.height - vv.offsetTop;
      const px = Math.max(0, Math.round(tapado));
      raiz.style.setProperty('--teclado', `${px}px`);

      // Encoger <main> es necesario pero no suficiente: .work-scroll queda
      // más corto y pasa a tener scroll, y el campo enfocado puede quedar por
      // debajo del nuevo corte sin que nadie lo suba (sticky solo lo pega al
      // fondo mientras su tarjeta está a la vista, y aquí ya no lo está). Se
      // lo trae en el frame siguiente, ya con el alto nuevo aplicado.
      if (px === 0) return;
      requestAnimationFrame(() => {
        const activo = document.activeElement;
        if (activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement) {
          activo.scrollIntoView({ block: 'nearest' });
        }
      });
    };

    actualizar();
    vv.addEventListener('resize', actualizar);
    vv.addEventListener('scroll', actualizar);
    return () => {
      vv.removeEventListener('resize', actualizar);
      vv.removeEventListener('scroll', actualizar);
      raiz.style.removeProperty('--teclado');
    };
  });

  // El guard de hooks.server.ts solo protege NAVEGACIONES -- si la sesión se
  // revoca (o expira) mientras ya estás adentro, un fetch normal a /api/*
  // simplemente devuelve 401 sin mandarte a ningún lado. Este parche global
  // detecta ESE caso y te saca sin que cada componente tenga que revisar el
  // status uno por uno.
  //
  // A /logout, NO a /login directo: la cookie sigue firmada correctamente
  // (lo que cambió fue token_version en la DB, no la firma HMAC -- eso
  // hooks.server.ts no lo puede saber sin preguntarle a la API), así que
  // para hooks.server.ts seguís "logueado" y un goto a /login rebota de
  // vuelta a "/" en un loop infinito. /logout SÍ borra la cookie primero.
  $effect(() => {
    if (esLogin) return;
    const original = window.fetch;
    window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.status === 401) window.location.href = '/logout';
      return res;
    };
    return () => {
      window.fetch = original;
    };
  });
</script>

<svelte:head>
  <title>Kcal</title>
  <link rel="icon" href={favicon} />
</svelte:head>

{#if esLogin}
  {@render children()}
{:else}
  <TopNav {mobileOpen} {toggleMobile} usuario={data.usuario} />
  <Sidebar {collapsed} {toggleCollapsed} {mobileOpen} {closeMobile} usuario={data.usuario} />
  <main class={collapsed ? 'collapsed' : ''}>
    <div class="work-scroll">
      {@render children()}
    </div>
  </main>
{/if}

<style>
  :global(:root) {
    --topnav-height: 64px;
    /* Cuántos px del fondo tapa el teclado en pantalla; lo mantiene el efecto
       de visualViewport de arriba. 0 mientras no hay teclado. */
    --teclado: 0px;
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
    bottom: calc(1rem + var(--teclado));
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
