<script lang="ts">
  // Peso a lo largo del mes: lo ALTO es el peso (kg) y lo LARGO es el día del
  // mes. Una sola serie, así que es una línea sin leyenda -- el título ya dice
  // qué se grafica -- en el mismo morado que identifica a "Peso" en la tabla.
  //
  // Se dibuja a mano en SVG (sin librería de gráficas). El eje X es el mes
  // COMPLETO, no solo los días con dato: así un mes a medias se ve a medias, y
  // los días sin pesar se ven como huecos entre los puntos (cada medición es un
  // punto; la línea solo los une). El eje Y NO parte de cero -- en una línea lo
  // que importa es la variación, y desde cero todo el mes sería una recta.
  //
  // Interacción (la gráfica es interactiva por default): una cruz vertical se
  // pega al día medido más cercano y un tooltip da fecha, peso y cambio. Funciona
  // con mouse, con el dedo (arrastrar) y con teclado (flechas). La tabla de abajo
  // trae los mismos datos, así que el tooltip nunca es la única vía.
  type Punto = {
    // Día del mes (1-31).
    dia: number;
    // "Sáb 24 oct 2026": ya formateada por quien la manda.
    etiqueta: string;
    peso: number;
    // Cambio contra el último día pesado anterior (puede ser de otro mes); null si no hay.
    delta: number | null;
  };

  let { puntos, diasDelMes }: { puntos: Punto[]; diasDelMes: number } = $props();

  // El mismo morado de la columna Peso (validado: contraste y croma de sobra).
  const COLOR = '#6d28d9';

  let ancho = $state(0);
  const alto = $derived(ancho > 0 && ancho < 480 ? 190 : 230);
  // Márgenes dentro del lienzo: izquierda para los números del eje, abajo para los días.
  const M = { izq: 38, der: 16, arr: 16, aba: 26 };
  const plotW = $derived(Math.max(ancho - M.izq - M.der, 1));
  const plotH = $derived(Math.max(alto - M.arr - M.aba, 1));

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  // Escala vertical: el rango de los datos con un poco de aire, y marcas en pasos
  // "redondos" (0.5, 1, 2, 5, 10 kg) -- las más finas que den ~5 renglones o menos.
  const escala = $derived.by(() => {
    if (puntos.length === 0) return null;
    const pesos = puntos.map((p) => p.peso);
    const min = Math.min(...pesos);
    const max = Math.max(...pesos);
    const base = Math.max(max - min, 2); // un mes plano o de un solo punto no se aplasta
    const lo0 = min - base * 0.12;
    const hi0 = max + base * 0.12;
    const paso = [0.5, 1, 2, 5, 10].find((p) => (hi0 - lo0) / p <= 5) ?? 10;
    const lo = Math.floor(lo0 / paso) * paso;
    const hi = Math.ceil(hi0 / paso) * paso;
    const marcas: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += paso) marcas.push(Math.round(v * 100) / 100);
    return { lo, hi, paso, marcas };
  });

  // Cada día es una "banda" del mismo ancho y el punto cae al centro de la suya:
  // así el día 1 y el último no quedan pegados a los bordes.
  const x = (dia: number) => M.izq + ((dia - 0.5) / diasDelMes) * plotW;
  const y = (peso: number) => {
    const e = escala;
    if (!e) return M.arr + plotH;
    return M.arr + (1 - (peso - e.lo) / (e.hi - e.lo)) * plotH;
  };
  const textoMarca = (v: number) =>
    v.toLocaleString('es-MX', {
      minimumFractionDigits: escala && escala.paso < 1 ? 1 : 0,
      maximumFractionDigits: escala && escala.paso < 1 ? 1 : 0
    });

  // Etiquetas del eje X según el espacio: todos los días si caben, si no 1, 5,
  // 10, 15... y en un teléfono muy angosto 1, 10, 20, 30.
  const diasConEtiqueta = $derived.by(() => {
    const sep = plotW / diasDelMes;
    const dias: number[] = [];
    for (let d = 1; d <= diasDelMes; d++) {
      if (sep >= 20) dias.push(d);
      else if (sep >= 8) {
        if (d === 1 || d % 5 === 0) dias.push(d);
      } else if (d === 1 || d % 10 === 0) dias.push(d);
    }
    return dias;
  });

  const trazo = $derived(puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.dia)},${y(p.peso)}`).join(' '));

  // Resumen del mes (primer y último peso) -- el titular que la gráfica ilustra.
  const resumen = $derived.by(() => {
    if (puntos.length === 0) return null;
    const primero = puntos[0];
    const ultimo = puntos[puntos.length - 1];
    const cambio = Math.round((ultimo.peso - primero.peso) * 10) / 10;
    return { primero: primero.peso, ultimo: ultimo.peso, cambio, n: puntos.length };
  });

  const descripcion = $derived.by(() => {
    if (!resumen || !escala) return 'Sin pesos capturados este mes.';
    const pesos = puntos.map((p) => p.peso);
    return `Peso del mes: ${resumen.n} mediciones, de ${fmt(resumen.primero)} a ${fmt(resumen.ultimo)} kg; mínimo ${fmt(Math.min(...pesos))}, máximo ${fmt(Math.max(...pesos))}.`;
  });

  // --- Hover / toque / teclado -------------------------------------------
  let activo = $state<number | null>(null);
  const puntoActivo = $derived(activo !== null ? (puntos[activo] ?? null) : null);

  // Al cambiar de mes (otros puntos), no queda un índice apuntando a nada.
  $effect(() => {
    void puntos;
    activo = null;
  });

  function masCercano(pxLienzo: number): number | null {
    if (puntos.length === 0) return null;
    let mejor = 0;
    let dist = Infinity;
    puntos.forEach((p, i) => {
      const d = Math.abs(x(p.dia) - pxLienzo);
      if (d < dist) {
        dist = d;
        mejor = i;
      }
    });
    return mejor;
  }

  function alMover(e: PointerEvent) {
    // La capa transparente empieza en M.izq del lienzo; se pasa a coordenadas del lienzo.
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    activo = masCercano(e.clientX - r.left + M.izq);
  }

  function alSalir(e: PointerEvent) {
    // Con el dedo, soltar dispara "salir": el tooltip se quedaría imposible de
    // leer. En touch se queda hasta tocar fuera (ver alTocarFuera).
    if (e.pointerType !== 'touch') activo = null;
  }

  let lienzoEl = $state<HTMLDivElement | null>(null);
  function alTocarFuera(e: PointerEvent) {
    if (activo !== null && e.pointerType === 'touch' && lienzoEl && !lienzoEl.contains(e.target as Node)) {
      activo = null;
    }
  }

  function alTeclear(e: KeyboardEvent) {
    if (puntos.length === 0) return;
    const ultimo = puntos.length - 1;
    if (e.key === 'ArrowRight') activo = activo === null ? 0 : Math.min(activo + 1, ultimo);
    else if (e.key === 'ArrowLeft') activo = activo === null ? ultimo : Math.max(activo - 1, 0);
    else if (e.key === 'Home') activo = 0;
    else if (e.key === 'End') activo = ultimo;
    else if (e.key === 'Escape') activo = null;
    else return;
    e.preventDefault();
  }

  // Al entrar con Tab, se arranca en la medición más reciente (la que se quiere ver).
  function alEnfocar() {
    if (activo === null && puntos.length > 0) activo = puntos.length - 1;
  }

  // El tooltip se mide para poder centrarlo sobre su punto SIN salirse del lienzo.
  let tipW = $state(0);
  let tipH = $state(0);
  const tip = $derived.by(() => {
    const p = puntoActivo;
    if (!p || tipW === 0) return null;
    const px = x(p.dia);
    const py = y(p.peso);
    const left = Math.min(Math.max(px - tipW / 2, 0), Math.max(ancho - tipW, 0));
    // Arriba del punto; si no cabe (punto cerca del tope), abajo.
    const arriba = py - tipH - 12;
    const top = arriba >= 0 ? arriba : py + 14;
    return { left, top };
  });
</script>

<svelte:window onpointerdown={alTocarFuera} />

<section class="grafica" aria-label="Gráfica del peso del mes">
  <header class="grafica-cabecera">
    <h2>Peso del mes <span class="unidad">(kg)</span></h2>
    {#if resumen}
      <p class="resumen">
        {#if resumen.n === 1}
          <!-- Un solo peso en el mes: no hay "de A a B" ni cambio que contar. -->
          {fmt(resumen.ultimo)} kg
        {:else}
          {fmt(resumen.primero)} → {fmt(resumen.ultimo)} kg
          {#if resumen.cambio !== 0}
            <!-- El sentido va en el símbolo (▼/▲) y en el texto, no solo en el color. -->
            <span class="cambio" class:baja={resumen.cambio < 0} class:sube={resumen.cambio > 0}>
              <span class="flecha" aria-hidden="true">{resumen.cambio < 0 ? '▼' : '▲'}</span>
              {resumen.cambio < 0 ? 'bajaste' : 'subiste'}
              {fmt(Math.abs(resumen.cambio))}
            </span>
          {:else}
            <span class="cambio">sin cambio</span>
          {/if}
        {/if}
      </p>
    {/if}
  </header>

  {#if puntos.length === 0}
    <p class="vacia">Aún no hay pesos capturados este mes.</p>
  {:else}
    <!-- Widget propio: role="application" + aria-label que dice cómo se usa (flechas).
         Svelte no reconoce "application" como interactivo y avisa por el tabindex y
         por los handlers de teclado; aquí son justamente lo que lo hace un widget. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="lienzo"
      style="height: {alto}px"
      bind:clientWidth={ancho}
      bind:this={lienzoEl}
      role="application"
      aria-label="Peso por día. Usa las flechas izquierda y derecha para recorrer las mediciones."
      tabindex="0"
      onkeydown={alTeclear}
      onfocus={alEnfocar}
      onblur={() => (activo = null)}
    >
      {#if ancho > 0 && escala}
        <svg width={ancho} height={alto} viewBox="0 0 {ancho} {alto}" role="img" aria-label={descripcion}>
          <!-- Rejilla: un hairline recesivo por marca del eje Y, con su número. -->
          {#each escala.marcas as v (v)}
            <line class="rejilla" x1={M.izq} x2={ancho - M.der} y1={y(v)} y2={y(v)} />
            <text class="eje" x={M.izq - 8} y={y(v)} text-anchor="end" dominant-baseline="middle">{textoMarca(v)}</text>
          {/each}

          {#each diasConEtiqueta as d (d)}
            <text class="eje" x={x(d)} y={alto - 8} text-anchor="middle">{d}</text>
          {/each}

          <!-- Cruz vertical: busca el DÍA (nadie apunta a una línea de 2px). -->
          {#if puntoActivo}
            <line class="cruz" x1={x(puntoActivo.dia)} x2={x(puntoActivo.dia)} y1={M.arr} y2={M.arr + plotH} />
          {/if}

          {#if puntos.length > 1}
            <path class="linea" d={trazo} stroke={COLOR} />
          {/if}

          <!-- Marcadores: 8px de diámetro + anillo de 2px del color de la superficie
               (para que se distingan donde la línea los cruza). El activo crece. -->
          {#each puntos as p, i (p.dia)}
            <circle cx={x(p.dia)} cy={y(p.peso)} r={i === activo ? 8 : 6} fill="#ffffff" />
            <circle cx={x(p.dia)} cy={y(p.peso)} r={i === activo ? 6 : 4} fill={COLOR} />
          {/each}

          <!-- Etiqueta directa: solo el valor final (no un número en cada punto). -->
          {#if puntos.length > 0}
            {@const u = puntos[puntos.length - 1]}
            <text
              class="valor-final"
              x={x(u.dia)}
              y={y(u.peso) - 12}
              text-anchor={x(u.dia) > ancho - 34 ? 'end' : 'middle'}
            >{fmt(u.peso)}</text>
          {/if}

          <!-- Capa transparente que recibe el puntero sobre toda el área de la gráfica. -->
          <rect
            class="captura"
            role="presentation"
            x={M.izq}
            y={M.arr}
            width={plotW}
            height={plotH}
            fill="transparent"
            onpointermove={alMover}
            onpointerdown={alMover}
            onpointerleave={alSalir}
          />
        </svg>

        {#if puntoActivo}
          <div
            class="tip"
            class:oculto={!tip}
            style={tip ? `left: ${tip.left}px; top: ${tip.top}px` : ''}
            role="status"
            bind:clientWidth={tipW}
            bind:clientHeight={tipH}
          >
            <span class="tip-fecha">{puntoActivo.etiqueta}</span>
            <span class="tip-valor">{fmt(puntoActivo.peso)} <small>kg</small></span>
            {#if puntoActivo.delta !== null}
              <span class="tip-delta">
                {#if puntoActivo.delta === 0}
                  sin cambio
                {:else}
                  <span class="flecha" class:baja={puntoActivo.delta < 0} class:sube={puntoActivo.delta > 0} aria-hidden="true">{puntoActivo.delta < 0 ? '▼' : '▲'}</span>
                  {puntoActivo.delta < 0 ? 'bajó' : 'subió'} {fmt(Math.abs(puntoActivo.delta))} kg
                {/if}
              </span>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>

<style>
  /* Misma tarjeta que la tabla de abajo (borde, radio, fondo), para que se lean
     como un solo bloque. */
  .grafica {
    padding: 0.85rem 1rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #ffffff;
  }

  .grafica-cabecera {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.2rem 1rem;
    margin-bottom: 0.4rem;
  }

  h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--ink);
  }

  .unidad {
    font-weight: 600;
    color: var(--ink-soft);
  }

  .resumen {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }

  /* Los colores de sube/baja salen de los tokens del filtro de daltonismo (los
     mismos de los triangulitos de la tabla), y además van con símbolo y texto. */
  .cambio {
    margin-left: 0.35rem;
    font-weight: 600;
    color: var(--ink);
  }

  .flecha.baja,
  .cambio.baja .flecha {
    color: var(--peso-baje);
  }

  .flecha.sube,
  .cambio.sube .flecha {
    color: var(--peso-subi);
  }

  .flecha {
    font-size: 0.7em;
  }

  .vacia {
    margin: 0.2rem 0 0.4rem;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }

  .lienzo {
    position: relative;
    width: 100%;
    border-radius: 8px;
    /* Con el dedo, arrastrar en vertical sigue haciendo scroll de la página;
       solo el arrastre horizontal recorre la gráfica. */
    touch-action: pan-y;
  }

  .lienzo:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  svg {
    display: block;
    overflow: visible;
    font-family: inherit;
  }

  .rejilla {
    stroke: var(--line);
    stroke-width: 1;
  }

  .eje {
    fill: var(--ink-soft);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .cruz {
    stroke: rgba(15, 15, 15, 0.35);
    stroke-width: 1;
  }

  .linea {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  /* El texto lleva tinta de texto, nunca el color de la serie; el halo blanco lo
     separa de la línea que pase por detrás. */
  .valor-final {
    fill: var(--ink);
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    paint-order: stroke;
    stroke: #ffffff;
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .captura {
    cursor: crosshair;
  }

  /* Tooltip: el VALOR manda (grande, en tinta fuerte); la fecha y el cambio van
     en secundario. */
  .tip {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.45rem 0.65rem;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 6px 18px rgba(15, 15, 15, 0.14);
    white-space: nowrap;
    pointer-events: none;
  }

  .tip.oculto {
    visibility: hidden;
  }

  .tip-fecha {
    font-size: 0.75rem;
    color: var(--ink-soft);
  }

  .tip-valor {
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .tip-valor small {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .tip-delta {
    font-size: 0.75rem;
    color: var(--ink-soft);
  }
</style>
