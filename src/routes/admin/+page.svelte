<script lang="ts">
  // Página de administración de usuarios (solo el dueño, id=1 -- ver
  // +page.server.ts). Reusa el mismo patrón de confirmación inline que ya
  // usa ListadoComidas.svelte (.confirmar-eliminar) para la única acción
  // realmente consecuente (desactivar); "nuevo código" y "cerrar sesión" son
  // reversibles con un tap más, así que disparan directo sin confirmar.
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let confirmandoDesactivar = $state<number | null>(null);
  let enviandoId = $state<number | null>(null);
  let creando = $state(false);

  let codigoInput: HTMLInputElement | undefined = $state();
  let copiado = $state(false);

  async function copiarCodigo(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      copiado = true;
    } catch {
      codigoInput?.select();
    }
    setTimeout(() => (copiado = false), 2000);
  }

  function fmt(iso: string) {
    return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
</script>

<svelte:head>
  <title>Admin · Kcal</title>
</svelte:head>

<section class="admin">
  <h1>Usuarios</h1>
  <p class="sub">Quién puede entrar a Kcal. No hay auto-registro — das de alta desde aquí.</p>

  {#if form?.creado}
    <div class="codigo-banner">
      <p>
        Código de acceso para <strong>{form.nombreCreado}</strong> — compártelo, no se vuelve a
        mostrar (si se pierde, usa "Nuevo código"):
      </p>
      <div class="codigo-row">
        <input
          class="codigo-valor"
          type="text"
          readonly
          value={form.codigoCreado}
          bind:this={codigoInput}
          onclick={(e) => e.currentTarget.select()}
        />
        <button type="button" class="copiar-btn" onclick={() => copiarCodigo(form?.codigoCreado ?? '')}>
          {copiado ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  {/if}

  {#if form?.error}
    <p class="error">⚠️ {form.error}</p>
  {/if}

  <div class="lista">
    {#each data.usuarios as u (u.id)}
      <div class="fila">
        <div class="fila-cabeza">
          <div class="fila-info">
            <span class="nombre">
              {u.nombre}
              {#if u.id === 1}<span class="badge admin">admin</span>{/if}
              {#if !u.activo}<span class="badge inactivo">inactivo</span>{/if}
            </span>
            <span class="meta">desde {fmt(u.created_at)}</span>
          </div>

          <div class="fila-acciones">
            {#if u.id !== 1}
              {#if u.activo}
                <button
                  type="button"
                  class="accion-btn"
                  onclick={() => (confirmandoDesactivar = u.id)}
                  disabled={enviandoId === u.id}
                >
                  Desactivar
                </button>
              {:else}
                <form
                  method="POST"
                  action="?/activar"
                  use:enhance={() => {
                    enviandoId = u.id;
                    return async ({ update }) => {
                      await update();
                      enviandoId = null;
                    };
                  }}
                >
                  <input type="hidden" name="id" value={u.id} />
                  <button type="submit" class="accion-btn" disabled={enviandoId === u.id}>
                    {enviandoId === u.id ? '…' : 'Reactivar'}
                  </button>
                </form>
              {/if}
            {/if}

            <form
              method="POST"
              action="?/revocar"
              use:enhance={() => {
                enviandoId = u.id;
                return async ({ update }) => {
                  await update();
                  enviandoId = null;
                };
              }}
            >
              <input type="hidden" name="id" value={u.id} />
              <button
                type="submit"
                class="accion-btn"
                title="Su sesión actual deja de servir; tiene que volver a meter su código."
                disabled={enviandoId === u.id}
              >
                {enviandoId === u.id ? '…' : 'Cerrar sesión'}
              </button>
            </form>

            <form
              method="POST"
              action="?/regenerar"
              use:enhance={() => {
                enviandoId = u.id;
                return async ({ update }) => {
                  await update();
                  enviandoId = null;
                };
              }}
            >
              <input type="hidden" name="id" value={u.id} />
              <input type="hidden" name="nombre" value={u.nombre} />
              <input
                type="text"
                name="codigo"
                placeholder="opcional"
                class="codigo-custom-input"
                disabled={enviandoId === u.id}
                title="Déjalo vacío para uno al azar, o escribe uno memorable"
              />
              <button type="submit" class="accion-btn" disabled={enviandoId === u.id}>
                {enviandoId === u.id ? '…' : 'Nuevo código'}
              </button>
            </form>
          </div>
        </div>

        {#if confirmandoDesactivar === u.id}
          <div class="confirmar-eliminar">
            <span>¿Desactivar a {u.nombre}? Ya no podrá entrar hasta que lo reactives.</span>
            <div class="confirmar-acciones">
              <button
                type="button"
                class="cancelar-btn"
                onclick={() => (confirmandoDesactivar = null)}
                disabled={enviandoId === u.id}
              >
                Cancelar
              </button>
              <form
                method="POST"
                action="?/desactivar"
                use:enhance={() => {
                  enviandoId = u.id;
                  return async ({ update }) => {
                    await update();
                    enviandoId = null;
                    confirmandoDesactivar = null;
                  };
                }}
              >
                <input type="hidden" name="id" value={u.id} />
                <button type="submit" class="eliminar-btn" disabled={enviandoId === u.id}>
                  {enviandoId === u.id ? 'Desactivando…' : 'Desactivar'}
                </button>
              </form>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="agregar">
    <h2>Agregar usuario</h2>
    <form
      method="POST"
      action="?/crear"
      use:enhance={() => {
        creando = true;
        return async ({ update }) => {
          await update({ reset: true });
          creando = false;
        };
      }}
    >
      <input type="text" name="nombre" placeholder="Nombre" autocomplete="off" disabled={creando} />
      <input
        type="text"
        name="codigo"
        placeholder="Código (opcional)"
        autocomplete="off"
        disabled={creando}
        title="Déjalo vacío para uno al azar, o escribe uno memorable"
      />
      <button type="submit" disabled={creando}>{creando ? 'Creando…' : 'Agregar'}</button>
    </form>
    <p class="agregar-hint">
      Un código memorable es más cómodo, pero también más fácil de adivinar que uno al azar — bien
      para unas cuantas personas de confianza.
    </p>
  </div>
</section>

<style>
  .admin {
    max-width: 640px;
  }

  h1 {
    margin: 0 0 0.3rem;
    font-size: 1.6rem;
    color: var(--ink);
  }

  .sub {
    margin: 0 0 1.5rem;
    color: var(--ink-soft);
    font-size: 0.92rem;
  }

  .codigo-banner {
    background: rgba(215, 255, 61, 0.25);
    border: 1px solid rgba(15, 15, 15, 0.15);
    border-radius: 10px;
    padding: 0.9rem 1rem;
    margin-bottom: 1.2rem;
  }

  .codigo-banner p {
    margin: 0 0 0.6rem;
    font-size: 0.88rem;
    color: var(--ink);
  }

  .codigo-row {
    display: flex;
    gap: 0.5rem;
  }

  .codigo-valor {
    flex: 1;
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-size: 0.85rem;
    padding: 0.5rem 0.7rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: #ffffff;
    color: var(--ink);
  }

  .copiar-btn {
    padding: 0.5rem 0.9rem;
    border-radius: 8px;
    border: 1px solid var(--ink);
    background: var(--ink);
    color: #ffffff;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .error {
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.35);
    color: #991b1b;
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    font-size: 0.88rem;
    margin: 0 0 1rem;
  }

  .lista {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.8rem;
  }

  .fila {
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.8rem 1rem;
  }

  .fila-cabeza {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .fila-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .nombre {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 700;
    color: var(--ink);
  }

  .meta {
    font-size: 0.78rem;
    color: var(--ink-soft);
  }

  .badge {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-radius: 999px;
    padding: 0.1rem 0.45rem;
  }

  .badge.admin {
    color: var(--volt-ink);
    background: var(--volt);
  }

  .badge.inactivo {
    color: #991b1b;
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.25);
  }

  .fila-acciones {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .accion-btn {
    padding: 0.35rem 0.7rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: #ffffff;
    color: var(--ink);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.18s ease;
  }

  .accion-btn:hover:not(:disabled) {
    background: rgba(15, 15, 15, 0.05);
  }

  .accion-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Mismo patrón que .confirmar-eliminar de ListadoComidas.svelte -- misma
     acción, mismo look, en vez de inventar un modal nuevo para esta página. */
  .confirmar-eliminar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.6rem;
    padding: 0.5rem 0.7rem;
    border-radius: 8px;
    background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.25);
    font-size: 0.85rem;
    color: rgba(15, 23, 42, 0.8);
  }

  .confirmar-acciones {
    display: flex;
    gap: 0.5rem;
  }

  .cancelar-btn,
  .eliminar-btn {
    padding: 0.35rem 0.75rem;
    border-radius: 8px;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }

  .cancelar-btn {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(15, 23, 42, 0.15);
    color: rgba(15, 23, 42, 0.75);
  }

  .cancelar-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.9);
  }

  .eliminar-btn {
    background: rgba(220, 38, 38, 0.9);
    border: 1px solid rgba(220, 38, 38, 0.9);
    color: #fff;
  }

  .eliminar-btn:hover:not(:disabled) {
    background: #b91c1c;
  }

  .cancelar-btn:disabled,
  .eliminar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .agregar {
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 1rem;
  }

  .agregar h2 {
    margin: 0 0 0.7rem;
    font-size: 1rem;
    color: var(--ink);
  }

  .agregar form {
    display: flex;
    gap: 0.6rem;
  }

  .agregar input {
    flex: 1;
    padding: 0.6rem 0.85rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: #ffffff;
    color: var(--ink);
    font: inherit;
    font-size: 0.9rem;
  }

  .agregar input:focus {
    outline: none;
    border-color: var(--ink);
  }

  .agregar button {
    padding: 0.6rem 1.1rem;
    border-radius: 8px;
    border: 1px solid var(--volt);
    background: var(--volt);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    font-size: 0.88rem;
    cursor: pointer;
  }

  .agregar button:disabled,
  .agregar input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .agregar-hint {
    margin: 0.6rem 0 0;
    font-size: 0.76rem;
    color: var(--ink-soft);
  }

  /* Compañero angosto de "Nuevo código" -- mismo alto que .accion-btn, pero
     angosto (es opcional, no debe competir visualmente con el botón). */
  .codigo-custom-input {
    width: 92px;
    padding: 0.35rem 0.5rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: #ffffff;
    color: var(--ink);
    font: inherit;
    font-size: 0.78rem;
  }

  .codigo-custom-input:focus {
    outline: none;
    border-color: var(--ink);
  }

  .codigo-custom-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
