<script lang="ts">
  // Monitor de gasto de IA: GET /uso de nutricion_api devuelve los tokens
  // consumidos (total histórico y solo hoy) más el costo estimado en USD,
  // calculado con los precios de gpt-4.1 (configurables en el back).
  import { env } from '$env/dynamic/public';

  const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8000';

  type Bloque = {
    llamadas: number;
    input_tokens: number;
    output_tokens: number;
    costo_usd: number;
  };
  type Uso = {
    modelo: string;
    precio_input_usd_por_1m: number;
    precio_output_usd_por_1m: number;
    total: Bloque;
    hoy: Bloque;
  };

  let uso = $state<Uso | null>(null);
  let cargando = $state(true);
  let error = $state<string | null>(null);

  const nfmt = (n: number) => n.toLocaleString('es-MX');
  const usd = (n: number) =>
    '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  $effect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/uso`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        uso = (await res.json()) as Uso;
      } catch (e) {
        error =
          e instanceof TypeError
            ? `No se pudo conectar con la API en ${API_URL}.`
            : e instanceof Error
              ? e.message
              : String(e);
      } finally {
        cargando = false;
      }
    })();
  });
</script>

{#snippet bloque(titulo: string, b: Bloque)}
  <div class="card">
    <div class="card-head">
      <span class="card-titulo">{titulo}</span>
      <span class="costo">{usd(b.costo_usd)} USD</span>
    </div>
    <div class="stats">
      <div class="stat">
        <span class="val">{nfmt(b.llamadas)}</span>
        <span class="lbl">llamadas</span>
      </div>
      <div class="stat">
        <span class="val">{nfmt(b.input_tokens)}</span>
        <span class="lbl">tokens de entrada</span>
      </div>
      <div class="stat">
        <span class="val">{nfmt(b.output_tokens)}</span>
        <span class="lbl">tokens de salida</span>
      </div>
      <div class="stat">
        <span class="val">{nfmt(b.input_tokens + b.output_tokens)}</span>
        <span class="lbl">tokens totales</span>
      </div>
    </div>
  </div>
{/snippet}

<section class="tokens">
  <h1>Consumo de tokens</h1>

  {#if cargando}
    <p class="estado">Cargando…</p>
  {:else if error}
    <div class="error">⚠️ {error}</div>
  {:else if uso}
    {@render bloque('Hoy', uso.hoy)}
    {@render bloque('Total', uso.total)}

    <p class="nota">
      Costo <strong>estimado</strong> con los precios de <code>{uso.modelo}</code>:
      {usd(uso.precio_input_usd_por_1m)} por 1M de tokens de entrada y
      {usd(uso.precio_output_usd_por_1m)} por 1M de salida. Ajústalos en el back
      (PRECIO_INPUT_USD_POR_1M / PRECIO_OUTPUT_USD_POR_1M) si cambian.
    </p>
  {/if}
</section>

<style>
  .tokens {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    max-width: 640px;
    margin: 0 auto;
    color: rgba(15, 23, 42, 0.9);
  }

  h1 {
    margin: 0;
    font-size: 1.35rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .estado {
    margin: 0;
    color: rgba(15, 23, 42, 0.6);
    font-size: 0.95rem;
  }

  .card {
    padding: 1.1rem 1.3rem;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
  }

  .card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
    margin-bottom: 0.9rem;
  }

  .card-titulo {
    font-weight: 700;
    font-size: 1.1rem;
    color: rgba(15, 23, 42, 0.95);
  }

  .costo {
    font-weight: 700;
    font-size: 1.05rem;
    color: #1e3a8a;
    background: rgba(37, 99, 235, 0.14);
    border: 1px solid rgba(37, 99, 235, 0.35);
    border-radius: 999px;
    padding: 0.3rem 0.85rem;
    white-space: nowrap;
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .stat {
    flex: 1;
    min-width: 110px;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.7rem 0.85rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(15, 23, 42, 0.1);
  }

  .stat .val {
    font-size: 1.2rem;
    font-weight: 700;
    color: rgba(15, 23, 42, 0.95);
    font-variant-numeric: tabular-nums;
  }

  .stat .lbl {
    font-size: 0.72rem;
    color: rgba(15, 23, 42, 0.55);
  }

  .nota {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(15, 23, 42, 0.6);
    line-height: 1.5;
  }

  .nota code {
    font-size: 0.76rem;
    background: rgba(15, 23, 42, 0.06);
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
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
