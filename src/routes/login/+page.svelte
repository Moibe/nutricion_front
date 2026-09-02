<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
  let enviando = $state(false);
</script>

<svelte:head>
  <title>Entrar · Kcal</title>
</svelte:head>

<div class="login-wrap">
  <div class="login-card">
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2c-1.6 2.8-4.2 4.6-4.2 8.2a4.2 4.2 0 0 0 8.4 0c0-1.1-.3-2-.8-2.9.8.6 1.5 1.5 1.9 2.6.6 1.7.2 3.6-.9 5A5.8 5.8 0 0 1 12 22a5.8 5.8 0 0 1-5.3-8.2C7.6 11.3 9 9.5 9 7.1 9 5 10.1 3.2 12 2Z"
        />
      </svg>
      <span class="brand-title">Kcal</span>
    </div>

    <h1>Entrar</h1>
    <p class="sub">Escribe tu código de acceso.</p>

    <form
      method="POST"
      use:enhance={() => {
        enviando = true;
        return async ({ update }) => {
          await update();
          enviando = false;
        };
      }}
    >
      <input
        type="text"
        name="codigo"
        placeholder="Código de acceso"
        autocomplete="off"
        autofocus
        disabled={enviando}
      />

      {#if form?.error}
        <p class="error">⚠️ {form.error}</p>
      {/if}

      <button type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
    </form>
  </div>
</div>

<style>
  .login-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    box-sizing: border-box;
  }

  .login-card {
    width: 100%;
    max-width: 340px;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 4px 16px rgba(15, 15, 15, 0.06);
    padding: 2rem 1.75rem;
    box-sizing: border-box;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1.5rem;
  }

  .brand-mark {
    width: 24px;
    height: 24px;
    fill: #2563eb;
  }

  .brand-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--ink);
  }

  h1 {
    margin: 0 0 0.35rem;
    font-size: 1.4rem;
    color: var(--ink);
  }

  .sub {
    margin: 0 0 1.5rem;
    color: var(--ink-soft);
    font-size: 0.92rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  input {
    padding: 0.7rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: #ffffff;
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
    box-sizing: border-box;
  }

  input:focus {
    outline: none;
    border-color: var(--ink);
  }

  input:disabled {
    opacity: 0.6;
  }

  button {
    padding: 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--volt);
    background: var(--volt);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    transition: filter 0.18s ease;
  }

  button:hover:not(:disabled) {
    filter: brightness(0.94);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    margin: 0;
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.35);
    color: #991b1b;
    border-radius: 10px;
    padding: 0.6rem 0.85rem;
    font-size: 0.88rem;
  }
</style>
