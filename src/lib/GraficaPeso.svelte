<script lang="ts">
  // Peso a lo largo del tiempo: lo ALTO es el peso (kg) y lo LARGO es la fecha.
  // El selector de arriba es el "zoom out": de 1 mes (los días del mes en el
  // eje) hasta todo el historial (los meses en el eje). Una sola serie, así que
  // es una línea sin leyenda -- el título ya dice qué se grafica -- en el mismo
  // morado que identifica a "Peso" en la tabla.
  //
  // Se dibuja a mano en SVG (sin librería de gráficas). El eje X es la ventana
  // COMPLETA de meses, no solo los días con dato: así un mes a medias se ve a
  // medias, y los días sin pesar se ven como huecos entre los puntos. La línea
  // une las pesadas, pero se CORTA cuando pasan más de HUECO_MAX_DIAS sin pesar:
  // no se inventa una tendencia sobre semanas que nadie midió. El eje Y NO parte
  // de cero -- en una línea lo que importa es la variación, y desde cero todo
  // sería una recta.
  //
  // Esta gráfica no sabe de dónde salen los datos: quien la usa le da los puntos
  // ya recortados a la ventana [desde, hasta] (que siempre son meses completos:
  // `desde` es día 1 y `hasta` el último día de un mes) y escucha el cambio de
  // rango por `onRango`.
  //
  // Interacción (la gráfica es interactiva por default): una cruz vertical se
  // pega al día medido más cercano y un tooltip da fecha, peso y cambio. Funciona
  // con mouse, con el dedo (arrastrar) y con teclado (flechas). La tabla de abajo
  // trae los mismos datos del mes, así que el tooltip nunca es la única vía.
  type Punto = {
    // YYYY-MM-DD
    fecha: string;
    peso: number;
    // Cambio contra el último día pesado anterior (puede ser de otro mes); null si no hay.
    delta: number | null;
  };

  let {
    puntos,
    desde,
    hasta,
    rango,
    onRango,
    cargando = false,
    errorRango = null,
    etiquetaFecha
  }: {
    puntos: Punto[];
    desde: string;
    hasta: string;
    // Meses que pidió el usuario (0 = todo el historial). La ventana real puede
    // ser más corta si el historial no llega tan atrás.
    rango: number;
    onRango: (rango: number) => void;
    // Mientras llega el historial para un rango mayor, se sigue mostrando lo que
    // había (atenuado) en vez de vaciar la tarjeta.
    cargando?: boolean;
    errorRango?: string | null;
    // "Sáb 24 oct 2026": la da quien usa la gráfica, para que se lea igual que la tabla.
    etiquetaFecha: (fecha: string) => string;
  } = $props();

  const OPCIONES = [
    { valor: 1, texto: '1 mes' },
    { valor: 3, texto: '3 meses' },
    { valor: 6, texto: '6 meses' },
    { valor: 12, texto: '1 año' },
    { valor: 0, texto: 'Todo' }
  ];

  // El mismo morado de la columna Peso (validado: contraste y croma de sobra).
  const COLOR = '#6d28d9';

  // Márgenes dentro del lienzo: izquierda para los números del eje, abajo para las fechas.
  const IZQ = 38;
  const DER = 16;
  const ARR = 16;

  // Dos pesadas con más días que esto de por medio no se unen con línea.
  const HUECO_MAX_DIAS = 14;

  // Lista fija en vez de Intl: la abreviatura ("sep" vs "sept.") cambia con la
  // versión de ICU del navegador y aquí se quiere exactamente esto siempre.
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_LARGOS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  // Día absoluto (días desde 1970, en UTC puro: sin horas ni zona horaria de por medio).
  const diaAbs = (f: string) => {
    const [y, m, d] = f.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };

  // --- La ventana de tiempo -----------------------------------------------
  // Un renglón por mes que abarca la ventana, con el día (0-based) en que empieza.
  const bandas = $derived.by(() => {
    const [y0, m0] = desde.split('-').map(Number);
    const [y1, m1] = hasta.split('-').map(Number);
    const out: { anio: number; mes: number; inicio: number; dias: number }[] = [];
    let inicio = 0;
    for (let k = y0 * 12 + (m0 - 1); k <= y1 * 12 + (m1 - 1); k++) {
      const anio = Math.floor(k / 12);
      const mes = k % 12;
      const dias = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
      out.push({ anio, mes, inicio, dias });
      inicio += dias;
    }
    return out;
  });
  const meses = $derived(bandas.length);
  const origen = $derived(diaAbs(desde));
  const totalDias = $derived(Math.max(Math.round(diaAbs(hasta) - origen) + 1, 1));
  // Si la ventana cruza de año, el eje lleva una segunda fila con los años.
  const conAnios = $derived(meses > 1 && bandas[0].anio !== bandas[meses - 1].anio);

  // Cada punto con su posición en la ventana (día 0 = `desde`).
  const pts = $derived(
    puntos
      .map((p) => ({ ...p, i: Math.round(diaAbs(p.fecha) - origen) }))
      .filter((p) => p.i >= 0 && p.i < totalDias)
  );

  // --- Dimensiones --------------------------------------------------------
  let ancho = $state(0);
  const movil = $derived(ancho > 0 && ancho < 480);
  const plotH = $derived(movil ? 148 : 188);
  const aba = $derived(conAnios ? 42 : 26);
  const alto = $derived(ARR + plotH + aba);
  const plotW = $derived(Math.max(ancho - IZQ - DER, 1));

  // Escala vertical: el rango de los datos con un poco de aire, y marcas en pasos
  // "redondos" (0.5, 1, 2, 5, 10 kg) -- las más finas que den ~5 renglones o menos.
  const escala = $derived.by(() => {
    if (pts.length === 0) return null;
    const pesos = pts.map((p) => p.peso);
    const min = Math.min(...pesos);
    const max = Math.max(...pesos);
    const base = Math.max(max - min, 2); // una ventana plana o de un solo punto no se aplasta
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
  // así el primer día y el último no quedan pegados a los bordes.
  const x = (i: number) => IZQ + ((i + 0.5) / totalDias) * plotW;
  // Borde izquierdo del día `i` (admite fracciones): para los límites de cada mes.
  const xBorde = (i: number) => IZQ + (i / totalDias) * plotW;
  const y = (peso: number) => {
    const e = escala;
    if (!e) return ARR + plotH;
    return ARR + (1 - (peso - e.lo) / (e.hi - e.lo)) * plotH;
  };
  const textoMarca = (v: number) =>
    v.toLocaleString('es-MX', {
      minimumFractionDigits: escala && escala.paso < 1 ? 1 : 0,
      maximumFractionDigits: escala && escala.paso < 1 ? 1 : 0
    });

  // --- Eje X --------------------------------------------------------------
  // Un solo mes: los días. Etiquetas según el espacio: todos si caben, si no 1, 5,
  // 10, 15... y en un teléfono muy angosto 1, 10, 20, 30.
  const diasConEtiqueta = $derived.by(() => {
    if (meses !== 1) return [];
    const sep = plotW / totalDias;
    const dias: number[] = [];
    for (let d = 1; d <= totalDias; d++) {
      if (sep >= 20) dias.push(d);
      else if (sep >= 8) {
        if (d === 1 || d % 5 === 0) dias.push(d);
      } else if (d === 1 || d % 10 === 0) dias.push(d);
    }
    return dias;
  });

  // Varios meses: el nombre de cada mes centrado en su tramo (completo si cabe,
  // si no 3 letras), y si ni así caben todos, uno de cada `paso` -- contando desde
  // el ÚLTIMO mes, que es el de la tabla y siempre lleva etiqueta.
  const etiquetasMes = $derived.by(() => {
    const n = bandas.length;
    if (n <= 1) return [];
    const anchoBanda = plotW / n;
    const largo = anchoBanda >= 84;
    const paso = Math.max(1, Math.ceil((largo ? 72 : 26) / anchoBanda));
    const out: { k: number; texto: string; centro: number; borde: number }[] = [];
    for (let k = 0; k < n; k++) {
      if ((n - 1 - k) % paso !== 0) continue;
      const b = bandas[k];
      out.push({
        k,
        texto: largo ? MESES_LARGOS[b.mes] : MESES_CORTOS[b.mes],
        centro: xBorde(b.inicio + b.dias / 2),
        borde: xBorde(b.inicio)
      });
    }
    return out;
  });

  // Segunda fila del eje cuando la ventana cruza de año: cada año centrado bajo
  // sus meses. Si su tramo es más angosto que el número (~27px: en un teléfono,
  // un solo diciembre mide ~20px), el primer y el último año se pegan al borde de
  // su tramo en vez de desaparecer; uno de en medio nunca es tan angosto.
  const segmentosAnio = $derived.by(() => {
    if (!conAnios) return [];
    const segs: { anio: number; x0: number; x1: number }[] = [];
    for (const b of bandas) {
      const x1 = xBorde(b.inicio + b.dias);
      const ult = segs[segs.length - 1];
      if (ult && ult.anio === b.anio) ult.x1 = x1;
      else segs.push({ anio: b.anio, x0: xBorde(b.inicio), x1 });
    }
    return segs.flatMap((s, k) => {
      if (s.x1 - s.x0 >= 28) return [{ anio: s.anio, x: (s.x0 + s.x1) / 2, ancla: 'middle' }];
      if (k === 0) return [{ anio: s.anio, x: s.x0, ancla: 'start' }];
      if (k === segs.length - 1) return [{ anio: s.anio, x: s.x1, ancla: 'end' }];
      return [];
    });
  });

  // --- La línea y los puntos ----------------------------------------------
  const trazo = $derived.by(() => {
    let d = '';
    let previo = -Infinity;
    for (const p of pts) {
      d += `${p.i - previo > HUECO_MAX_DIAS ? 'M' : 'L'}${x(p.i)},${y(p.peso)} `;
      previo = p.i;
    }
    return d.trim();
  });
  const hayLinea = $derived(pts.some((p, k) => k > 0 && p.i - pts[k - 1].i <= HUECO_MAX_DIAS));

  // Un marcador por pesada mientras quepan (~10px por punto o más). Con 3 meses
  // pesados todos los días serían ~90 puntos encimados: entonces solo se dibujan
  // el último, el activo y los puntos aislados (los que ningún segmento toca, que
  // si no desaparecerían), y la línea lleva el resto.
  const conMarcadores = $derived(pts.length * 10 <= plotW);
  function marcadorVisible(k: number): boolean {
    if (conMarcadores || k === pts.length - 1 || k === activo) return true;
    const unidoAntes = k > 0 && pts[k].i - pts[k - 1].i <= HUECO_MAX_DIAS;
    const unidoDespues = k < pts.length - 1 && pts[k + 1].i - pts[k].i <= HUECO_MAX_DIAS;
    return !unidoAntes && !unidoDespues;
  }

  // Resumen de la ventana (primer y último peso) -- el titular que la gráfica ilustra.
  const resumen = $derived.by(() => {
    if (pts.length === 0) return null;
    const primero = pts[0];
    const ultimo = pts[pts.length - 1];
    const cambio = Math.round((ultimo.peso - primero.peso) * 10) / 10;
    return { primero: primero.peso, ultimo: ultimo.peso, cambio, n: pts.length };
  });

  const periodo = $derived(meses === 1 ? 'del mes' : `de ${meses} meses`);
  const sinPesos = $derived(
    meses === 1 ? 'Aún no hay pesos capturados este mes.' : `Aún no hay pesos capturados en estos ${meses} meses.`
  );

  const descripcion = $derived.by(() => {
    if (!resumen || !escala) return sinPesos;
    const pesos = pts.map((p) => p.peso);
    return `Peso ${periodo}: ${resumen.n} mediciones, de ${fmt(resumen.primero)} a ${fmt(resumen.ultimo)} kg; mínimo ${fmt(Math.min(...pesos))}, máximo ${fmt(Math.max(...pesos))}.`;
  });

  // --- Hover / toque / teclado -------------------------------------------
  let activo = $state<number | null>(null);
  const puntoActivo = $derived(activo !== null ? (pts[activo] ?? null) : null);

  // Al cambiar de ventana (otros puntos), no queda un índice apuntando a nada.
  $effect(() => {
    void pts;
    activo = null;
  });

  function masCercano(pxLienzo: number): number | null {
    if (pts.length === 0) return null;
    let mejor = 0;
    let dist = Infinity;
    pts.forEach((p, k) => {
      const d = Math.abs(x(p.i) - pxLienzo);
      if (d < dist) {
        dist = d;
        mejor = k;
      }
    });
    return mejor;
  }

  function alMover(e: PointerEvent) {
    // La capa transparente empieza en IZQ del lienzo; se pasa a coordenadas del lienzo.
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    activo = masCercano(e.clientX - r.left + IZQ);
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
    if (pts.length === 0) return;
    const ultimo = pts.length - 1;
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
    if (activo === null && pts.length > 0) activo = pts.length - 1;
  }

  // El tooltip se mide para poder centrarlo sobre su punto SIN salirse del lienzo
  // (con offsetWidth/offsetHeight, que sí cuentan el borde: con clientWidth el
  // globo se asomaba 2px por el lado donde lo frena el borde del lienzo).
  let tipW = $state(0);
  let tipH = $state(0);
  const tip = $derived.by(() => {
    const p = puntoActivo;
    if (!p || tipW === 0) return null;
    const px = x(p.i);
    const py = y(p.peso);
    const left = Math.min(Math.max(px - tipW / 2, 0), Math.max(ancho - tipW, 0));
    // Arriba del punto; si no cabe (punto cerca del tope), abajo.
    const arriba = py - tipH - 12;
    const top = arriba >= 0 ? arriba : py + 14;
    return { left, top };
  });
</script>

<svelte:window onpointerdown={alTocarFuera} />

<section class="grafica" aria-label={meses === 1 ? 'Gráfica del peso del mes' : `Gráfica del peso de ${meses} meses`}>
  <header class="grafica-cabecera">
    <h2>Peso {periodo} <span class="unidad">(kg)</span></h2>
    {#if resumen}
      <p class="resumen">
        {#if resumen.n === 1}
          <!-- Un solo peso: no hay "de A a B" ni cambio que contar. -->
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

  <!-- El zoom: solo mueve la gráfica (la tabla y el mes en pantalla no cambian). -->
  <div class="rangos" role="group" aria-label="Meses que abarca la gráfica">
    {#each OPCIONES as o (o.valor)}
      <button
        type="button"
        class="rango"
        class:activo={rango === o.valor}
        aria-pressed={rango === o.valor}
        onclick={() => onRango(o.valor)}
      >{o.texto}</button>
    {/each}
  </div>
  {#if errorRango}
    <p class="aviso-rango" role="status">⚠️ {errorRango}</p>
  {/if}

  <div class="area" class:atenuada={cargando} aria-busy={cargando}>
    {#if pts.length === 0}
      <p class="vacia">{sinPesos}</p>
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
              <line class="rejilla" x1={IZQ} x2={ancho - DER} y1={y(v)} y2={y(v)} />
              <text class="eje" x={IZQ - 8} y={y(v)} text-anchor="end" dominant-baseline="middle">{textoMarca(v)}</text>
            {/each}

            <!-- Eje X: los días del mes, o los meses (con una fila de años si cruza de año). -->
            {#if meses === 1}
              {#each diasConEtiqueta as d (d)}
                <text class="eje" x={x(d - 1)} y={ARR + plotH + 18} text-anchor="middle">{d}</text>
              {/each}
            {:else}
              {#each etiquetasMes as e (e.k)}
                {#if e.k > 0}
                  <line class="rejilla" x1={e.borde} x2={e.borde} y1={ARR} y2={ARR + plotH} />
                {/if}
                <text class="eje" x={e.centro} y={ARR + plotH + 18} text-anchor="middle">{e.texto}</text>
              {/each}
              {#each segmentosAnio as s (s.anio)}
                <text class="eje eje-anio" x={s.x} y={ARR + plotH + 35} text-anchor={s.ancla}>{s.anio}</text>
              {/each}
            {/if}

            <!-- Cruz vertical: busca el DÍA (nadie apunta a una línea de 2px). -->
            {#if puntoActivo}
              <line class="cruz" x1={x(puntoActivo.i)} x2={x(puntoActivo.i)} y1={ARR} y2={ARR + plotH} />
            {/if}

            {#if hayLinea}
              <path class="linea" d={trazo} stroke={COLOR} />
            {/if}

            <!-- Marcadores: 8px de diámetro + anillo de 2px del color de la superficie
                 (para que se distingan donde la línea los cruza). El activo crece. -->
            {#each pts as p, k (p.fecha)}
              {#if marcadorVisible(k)}
                <circle cx={x(p.i)} cy={y(p.peso)} r={k === activo ? 8 : 6} fill="#ffffff" />
                <circle cx={x(p.i)} cy={y(p.peso)} r={k === activo ? 6 : 4} fill={COLOR} />
              {/if}
            {/each}

            <!-- Etiqueta directa: solo el valor final (no un número en cada punto), a la
                 DERECHA de su punto: la serie termina ahí, así que nada la cruza. Si
                 no cabe a la derecha (último día pegado al borde), va arriba. -->
            {#if pts.length > 0}
              {@const u = pts[pts.length - 1]}
              {@const derecha = x(u.i) <= ancho - 30}
              <text
                class="valor-final"
                x={derecha ? x(u.i) + 10 : x(u.i)}
                y={derecha ? y(u.peso) : y(u.peso) - 12}
                text-anchor={derecha ? 'start' : 'end'}
                dominant-baseline={derecha ? 'middle' : 'auto'}
              >{fmt(u.peso)}</text>
            {/if}

            <!-- Capa transparente que recibe el puntero sobre toda el área de la gráfica. -->
            <rect
              class="captura"
              role="presentation"
              x={IZQ}
              y={ARR}
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
              bind:offsetWidth={tipW}
              bind:offsetHeight={tipH}
            >
              <span class="tip-fecha">{etiquetaFecha(puntoActivo.fecha)}</span>
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
  </div>
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

  /* Selector de rango: pastillas conectadas. Lo seleccionado va en negro sólido,
     como el resto de los "esto está activo" de la app (la señal es el relleno y
     el aria-pressed, no un color); el hover es el volt de los demás botones. */
  .rangos {
    display: inline-flex;
    max-width: 100%;
    gap: 2px;
    padding: 2px;
    margin: 0.1rem 0 0.55rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: #ffffff;
  }

  .rango {
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.2;
    padding: 0.3rem 0.75rem;
    white-space: nowrap;
    cursor: pointer;
  }

  .rango:hover:not(.activo) {
    background: var(--volt);
  }

  .rango.activo {
    background: var(--ink);
    color: #ffffff;
  }

  .rango:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }

  /* En el teléfono el selector ocupa todo el ancho (cada opción se reparte el
     espacio) y los botones son más altos para el dedo. */
  @media (max-width: 520px) {
    .rangos {
      display: flex;
    }

    .rango {
      flex: 1 1 auto;
      min-height: 2.25rem;
      padding: 0 0.3rem;
      text-align: center;
    }
  }

  .aviso-rango {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    color: var(--ink);
  }

  /* Mientras llega el historial de un rango mayor se conserva lo que ya estaba
     dibujado, atenuado: sin parpadeo ni salto de altura. */
  .area {
    transition: opacity 0.15s;
  }

  .area.atenuada {
    opacity: 0.5;
  }

  @media (prefers-reduced-motion: reduce) {
    .area {
      transition: none;
    }
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

  .eje-anio {
    font-weight: 700;
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
