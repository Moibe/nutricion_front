<script lang="ts">
  // Preferencias del usuario en curso (no ajustes globales de la app): lo que
  // se elige aquí solo cambia cómo TÚ ves las cosas.
  import { enhance } from '$app/forms';
  import { DALTONISMOS, type Daltonismo } from '$lib/daltonismo';

  let {
    data,
    form
  }: {
    data: { daltonismo: Daltonismo };
    form: { error?: string; guardado?: boolean } | null;
  } = $props();

  // Copia local para que la muestra de abajo se repinte al instante al elegir
  // una opción, sin esperar a guardar.
  let seleccion = $state<Daltonismo>(data.daltonismo);
  let guardando = $state(false);

  // Re-sincroniza con lo guardado cada vez que el load vuelve a correr (al
  // guardar, o al volver a entrar a la página). Sin esto, `seleccion` se queda
  // con el valor que tenía al montar el componente.
  $effect(() => {
    seleccion = data.daltonismo;
  });

  const hayCambio = $derived(seleccion !== data.daltonismo);
</script>

<svelte:head>
  <title>Configuración · Kcal</title>
</svelte:head>

<section class="configuracion">
  <h1>Configuración</h1>

  <div class="bloque">
    <h2>Filtro de daltonismo</h2>
    <p class="ayuda">
      En Registro Diario, el peso de cada día trae un triangulito que dice si subiste o bajaste
      respecto al día anterior. Por default es verde y rojo; si esos dos se te confunden, elige el
      tipo que te corresponda y se repintan con colores que sí se distingan. Solo te afecta a ti.
    </p>

    {#if form?.error}
      <div class="error">⚠️ {form.error}</div>
    {/if}

    <form
      method="POST"
      action="?/daltonismo"
      use:enhance={() => {
        guardando = true;
        return async ({ update }) => {
          // reset:false porque el default de enhance RESETEA el <form>, y un
          // reset deja los radios sin marcar (ninguno trae checked en el HTML,
          // la selección vive en bind:group) -- se veía como si se hubiera
          // perdido lo que acabas de guardar.
          await update({ reset: false });
          guardando = false;
        };
      }}
    >
      <div class="opciones">
        {#each DALTONISMOS as opcion (opcion.valor)}
          <label class="opcion" class:elegida={seleccion === opcion.valor}>
            <input type="radio" name="daltonismo" value={opcion.valor} bind:group={seleccion} />
            <span class="opcion-texto">
              <strong>{opcion.etiqueta}</strong>
              <span class="opcion-detalle">{opcion.detalle}</span>
            </span>
            <!-- La muestra usa los MISMOS tokens que la tabla real (ver
                 +layout.svelte): lo que se ve aquí es exactamente lo que se va
                 a ver allá, no una aproximación pintada a mano. -->
            <span class="muestra" data-daltonismo={opcion.valor} aria-hidden="true">
              <span class="muestra-baje">▼ (0.5)</span>
              <span class="muestra-subi">▲ (0.8)</span>
            </span>
          </label>
        {/each}
      </div>

      <div class="acciones">
        <button type="submit" disabled={guardando || !hayCambio}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {#if form?.guardado && !hayCambio}
          <span class="ok">✓ Guardado</span>
        {/if}
      </div>
    </form>
  </div>
</section>

<style>
  .configuracion {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    max-width: 640px;
    margin: 0 auto;
  }

  h1 {
    margin: 0;
    font-size: 1.6rem;
    color: var(--ink);
  }

  .bloque {
    padding: 1.1rem 1.3rem;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid var(--line);
  }

  h2 {
    margin: 0 0 0.4rem;
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--ink);
  }

  .ayuda {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--ink-soft);
  }

  .opciones {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .opcion {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.7rem 0.85rem;
    border-radius: 12px;
    border: 1px solid var(--line);
    cursor: pointer;
  }

  .opcion:hover {
    border-color: rgba(15, 15, 15, 0.3);
  }

  .opcion.elegida {
    border-color: var(--ink);
    background: rgba(215, 255, 61, 0.25);
  }

  .opcion input {
    flex-shrink: 0;
    accent-color: var(--ink);
  }

  .opcion-texto {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    flex: 1;
  }

  .opcion-detalle {
    font-size: 0.8rem;
    line-height: 1.4;
    color: var(--ink-soft);
  }

  .muestra {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.1rem;
    flex-shrink: 0;
    font-size: 0.8rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .muestra-baje {
    color: var(--peso-baje);
  }

  .muestra-subi {
    color: var(--peso-subi);
  }

  .acciones {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    margin-top: 1rem;
  }

  button {
    padding: 0.55rem 1.1rem;
    border-radius: 999px;
    border: 1px solid var(--ink);
    background: var(--ink);
    color: #ffffff;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ok {
    font-size: 0.85rem;
    font-weight: 700;
    color: #166534;
  }

  .error {
    margin-bottom: 0.8rem;
    padding: 0.6rem 0.85rem;
    border-radius: 10px;
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.3);
    font-size: 0.85rem;
  }
</style>
