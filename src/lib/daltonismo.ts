// Filtro de daltonismo: preferencia POR USUARIO (se guarda en la API, tabla
// `preferencias`), no un ajuste global de la app -- cada quien elige el suyo y
// no le cambia los colores a nadie más.
//
// Los tres tipos no se confunden con los mismos pares de colores, así que cada
// uno tiene su propia paleta (los hex viven en +layout.svelte, como tokens
// globales --peso-baje / --peso-subi que se activan con [data-daltonismo]):
//
//   protanopia   rojo apagado (los rojos se ven oscuros, casi negros)
//   deuteranopia verde apagado -- el más común; junto con protanopia son los
//                dos que confunden verde con rojo, así que ambos se repintan
//                con azul/naranja, el par recomendado para verde-rojo
//   tritanopia   confunde azul con verde y amarillo con violeta; el verde y el
//                rojo SÍ se distinguen, así que aquí el cambio es menor (tonos
//                más saturados) y sobre todo se evita meter azules
export type Daltonismo = 'ninguno' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export const DALTONISMOS: { valor: Daltonismo; etiqueta: string; detalle: string }[] = [
  {
    valor: 'ninguno',
    etiqueta: 'Sin filtro',
    detalle: 'Verde para las bajadas y rojo para las subidas, como siempre.'
  },
  {
    valor: 'protanopia',
    etiqueta: 'Protanopia',
    detalle: 'Poca sensibilidad al rojo (se ve oscuro). Se repinta con azul y ámbar.'
  },
  {
    valor: 'deuteranopia',
    etiqueta: 'Deuteranopia',
    detalle: 'Poca sensibilidad al verde, el tipo más común. Se repinta con azul y naranja.'
  },
  {
    valor: 'tritanopia',
    etiqueta: 'Tritanopia',
    detalle: 'Confunde azul con verde y amarillo con violeta. Verde y rojo se conservan, más saturados.'
  }
];

export function esDaltonismo(v: unknown): v is Daltonismo {
  return DALTONISMOS.some((d) => d.valor === v);
}
