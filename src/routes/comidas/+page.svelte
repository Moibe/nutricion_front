<script lang="ts">
  import { env } from '$env/dynamic/public';

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  // "Colación 1"/"Colación 2" son dos botones distintos en la UI, pero el
  // schema del back solo distingue 4 tipos (no hay colacion_1/colacion_2) —
  // ambos crean una comida tipo "colacion"; el label completo se guarda solo
  // del lado del cliente para diferenciarlas en pantalla.
  const TIPOS = [
    { label: 'Desayuno', tipo: 'desayuno' },
    { label: 'Colación 1', tipo: 'colacion' },
    { label: 'Comida', tipo: 'comida' },
    { label: 'Colación 2', tipo: 'colacion' },
    { label: 'Cena', tipo: 'cena' }
  ] as const;

  type Comida = { id: number; tipo: string; fecha: string; created_at: string; label: string };

  let comidas = $state<Comida[]>([]);
  let activeId = $state<number | null>(null);
  let creando = $state<string | null>(null);
  let error = $state<string | null>(null);

  async function crearComida(label: string, tipo: string) {
    if (creando) return;
    creando = label;
    error = null;
    try {
      const res = await fetch(`${API_URL}/comidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const nueva: Comida = { ...data, label };
      comidas = [...comidas, nueva];
      activeId = nueva.id;
    } catch (e) {
      error =
        e instanceof TypeError
          ? `No se pudo conectar con la API en ${API_URL}.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      creando = null;
    }
  }

  async function cambiarFecha(id: number, nuevaFecha: string) {
    const anterior = comidas.find((c) => c.id === id)?.fecha;
    comidas = comidas.map((c) => (c.id === id ? { ...c, fecha: nuevaFecha } : c));
    try {
      const res = await fetch(`${API_URL}/comidas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: nuevaFecha })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      comidas = comidas.map((c) => (c.id === id ? { ...c, fecha: anterior ?? c.fecha } : c));
      error = 'No se pudo actualizar la fecha.';
    }
  }

  function formatoFecha(fecha: string) {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
</script>

<section class="comidas">
  <div class="botones">
    {#each TIPOS as t (t.label)}
      <button
        type="button"
        class="tipo-btn"
        onclick={() => crearComida(t.label, t.tipo)}
        disabled={creando !== null}
      >
        {creando === t.label ? '…' : t.label}
      </button>
    {/each}
  </div>

  {#if error}
    <div class="error">⚠️ {error}</div>
  {/if}

  {#if comidas.length > 0}
    <div class="cards">
      {#each comidas as c (c.id)}
        <div class="card" class:active={c.id === activeId}>
          <span class="card-label">{c.label}</span>
          <div class="fecha-picker">
            <button
              type="button"
              class="fecha-btn"
              aria-label="Elegir fecha de {c.label}"
              onclick={(e) => {
                const input = (e.currentTarget as HTMLElement).parentElement?.querySelector(
                  'input[type="date"]'
                ) as HTMLInputElement | null;
                input?.showPicker?.();
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <span class="fecha-texto">{formatoFecha(c.fecha)}</span>
            </button>
            <input
              type="date"
              class="fecha-input"
              value={c.fecha}
              onchange={(e) => cambiarFecha(c.id, (e.currentTarget as HTMLInputElement).value)}
            />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .comidas {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    color: rgba(15, 23, 42, 0.9);
  }

  .botones {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .tipo-btn {
    flex: 1;
    min-width: 110px;
    padding: 0.8rem 1rem;
    border-radius: 10px;
    border: 1px solid rgba(37, 99, 235, 0.35);
    background: rgba(255, 255, 255, 0.55);
    color: #1e3a8a;
    font: inherit;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition:
      background 0.18s ease,
      border-color 0.18s ease;
  }

  .tipo-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.8);
    border-color: rgba(37, 99, 235, 0.55);
  }

  .tipo-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 150px;
    padding: 0.8rem 0.95rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
  }

  .card.active {
    background: rgba(37, 99, 235, 0.14);
    border-color: rgba(37, 99, 235, 0.4);
  }

  .card-label {
    font-weight: 700;
    font-size: 0.95rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .fecha-picker {
    position: relative;
    width: fit-content;
  }

  .fecha-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.12);
    color: rgba(15, 23, 42, 0.75);
    cursor: pointer;
    font: inherit;
  }

  .fecha-btn:hover {
    background: rgba(255, 255, 255, 0.85);
  }

  .fecha-texto {
    font-size: 0.82rem;
  }

  .fecha-input {
    position: absolute;
    width: 1px;
    height: 1px;
    left: 0;
    bottom: 0;
    opacity: 0;
    pointer-events: none;
  }

  .error {
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.35);
    color: #991b1b;
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    font-size: 0.88rem;
  }
</style>
