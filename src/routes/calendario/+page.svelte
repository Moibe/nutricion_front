<script lang="ts">
  import Calendario from '$lib/Calendario.svelte';
  import ResumenDia from '$lib/ResumenDia.svelte';

  // Arranca en el día de hoy (CDMX, misma zona que usa el resto de la app).
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  let fechaSeleccionada = $state(hoyISO);
</script>

<section class="calendario-page">
  <div class="calendario-col">
    <Calendario seleccionada={fechaSeleccionada} onSeleccionar={(f) => (fechaSeleccionada = f)} />
  </div>
  <div class="resultado-col">
    <ResumenDia fecha={fechaSeleccionada} />
  </div>
</section>

<style>
  .calendario-page {
    display: flex;
    align-items: flex-start;
    gap: 1.5rem;
    max-width: 1100px;
    margin: 0 auto;
  }

  .calendario-col {
    flex: 0 0 430px;
  }

  .resultado-col {
    flex: 1;
    min-width: 0;
  }

  /* Debajo de este ancho ya no cabe calendario + resultado lado a lado sin
     apachurrar alguno de los dos — vuelve al apilado vertical original. */
  @media (max-width: 910px) {
    .calendario-page {
      flex-direction: column;
    }

    .calendario-col {
      flex-basis: auto;
      width: 100%;
    }
  }
</style>
