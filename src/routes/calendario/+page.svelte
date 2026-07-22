<script lang="ts">
  import Calendario from '$lib/Calendario.svelte';
  import ListadoComidas from '$lib/ListadoComidas.svelte';

  // Arranca en el día de hoy (CDMX, misma zona que usa el resto de la app).
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  let fechaSeleccionada = $state(hoyISO);
</script>

<section class="calendario-page">
  <Calendario seleccionada={fechaSeleccionada} onSeleccionar={(f) => (fechaSeleccionada = f)} />
  <ListadoComidas fechaFiltro={fechaSeleccionada} />
</section>

<style>
  .calendario-page {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    max-width: 640px;
    margin: 0 auto;
  }
</style>
