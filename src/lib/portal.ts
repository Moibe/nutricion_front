// Acción de Svelte: cuelga el nodo directo de <body>. <main> del layout es
// position:fixed con overflow oculto, y un overlay que viva adentro depende de
// que ningún ancestro cree un contexto de apilamiento o de posicionamiento
// propio. Al destruirse el componente, el nodo se retira solo.
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
