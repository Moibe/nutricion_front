<script lang="ts">
  // ?fecha=YYYY-MM-DD (opcional, en la URL): permite ver/editar las comidas
  // de un día PASADO en vez de solo hoy — así puede llegar directo desde el
  // resumen de /calendario. Sin el parámetro (el link del sidebar
  // "Alimentación Hoy"), se comporta igual que siempre: hoy. Reusa el modo
  // fechaFiltro que ListadoComidas ya soporta (el mismo que usa /calendario),
  // así que no hace falta tocar ese componente.
  import { page } from '$app/state';
  import ListadoComidas from '$lib/ListadoComidas.svelte';

  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const fechaParam = $derived(page.url.searchParams.get('fecha'));
  const fechaValida = $derived(
    fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) && fechaParam <= hoyISO ? fechaParam : null
  );
  const esOtroDia = $derived(fechaValida !== null && fechaValida !== hoyISO);
</script>

{#if esOtroDia}
  <div class="volver-hoy-wrap">
    <a href="/hoy" class="volver-hoy">← Volver a hoy</a>
  </div>
{/if}
<ListadoComidas soloHoy={!esOtroDia} fechaFiltro={esOtroDia ? fechaValida : null} />

<style>
  .volver-hoy-wrap {
    max-width: 640px;
    margin: 0 auto 0.6rem;
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
