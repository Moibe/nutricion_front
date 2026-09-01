<script lang="ts">
  // Barra lateral "de vidrio" con el mismo tilt 3D que la superior, adaptada a
  // fondo CLARO. Incluye el handle para replegar/mostrar (característica del
  // original). Publica su ancho real a la variable CSS --sidebar-width para que
  // el panel de contenido se ajuste solo.
  //
  // En mobile el sidebar fijo (min-width 240px) no cabe bien, así que se
  // oculta por completo (ver media query) y se reemplaza por un drawer
  // controlado por el hamburguesa del TopNav (mobileOpen/closeMobile) — es
  // independiente del collapsed de escritorio.
  //
  // Al fondo (arriba del botón de replegar en escritorio, al fondo del
  // drawer en mobile) va el indicador de gasto de IA (hoy/mes/total), que
  // antes vivía en TopNav — se movió aquí para dejar la barra superior solo
  // con el logo.
  import { env } from '$env/dynamic/public';
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';

  let {
    collapsed = false,
    toggleCollapsed,
    mobileOpen = false,
    closeMobile
  }: {
    collapsed?: boolean;
    toggleCollapsed: () => void;
    mobileOpen?: boolean;
    closeMobile?: () => void;
  } = $props();

  // Marca el item activo según la ruta. Los placeholders a "/" nunca se marcan.
  const isActive = (href: string) => href !== '/' && page.url.pathname === href;

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  type Bloque = { llamadas: number; input_tokens: number; output_tokens: number; costo_usd: number };
  type Uso = { modelo: string; precio_input_usd_por_1m: number; precio_output_usd_por_1m: number; total: Bloque; mes: Bloque; hoy: Bloque };

  let uso = $state<Uso | null>(null);

  const usd = (n: number) =>
    '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function cargarUso() {
    try {
      const res = await fetch(`${API_URL}/uso`);
      if (!res.ok) return;
      uso = (await res.json()) as Uso;
    } catch {
      /* silencioso: es solo un indicador, no debe estorbar la navegación */
    }
  }

  // afterNavigate corre al montar y en cada navegación (solo cliente), así el
  // costo se refresca al moverse entre secciones sin recargar.
  afterNavigate(() => cargarUso());

  let tiltX = $state(0);
  let tiltY = $state(0);
  let sidebarWidth = $state(240);

  $effect(() => {
    if (typeof document !== 'undefined' && !collapsed) {
      document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    }
  });

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

  function handleCollapseClick(e: MouseEvent) {
    e.stopPropagation();
    tiltX = 0;
    tiltY = 0;
    toggleCollapsed();
  }
</script>

{#snippet navLinks()}
  <a
    href="/registro-diario"
    class="nav-item"
    aria-current={isActive('/registro-diario') ? 'page' : undefined}
  >
    <svg
      class="nav-ico registro"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h6M9 20h3" />
    </svg>
    <span>Registro Diario</span>
  </a>
  <a href="/peso" class="nav-item" aria-current={isActive('/peso') ? 'page' : undefined}>
    <svg
      class="nav-ico peso"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <circle cx="12" cy="13" r="4" />
      <path d="M12 13l1.8-1.8" />
    </svg>
    <span>Peso Hoy</span>
  </a>
  <a href="/hoy" class="nav-item" aria-current={isActive('/hoy') ? 'page' : undefined}>
    <svg
      class="nav-ico comida"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </svg>
    <span>Alimentación Hoy</span>
  </a>
  <a href="/ejercicio" class="nav-item" aria-current={isActive('/ejercicio') ? 'page' : undefined}>
    <svg
      class="nav-ico ejercicio"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
    <span>Ejercicio Hoy</span>
  </a>
{/snippet}

{#snippet usoPill()}
  <a href="/tokens" class="uso-pill" title="Consumo de tokens de IA (hoy, mes y total estimado)">
    <span class="uso-seg">
      <span class="uso-label">Hoy</span>
      <span class="uso-value">{uso ? usd(uso.hoy.costo_usd) : '—'}</span>
    </span>
    <span class="uso-sep" aria-hidden="true"></span>
    <span class="uso-seg">
      <span class="uso-label">Mes</span>
      <span class="uso-value">{uso ? usd(uso.mes.costo_usd) : '—'}</span>
    </span>
    <span class="uso-sep" aria-hidden="true"></span>
    <span class="uso-seg">
      <span class="uso-label">Total</span>
      <span class="uso-value">{uso ? usd(uso.total.costo_usd) : '—'}</span>
    </span>
    <span class="uso-moneda">USD</span>
  </a>
{/snippet}

<!-- Sidebar fijo de escritorio (oculto por completo en mobile). -->
{#if !collapsed}
  <aside
    class="sidebar desktop-sidebar"
    style="transform: perspective(900px) rotateX({tiltX}deg) rotateY({tiltY}deg);"
    bind:clientWidth={sidebarWidth}
    onmousemove={handleMove}
    onmouseleave={handleLeave}
  >
    <nav>
      {@render navLinks()}
    </nav>

    <div class="sidebar-footer">
      {@render usoPill()}
      <button
        type="button"
        class="collapse-btn"
        onclick={handleCollapseClick}
        aria-label="Replegar barra"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
    </div>
  </aside>
{:else}
  <button
    type="button"
    class="reveal-handle"
    onclick={toggleCollapsed}
    aria-label="Mostrar barra"
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  </button>
{/if}

<!-- Drawer de mobile: solo visible en pantallas chicas, controlado por el hamburguesa del TopNav. -->
{#if mobileOpen}
  <div class="mobile-backdrop" onclick={closeMobile} role="presentation"></div>
{/if}
<aside class="sidebar mobile-drawer" class:open={mobileOpen}>
  <nav>
    {@render navLinks()}
  </nav>
  <div class="mobile-footer">
    {@render usoPill()}
  </div>
</aside>

<style>
  .sidebar {
    position: fixed;
    top: calc(2rem + var(--topnav-height, 64px));
    left: 1rem;
    bottom: 1rem;
    box-sizing: border-box;
    width: max-content;
    min-width: 240px;
    max-width: 380px;
    padding: 1.5rem 1rem;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 4px 16px rgba(15, 15, 15, 0.06);
    transition: transform 0.18s ease-out;
    will-change: transform;
    user-select: none;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  nav::-webkit-scrollbar {
    display: none;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0.95rem;
    color: var(--ink);
    text-decoration: none;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  }

  .nav-ico {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* Mismo color por categoría que usan los iconitos del calendario, para que
     un vistazo al sidebar ya te entrene qué color es cuál ahí también. */
  .nav-ico.comida {
    color: rgba(37, 99, 235, 0.75);
  }

  .nav-ico.ejercicio {
    color: rgba(234, 88, 12, 0.75);
  }

  .nav-ico.peso {
    color: rgba(124, 58, 237, 0.75);
  }

  .nav-ico.registro {
    color: rgba(219, 39, 119, 0.75);
  }

  .nav-item:hover {
    background: rgba(15, 15, 15, 0.05);
    border-color: var(--line);
  }

  /* Selección estilo Nike: negro sólido + texto blanco, no un tinte azul
     translúcido — los iconitos de categoría conservan su propio color
     (mismo criterio que ya usa Calendario.svelte) para seguir sirviendo de
     guía visual incluso sobre el fondo negro. */
  .nav-item[aria-current='page'] {
    color: #ffffff;
    background: var(--ink);
    border-color: var(--ink);
  }

  .nav-item[aria-current='page'] .nav-ico.comida {
    color: #2563eb;
  }

  .nav-item[aria-current='page'] .nav-ico.ejercicio {
    color: #ea580c;
  }

  .nav-item[aria-current='page'] .nav-ico.peso {
    color: #7c3aed;
  }

  .nav-item[aria-current='page'] .nav-ico.registro {
    color: #db2777;
  }

  .sidebar-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid rgba(15, 23, 42, 0.1);
  }

  /* Indicador de gasto de IA (hoy/mes/total) — mismos valores que /tokens,
     en una cápsula angosta que cabe en el ancho del sidebar. */
  .uso-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
    box-sizing: border-box;
    padding: 0.45rem 0.5rem;
    border-radius: 999px;
    background: var(--volt);
    border: 1px solid var(--volt);
    color: var(--volt-ink);
    text-decoration: none;
    transition: filter 0.18s ease;
  }

  .uso-pill:hover {
    filter: brightness(0.94);
  }

  .uso-seg {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.15;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .uso-label {
    font-size: 0.58rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(26, 36, 0, 0.65);
  }

  .uso-value {
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .uso-sep {
    flex-shrink: 0;
    align-self: stretch;
    width: 1px;
    margin: 0.1rem 0;
    background: rgba(26, 36, 0, 0.2);
  }

  /* Costos son un estimado en dólares (precios de OpenAI) — se aclara una
     sola vez al final de la píldora, no repetida en cada valor, para no
     saturar un espacio ya angosto. */
  .uso-moneda {
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: rgba(26, 36, 0, 0.55);
    flex-shrink: 0;
    align-self: flex-end;
    margin-bottom: 0.05rem;
  }

  .mobile-footer {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid rgba(15, 15, 15, 0.1);
  }

  .collapse-btn,
  .reveal-handle {
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.4rem 0.5rem;
    color: var(--ink);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: inherit;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  }

  .collapse-btn:hover,
  .reveal-handle:hover {
    background: var(--volt);
    border-color: var(--volt);
  }

  /* Cuando la barra está replegada, queda solo este handle flotante. */
  .reveal-handle {
    position: fixed;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.55rem 0.45rem;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 4px 16px rgba(15, 15, 15, 0.1);
    z-index: 10;
  }

  /* Drawer de mobile: fuera de pantalla por default, entra como overlay
     sobre un backdrop cuando mobileOpen — no empuja el contenido. */
  .mobile-drawer {
    display: none;
  }

  .mobile-backdrop {
    display: none;
  }

  @media (max-width: 768px) {
    .desktop-sidebar,
    .reveal-handle {
      display: none;
    }

    .mobile-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(15, 15, 15, 0.4);
      z-index: 15;
    }

    .mobile-drawer {
      display: flex;
      top: calc(1rem + var(--topnav-height, 64px));
      bottom: 0.75rem;
      left: 0.75rem;
      width: min(78vw, 280px);
      min-width: 0;
      max-width: none;
      z-index: 16;
      transform: translateX(-120%);
      background: #ffffff;
    }

    .mobile-drawer.open {
      transform: translateX(0);
    }
  }
</style>
