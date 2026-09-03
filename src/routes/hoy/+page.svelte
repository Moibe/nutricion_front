<script lang="ts">
  // ?fecha=YYYY-MM-DD (opcional, en la URL): permite ver/editar las comidas
  // de un día PASADO en vez de solo hoy — así puede llegar directo desde el
  // resumen de /calendario, o navegando día por día con las flechitas de acá
  // abajo. Sin el parámetro (el link del sidebar "Alimentación Hoy"), se
  // comporta igual que siempre: hoy. Reusa el modo fechaFiltro que
  // ListadoComidas ya soporta (el mismo que usa /calendario), así que no
  // hace falta tocar ese componente.
  import { page } from '$app/state';
  import ListadoComidas from '$lib/ListadoComidas.svelte';

  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const fechaParam = $derived(page.url.searchParams.get('fecha'));
  const fechaValida = $derived(
    fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) && fechaParam <= hoyISO ? fechaParam : null
  );
  const esOtroDia = $derived(fechaValida !== null && fechaValida !== hoyISO);

  // Suma/resta días en UTC puro (sin horas de por medio) para no depender de
  // la zona horaria del navegador -- un YYYY-MM-DD entra y sale igual sin
  // importar dónde esté físicamente el dispositivo.
  function sumarDias(fechaISO: string, delta: number): string {
    const [y, m, d] = fechaISO.split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));
    fecha.setUTCDate(fecha.getUTCDate() + delta);
    return fecha.toISOString().slice(0, 10);
  }

  const fechaEfectiva = $derived(fechaValida ?? hoyISO);
  const fechaAnterior = $derived(sumarDias(fechaEfectiva, -1));
  const fechaSiguiente = $derived(sumarDias(fechaEfectiva, 1));
  // No hay "mañana" que mostrar todavía -- el botón de avanzar se apaga en hoy.
  const puedeAvanzar = $derived(fechaEfectiva < hoyISO);
  const hrefSiguiente = $derived(fechaSiguiente === hoyISO ? '/hoy' : `/hoy?fecha=${fechaSiguiente}`);
</script>

{#snippet icoChevronIzq()}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" />
  </svg>
{/snippet}

{#snippet icoChevronDer()}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
{/snippet}

<div class="nav-dia">
  <div class="nav-flechas">
    <a href="/hoy?fecha={fechaAnterior}" class="nav-flecha" aria-label="Día anterior" title="Día anterior">
      {@render icoChevronIzq()}
    </a>
    {#if puedeAvanzar}
      <a href={hrefSiguiente} class="nav-flecha" aria-label="Día siguiente" title="Día siguiente">
        {@render icoChevronDer()}
      </a>
    {:else}
      <span class="nav-flecha nav-flecha-deshabilitada" aria-hidden="true">
        {@render icoChevronDer()}
      </span>
    {/if}
  </div>
  {#if esOtroDia}
    <a href="/hoy" class="volver-hoy">Volver a hoy</a>
  {/if}
</div>
<ListadoComidas soloHoy={!esOtroDia} fechaFiltro={esOtroDia ? fechaValida : null} />

<style>
  .nav-dia {
    max-width: 700px;
    margin: 0 auto 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .nav-flechas {
    display: flex;
    gap: 0.35rem;
  }

  .nav-flecha {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: #ffffff;
    border: 1px solid var(--line);
    color: var(--ink);
    text-decoration: none;
  }

  .nav-flecha:hover {
    background: var(--volt);
    border-color: var(--volt);
    color: var(--volt-ink);
  }

  .nav-flecha-deshabilitada {
    opacity: 0.35;
    pointer-events: none;
  }

  .volver-hoy {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--ink);
    text-decoration: none;
  }

  .volver-hoy:hover {
    text-decoration: underline;
  }
</style>
