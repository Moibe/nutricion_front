<script lang="ts">
  // Peso a lo largo del tiempo: lo ALTO es el peso (kg) y lo LARGO es la fecha.
  // Una sola serie, así que es una línea sin leyenda -- el título ya dice qué se
  // grafica -- en el mismo morado que identifica a "Peso" en la tabla.
  //
  // Se dibuja a mano en SVG (sin librería de gráficas). El eje X es TIEMPO
  // continuo (no solo los días con dato): los días sin pesar se ven como huecos.
  // La línea une las pesadas, pero se CORTA cuando pasan más de HUECO_MAX_DIAS sin
  // pesar: no se inventa una tendencia sobre semanas que nadie midió. El eje Y NO
  // parte de cero -- en una línea lo que importa es la variación.
  //
  // Zoom de verdad: la vista es un tramo [vi, vf) de días dentro del dominio
  // [dominioDesde, dominioHasta]. La rueda acerca/aleja alrededor del cursor, y
  // arrastrar con el mouse (o la rueda horizontal / Shift+rueda) se mueve en el
  // tiempo. El selector de arriba son atajos (1 mes, 3 meses... Todo) que fijan
  // la vista a esos meses; doble clic regresa al atajo elegido.
  //
  // Interacción de lectura: una cruz vertical se pega al día medido más cercano y
  // un tooltip da fecha, peso y cambio. Funciona con mouse, con el dedo y con
  // teclado (flechas; + y - hacen zoom). La tabla de abajo trae los mismos datos
  // del mes, así que el tooltip nunca es la única vía.
  import { untrack } from 'svelte';

  type Punto = {
    // YYYY-MM-DD
    fecha: string;
    peso: number;
    // Cambio contra el último día pesado anterior; null si no hay.
    delta: number | null;
  };

  let {
    puntos,
    desde,
    hasta,
    dominioDesde,
    dominioHasta,
    rango,
    onRango,
    cargando = false,
    errorRango = null,
    etiquetaFecha
  }: {
    // Todos los pesos del dominio (de más viejo a más nuevo).
    puntos: Punto[];
    // La ventana del atajo elegido (meses completos).
    desde: string;
    hasta: string;
    // Hasta dónde se puede alejar / desplazar.
    dominioDesde: string;
    dominioHasta: string;
    // Meses del atajo (0 = todo el historial).
    rango: number;
    onRango: (rango: number) => void;
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

  const IZQ = 38;
  const DER = 16;
  const ARR = 16;
  // Abajo: fila de fechas + fila de contexto (mes/año).
  const ABA = 42;

  const HUECO_MAX_DIAS = 14;
  // Lo más cerca que se puede acercar: una semana a lo ancho.
  const MIN_DIAS = 7;
  // Cuánto zoom da cada pixel de rueda (una muesca de mouse ≈ 100px ≈ ×1.22).
  const ZOOM_POR_PX = 0.002;

  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_LARGOS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');

  // Día absoluto (días desde 1970, en UTC puro).
  const diaAbs = (f: string) => {
    const [y, m, d] = f.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  const deAbs = (d: number) => {
    const t = new Date(Math.floor(d) * 86_400_000);
    return { anio: t.getUTCFullYear(), mes: t.getUTCMonth(), dia: t.getUTCDate() };
  };
  const absDeMes = (mi: number) => Date.UTC(Math.floor(mi / 12), mi % 12, 1) / 86_400_000;
  const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const textoDia = (d: number, conAnio: boolean) => {
    const f = deAbs(d);
    return `${f.dia} ${MESES_CORTOS[f.mes]}${conAnio ? ` ${f.anio}` : ''}`;
  };

  // --- Dominio y vista ------------------------------------------------------
  const D0 = $derived(diaAbs(dominioDesde));
  const D1 = $derived(Math.max(diaAbs(dominioHasta) + 1, D0 + MIN_DIAS));
  const total = $derived(D1 - D0);

  // La vista del atajo elegido.
  const pIni = $derived(diaAbs(desde));
  const pFin = $derived(diaAbs(hasta) + 1);

  let vi = $state(0);
  let vf = $state(1);
  const span = $derived(vf - vi);

  // Cada clic en un atajo (aunque sea el mismo) vuelve a fijar la vista.
  let pedido = $state(0);
  $effect(() => {
    const a = pIni;
    const b = pFin;
    void pedido;
    untrack(() => {
      vi = a;
      vf = b;
    });
  });

  function fijar(inicio: number, ancho: number) {
    const s = Math.min(Math.max(ancho, MIN_DIAS), total);
    const a = Math.min(Math.max(inicio, D0), D1 - s);
    vi = a;
    vf = a + s;
  }

  // ¿La vista es exactamente la del atajo? Si no, ninguna pastilla va marcada.
  const personalizada = $derived(Math.abs(vi - pIni) > 0.01 || Math.abs(vf - pFin) > 0.01);

  function elegir(r: number) {
    onRango(r);
    pedido++;
  }

  // --- Puntos ---------------------------------------------------------------
  const pts = $derived(
    puntos.map((p) => ({ ...p, d: diaAbs(p.fecha) })).filter((p) => p.d >= D0 && p.d < D1)
  );
  // Índices (en pts) de lo que cae dentro de la vista.
  const rangoVis = $derived.by(() => {
    let a = 0;
    while (a < pts.length && pts[a].d + 0.5 < vi) a++;
    let b = a;
    while (b < pts.length && pts[b].d + 0.5 <= vf) b++;
    return { a, b };
  });
  const vis = $derived(pts.slice(rangoVis.a, rangoVis.b).map((p, j) => ({ ...p, k: rangoVis.a + j })));
  // Para la línea: además, un punto a cada lado (la línea entra y sale del borde).
  const dibujados = $derived(pts.slice(Math.max(rangoVis.a - 1, 0), Math.min(rangoVis.b + 1, pts.length)));

  // --- Dimensiones --------------------------------------------------------
  let ancho = $state(0);
  const movil = $derived(ancho > 0 && ancho < 480);
  const plotH = $derived(movil ? 148 : 188);
  const alto = $derived(ARR + plotH + ABA);
  const plotW = $derived(Math.max(ancho - IZQ - DER, 1));
  const pxDia = $derived(plotW / span);

  // Escala vertical, de lo que se ve (si no se ve nada, de todo).
  const escala = $derived.by(() => {
    const base0 = vis.length > 0 ? vis : pts;
    if (base0.length === 0) return null;
    const pesos = base0.map((p) => p.peso);
    const min = Math.min(...pesos);
    const max = Math.max(...pesos);
    const base = Math.max(max - min, 2);
    const lo0 = min - base * 0.12;
    const hi0 = max + base * 0.12;
    const paso = [0.5, 1, 2, 5, 10].find((p) => (hi0 - lo0) / p <= 5) ?? 10;
    const lo = Math.floor(lo0 / paso) * paso;
    const hi = Math.ceil(hi0 / paso) * paso;
    const marcas: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += paso) marcas.push(Math.round(v * 100) / 100);
    return { lo, hi, paso, marcas };
  });

  // Centro del día `d` / borde izquierdo del día `d`.
  const x = (d: number) => IZQ + ((d + 0.5 - vi) / span) * plotW;
  const xBorde = (d: number) => IZQ + ((d - vi) / span) * plotW;
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
  const dentro = (px: number) => px >= IZQ - 0.5 && px <= IZQ + plotW + 0.5;

  // --- Eje X --------------------------------------------------------------
  // Según cuántos pixeles tiene cada día: con zoom cercano, días del mes (todos,
  // o 1, 5, 10... o 1, 10, 20); más lejos, meses (todos, o uno de cada 2, 3, 6,
  // 12). Las marcas se anclan al calendario (día 10, enero...) y no a la orilla,
  // así al desplazar se mueven con los datos en vez de bailar.
  const modoDias = $derived(span <= 75 && pxDia * 10 >= 28);

  const etiquetasDia = $derived.by(() => {
    if (!modoDias) return [];
    const paso = [1, 2, 5, 10].find((p) => pxDia * p >= 28) ?? 10;
    const out: { d: number; texto: string }[] = [];
    for (let d = Math.ceil(vi - 0.5); d + 0.5 <= vf; d++) {
      const f = deAbs(d);
      const finMes = diasDelMes(f.anio, f.mes);
      const ok = paso === 1 || f.dia === 1 || (f.dia % paso === 0 && finMes - f.dia >= paso / 2);
      if (ok && dentro(x(d))) out.push({ d, texto: String(f.dia) });
    }
    return out;
  });

  const etiquetasMes = $derived.by(() => {
    if (modoDias) return { lineas: [] as number[], textos: [] as { x: number; texto: string; mi: number }[] };
    const pxMes = pxDia * 30.44;
    const largo = pxMes >= 84;
    const paso = [1, 2, 3, 6, 12].find((p) => pxMes * p >= (largo ? 72 : 30)) ?? 12;
    const ini = deAbs(vi);
    const fin = deAbs(vf - 1e-6);
    const lineas: number[] = [];
    const textos: { x: number; texto: string; mi: number }[] = [];
    for (let mi = ini.anio * 12 + ini.mes; mi <= fin.anio * 12 + fin.mes; mi++) {
      if (mi % paso !== 0) continue;
      const a = absDeMes(mi);
      const b = absDeMes(mi + paso);
      const xa = xBorde(a);
      if (xa > IZQ + 0.5 && xa < IZQ + plotW - 0.5) lineas.push(xa);
      // Centrado en la parte visible de su tramo, si ahí cabe.
      // El texto va centrado en SU mes (la parte visible) y cabe si hay espacio
      // en todo el tramo hasta la siguiente marca.
      const texto = largo ? MESES_LARGOS[mi % 12] : MESES_CORTOS[mi % 12];
      const w = texto.length * 6.2;
      const va = Math.max(xa, IZQ);
      const vb = Math.min(xBorde(b), IZQ + plotW);
      const finMes = Math.min(xBorde(a + diasDelMes(Math.floor(mi / 12), mi % 12)), IZQ + plotW);
      if (vb - va >= w && finMes > va) {
        const cx = Math.min(Math.max((va + finMes) / 2, IZQ + w / 2), IZQ + plotW - w / 2);
        textos.push({ x: cx, texto, mi });
      }
    }
    return { lineas, textos };
  });

  // Fila de contexto: con días, "octubre 2026"; con meses, el año. Cada etiqueta
  // va al inicio de su tramo y se queda pegada a la orilla izquierda mientras su
  // tramo siga a la vista (como un encabezado fijo); la siguiente la empuja.
  const contexto = $derived.by(() => {
    const ini = deAbs(vi);
    const fin = deAbs(vf - 1e-6);
    const segs: { inicio: number; texto: string }[] = [];
    if (modoDias) {
      for (let mi = ini.anio * 12 + ini.mes; mi <= fin.anio * 12 + fin.mes; mi++) {
        segs.push({ inicio: absDeMes(mi), texto: `${MESES_LARGOS[mi % 12]} ${Math.floor(mi / 12)}` });
      }
    } else {
      for (let a = ini.anio; a <= fin.anio; a++) {
        segs.push({ inicio: Date.UTC(a, 0, 1) / 86_400_000, texto: String(a) });
      }
    }
    const out: { x: number; texto: string }[] = [];
    segs.forEach((s, k) => {
      const w = s.texto.length * 6.6;
      let px = Math.max(xBorde(s.inicio), IZQ);
      const sig = segs[k + 1];
      if (sig) px = Math.min(px, xBorde(sig.inicio) - w - 10);
      if (px + w > IZQ && px < IZQ + plotW) out.push({ x: px, texto: s.texto });
    });
    return out;
  });

  // Rejilla vertical con días: al empezar cada mes.
  const lineasDias = $derived.by(() => {
    if (!modoDias) return [];
    const ini = deAbs(vi);
    const fin = deAbs(vf - 1e-6);
    const out: number[] = [];
    for (let mi = ini.anio * 12 + ini.mes + 1; mi <= fin.anio * 12 + fin.mes; mi++) out.push(xBorde(absDeMes(mi)));
    return out;
  });

  // --- La línea y los puntos ----------------------------------------------
  const trazo = $derived.by(() => {
    let d = '';
    let previo = -Infinity;
    for (const p of dibujados) {
      d += `${p.d - previo > HUECO_MAX_DIAS ? 'M' : 'L'}${x(p.d)},${y(p.peso)} `;
      previo = p.d;
    }
    return d.trim();
  });
  const hayLinea = $derived(dibujados.some((p, k) => k > 0 && p.d - dibujados[k - 1].d <= HUECO_MAX_DIAS));

  // Un marcador por pesada mientras quepan (~10px por punto o más); si no, solo
  // el último, el activo y los aislados (los que ningún segmento toca).
  const conMarcadores = $derived(vis.length * 10 <= plotW);
  function marcadorVisible(k: number, fecha: string): boolean {
    if (conMarcadores || k === rangoVis.b - 1 || fecha === activoFecha) return true;
    const unidoAntes = k > 0 && pts[k].d - pts[k - 1].d <= HUECO_MAX_DIAS;
    const unidoDespues = k < pts.length - 1 && pts[k + 1].d - pts[k].d <= HUECO_MAX_DIAS;
    return !unidoAntes && !unidoDespues;
  }

  // Resumen de lo que se ve (primer y último peso).
  const resumen = $derived.by(() => {
    if (vis.length === 0) return null;
    const primero = vis[0];
    const ultimo = vis[vis.length - 1];
    const cambio = Math.round((ultimo.peso - primero.peso) * 10) / 10;
    return { primero: primero.peso, ultimo: ultimo.peso, cambio, n: vis.length };
  });

  const mesesAtajo = $derived.by(() => {
    const a = deAbs(pIni);
    const b = deAbs(pFin - 1);
    return (b.anio - a.anio) * 12 + (b.mes - a.mes) + 1;
  });
  const periodo = $derived.by(() => {
    if (!personalizada) return mesesAtajo === 1 ? 'del mes' : `de ${mesesAtajo} meses`;
    const a = Math.round(vi);
    const b = Math.round(vf) - 1;
    return `del ${textoDia(a, deAbs(a).anio !== deAbs(b).anio)} al ${textoDia(b, true)}`;
  });
  const sinPesos = $derived(
    mesesAtajo === 1 ? 'Aún no hay pesos capturados este mes.' : `Aún no hay pesos capturados en estos ${mesesAtajo} meses.`
  );

  const descripcion = $derived.by(() => {
    if (!resumen) return 'Sin pesos en este tramo.';
    const pesos = vis.map((p) => p.peso);
    return `Peso ${periodo}: ${resumen.n} mediciones, de ${fmt(resumen.primero)} a ${fmt(resumen.ultimo)} kg; mínimo ${fmt(Math.min(...pesos))}, máximo ${fmt(Math.max(...pesos))}.`;
  });

  // --- Hover / toque / teclado -------------------------------------------
  // El activo se guarda por FECHA (no por índice): al hacer zoom los índices cambian.
  let activoFecha = $state<string | null>(null);
  const puntoActivo = $derived(activoFecha !== null ? (vis.find((p) => p.fecha === activoFecha) ?? null) : null);

  function masCercano(pxLienzo: number): string | null {
    if (vis.length === 0) return null;
    let mejor = vis[0];
    let dist = Infinity;
    for (const p of vis) {
      const dd = Math.abs(x(p.d) - pxLienzo);
      if (dd < dist) {
        dist = dd;
        mejor = p;
      }
    }
    return mejor.fecha;
  }

  let lienzoEl = $state<HTMLDivElement | null>(null);
  const pxEnLienzo = (clientX: number) => (lienzoEl ? clientX - lienzoEl.getBoundingClientRect().left : 0);

  // --- Zoom con la rueda ----------------------------------------------------
  //  - Rueda vertical: acerca (arriba) / aleja (abajo) dejando fijo el día bajo
  //    el cursor. Continuo: un touchpad da un zoom suave, una muesca ≈ 22%.
  //  - Rueda horizontal o Shift+rueda: se mueve en el tiempo.
  //  - Si ya no se puede ir más en esa dirección (máximo acercamiento, todo el
  //    historial a la vista, la orilla), la rueda NO se intercepta y mueve la
  //    página -- salvo justo después de haber hecho zoom en ese mismo gesto (se
  //    traga ~300ms, para que llegar al tope no brinque la página).
  //  - Ctrl/⌘ + rueda (y el pellizco del touchpad) es el zoom de la PÁGINA: no se toca.
  //  - Un evento NO cancelable es parte de un scroll que el navegador ya empezó:
  //    no se le suma zoom (sería zoom y scroll de la página a la vez).
  const GESTO_MS = 300;
  let ultimoMovimiento = -Infinity;

  function rueda(nodo: HTMLElement) {
    function alRueda(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey || !e.cancelable) return;
      const f = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
      let dx = e.deltaX * f;
      let dy = e.deltaY * f;
      if (e.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      const ahora = performance.now();
      const enGesto = ahora - ultimoMovimiento < GESTO_MS;

      if (Math.abs(dx) > Math.abs(dy)) {
        const puede = dx < 0 ? vi > D0 + 1e-6 : vf < D1 - 1e-6;
        if (!puede) {
          if (enGesto) e.preventDefault();
          return;
        }
        e.preventDefault();
        fijar(vi + (dx / plotW) * span, span);
        ultimoMovimiento = ahora;
        return;
      }

      if (dy === 0) return;
      const puede = dy < 0 ? span > MIN_DIAS + 1e-6 : span < total - 1e-6;
      if (!puede) {
        if (enGesto) e.preventDefault();
        return;
      }
      e.preventDefault();
      const px = pxEnLienzo(e.clientX);
      const t = lienzoEl ? Math.min(Math.max((px - IZQ) / plotW, 0), 1) : 1;
      const nuevo = Math.min(Math.max(span * Math.exp(dy * ZOOM_POR_PX), MIN_DIAS), total);
      const centro = vi + t * span;
      fijar(centro - t * nuevo, nuevo);
      ultimoMovimiento = ahora;
      if (activoFecha !== null && lienzoEl) activoFecha = masCercano(px);
    }
    nodo.addEventListener('wheel', alRueda, { passive: false });
    return { destroy: () => nodo.removeEventListener('wheel', alRueda) };
  }

  // --- Arrastrar para moverse (mouse) --------------------------------------
  let arrastre = $state<{ x0: number; vi0: number; movido: boolean } | null>(null);
  const sePuedeMover = $derived(span < total - 1e-6);

  function alBajar(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      arrastre = { x0: e.clientX, vi0: vi, movido: false };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
    activoFecha = masCercano(pxEnLienzo(e.clientX));
  }

  function alMover(e: PointerEvent) {
    const a = arrastre;
    if (a && e.pointerType === 'mouse') {
      const dPx = e.clientX - a.x0;
      if (!a.movido && Math.abs(dPx) > 3 && sePuedeMover) a.movido = true;
      if (a.movido) {
        fijar(a.vi0 - (dPx / plotW) * span, span);
        activoFecha = null;
        return;
      }
    }
    activoFecha = masCercano(pxEnLienzo(e.clientX));
  }

  function alSoltar() {
    arrastre = null;
  }

  function alSalir(e: PointerEvent) {
    if (e.pointerType !== 'touch' && !arrastre) activoFecha = null;
  }

  function alTocarFuera(e: PointerEvent) {
    if (activoFecha !== null && e.pointerType === 'touch' && lienzoEl && !lienzoEl.contains(e.target as Node)) {
      activoFecha = null;
    }
  }

  // Zoom desde teclado (+ / -), centrado en el punto activo o en la vista.
  function zoomTeclado(factor: number) {
    const p = puntoActivo;
    const t = p ? Math.min(Math.max((p.d + 0.5 - vi) / span, 0), 1) : 0.5;
    const nuevo = Math.min(Math.max(span * factor, MIN_DIAS), total);
    fijar(vi + t * span - t * nuevo, nuevo);
  }

  function alTeclear(e: KeyboardEvent) {
    if (e.key === '+' || e.key === '=') zoomTeclado(1 / 1.5);
    else if (e.key === '-' || e.key === '_') zoomTeclado(1.5);
    else if (e.key === '0') elegir(rango);
    else if (vis.length === 0) return;
    else {
      const idx = vis.findIndex((p) => p.fecha === activoFecha);
      const ultimo = vis.length - 1;
      let n: number;
      if (e.key === 'ArrowRight') n = idx < 0 ? 0 : Math.min(idx + 1, ultimo);
      else if (e.key === 'ArrowLeft') n = idx < 0 ? ultimo : Math.max(idx - 1, 0);
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = ultimo;
      else if (e.key === 'Escape') {
        activoFecha = null;
        e.preventDefault();
        return;
      } else return;
      activoFecha = vis[n].fecha;
    }
    e.preventDefault();
  }

  function alEnfocar() {
    if (activoFecha === null && vis.length > 0) activoFecha = vis[vis.length - 1].fecha;
  }

  let tipW = $state(0);
  let tipH = $state(0);
  const tip = $derived.by(() => {
    const p = puntoActivo;
    if (!p || tipW === 0) return null;
    const px = x(p.d);
    const py = y(p.peso);
    const left = Math.min(Math.max(px - tipW / 2, 0), Math.max(ancho - tipW, 0));
    const arriba = py - tipH - 12;
    const top = arriba >= 0 ? arriba : py + 14;
    return { left, top };
  });

  const uid = $props.id();
  const idClip = `clip-peso-${uid}`;
</script>

<svelte:window onpointerdown={alTocarFuera} />

<section class="grafica" aria-label="Gráfica del peso">
  <header class="grafica-cabecera">
    <h2>Peso {periodo} <span class="unidad">(kg)</span></h2>
    {#if resumen}
      <p class="resumen">
        {#if resumen.n === 1}
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

  <!-- Atajos de zoom: solo mueven la gráfica (la tabla y el mes no cambian). -->
  <div
    class="rangos"
    role="group"
    aria-label="Meses que abarca la gráfica"
    title="Rueda del mouse sobre la gráfica: acercar y alejar · Arrastrar: moverse en el tiempo · Doble clic: volver"
  >
    {#each OPCIONES as o (o.valor)}
      <button
        type="button"
        class="rango"
        class:activo={rango === o.valor && !personalizada}
        aria-pressed={rango === o.valor && !personalizada}
        onclick={() => elegir(o.valor)}
      >{o.texto}</button>
    {/each}
  </div>
  {#if errorRango}
    <p class="aviso-rango" role="status">⚠️ {errorRango}</p>
  {/if}

  <div class="area" class:atenuada={cargando} aria-busy={cargando} use:rueda>
    {#if pts.length === 0}
      <p class="vacia">{sinPesos}</p>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="lienzo"
        style="height: {alto}px"
        bind:clientWidth={ancho}
        bind:this={lienzoEl}
        role="application"
        aria-label="Peso por día. Flechas izquierda y derecha: recorrer las mediciones. Más y menos: acercar y alejar. Cero: volver al rango elegido."
        tabindex="0"
        onkeydown={alTeclear}
        onfocus={alEnfocar}
        onblur={() => (activoFecha = null)}
      >
        {#if ancho > 0 && escala}
          <svg width={ancho} height={alto} viewBox="0 0 {ancho} {alto}" role="img" aria-label={descripcion}>
            <defs>
              <!-- Lo que sale de la vista se recorta (con aire para los marcadores). -->
              <clipPath id={idClip}>
                <rect x={IZQ - 9} y={0} width={plotW + 18} height={ARR + plotH + 9} />
              </clipPath>
            </defs>

            {#each escala.marcas as v (v)}
              <line class="rejilla" x1={IZQ} x2={ancho - DER} y1={y(v)} y2={y(v)} />
              <text class="eje" x={IZQ - 8} y={y(v)} text-anchor="end" dominant-baseline="middle">{textoMarca(v)}</text>
            {/each}

            <!-- Eje X -->
            {#each lineasDias as lx (lx)}
              <line class="rejilla" x1={lx} x2={lx} y1={ARR} y2={ARR + plotH} />
            {/each}
            {#each etiquetasDia as e (e.d)}
              <text class="eje" x={x(e.d)} y={ARR + plotH + 18} text-anchor="middle">{e.texto}</text>
            {/each}
            {#each etiquetasMes.lineas as lx (lx)}
              <line class="rejilla" x1={lx} x2={lx} y1={ARR} y2={ARR + plotH} />
            {/each}
            {#each etiquetasMes.textos as e (e.mi)}
              <text class="eje" x={e.x} y={ARR + plotH + 18} text-anchor="middle">{e.texto}</text>
            {/each}
            {#each contexto as c (c.texto)}
              <text class="eje eje-anio" x={c.x} y={ARR + plotH + 35} text-anchor="start">{c.texto}</text>
            {/each}

            {#if puntoActivo}
              <line class="cruz" x1={x(puntoActivo.d)} x2={x(puntoActivo.d)} y1={ARR} y2={ARR + plotH} />
            {/if}

            <g clip-path="url(#{idClip})">
              {#if hayLinea}
                <path class="linea" d={trazo} stroke={COLOR} />
              {/if}

              {#each vis as p (p.fecha)}
                {#if marcadorVisible(p.k, p.fecha)}
                  {@const act = p.fecha === activoFecha}
                  <circle cx={x(p.d)} cy={y(p.peso)} r={act ? 8 : 6} fill="#ffffff" />
                  <circle cx={x(p.d)} cy={y(p.peso)} r={act ? 6 : 4} fill={COLOR} />
                {/if}
              {/each}
            </g>

            <!-- Solo cuando el último peso del historial está a la vista (la serie
                 termina ahí); a media serie la línea seguiría y lo taparía. -->
            {#if vis.length > 0 && vis[vis.length - 1].k === pts.length - 1}
              {@const u = vis[vis.length - 1]}
              {@const derecha = x(u.d) <= ancho - 30}
              <text
                class="valor-final"
                x={derecha ? x(u.d) + 10 : x(u.d)}
                y={derecha ? y(u.peso) : y(u.peso) - 12}
                text-anchor={derecha ? 'start' : 'end'}
                dominant-baseline={derecha ? 'middle' : 'auto'}
              >{fmt(u.peso)}</text>
            {/if}

            <!-- Capa transparente que recibe el puntero sobre toda el área de la gráfica. -->
            <rect
              class="captura"
              class:movible={sePuedeMover}
              class:arrastrando={arrastre?.movido}
              role="presentation"
              x={IZQ}
              y={ARR}
              width={plotW}
              height={plotH}
              fill="transparent"
              onpointermove={alMover}
              onpointerdown={alBajar}
              onpointerup={alSoltar}
              onpointercancel={alSoltar}
              onpointerleave={alSalir}
              ondblclick={() => elegir(rango)}
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
    touch-action: pan-y;
    user-select: none;
  }

  .lienzo:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  svg {
    display: block;
    overflow: hidden;
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

  .captura.movible {
    cursor: grab;
  }

  .captura.arrastrando {
    cursor: grabbing;
  }

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
