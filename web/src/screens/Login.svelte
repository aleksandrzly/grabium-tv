<script>
  import { account, requestCode, verifyCode } from "../lib/platform.svelte.js";

  let { onDone, onCancel } = $props();

  let step = $state("email");
  let email = $state(account.email || "");
  let code = $state("");
  let busy = $state(false);
  let error = $state("");
  let input = $state(null);
  let button = $state(null);

  // Typing needs the real keyboard, so this screen does not use the shared
  // remote handler (it would swallow Backspace and Enter). Only the remote's
  // Back key is taken here.
  $effect(() => {
    const onKey = (event) => {
      if (event.key === "GoBack" || event.code === "BrowserBack" || event.key === "Escape") {
        event.preventDefault();
        if (step === "code") {
          step = "email";
          code = "";
          error = "";
        } else {
          onCancel();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  $effect(() => {
    // Re-focus the field whenever the step changes so the TV keyboard opens.
    void step;
    input?.focus();
  });

  function moveFocus(event) {
    if (event.key === "ArrowDown" && document.activeElement === input) {
      event.preventDefault();
      button?.focus();
    } else if (event.key === "ArrowUp" && document.activeElement === button) {
      event.preventDefault();
      input?.focus();
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    error = "";
    busy = true;
    try {
      if (step === "email") {
        const value = email.trim();
        if (!/^\S+@\S+\.\S+$/.test(value)) throw new Error("Enter a valid email address.");
        await requestCode(value);
        email = value;
        step = "code";
      } else {
        const value = code.replace(/\D/g, "");
        if (value.length !== 6) throw new Error("The code has 6 digits. Check it and try again.");
        await verifyCode(email, value);
        onDone();
      }
    } catch (err) {
      // A network failure through fetch surfaces as a TypeError with a
      // browser-specific message; never show raw internals to a player.
      error = err instanceof TypeError ? "No connection. Check the network and try again." : err.message || "Sign-in didn't work. Please try again.";
    } finally {
      busy = false;
    }
  }
</script>

<main>
  <section>
    <h1>Sign in to play</h1>
    {#if step === "email"}
      <p class="hint">We'll email you a one-time code. Same account as the Grabium app.</p>
    {:else}
      <p class="hint">Enter the code we sent to <strong>{email}</strong>.</p>
      <!-- Our sending domain is new, so some inboxes file the code as spam. -->
      <p class="hint spam">Not there? Check your <strong>Spam</strong> folder. The code is in the subject line.</p>
    {/if}

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form onsubmit={submit} onkeydown={moveFocus}>
      {#if step === "email"}
        <label for="email">Email</label>
        <input
          id="email"
          bind:this={input}
          bind:value={email}
          type="email"
          inputmode="email"
          autocomplete="email"
          enterkeyhint="send"
          disabled={busy}
        />
      {:else}
        <label for="code">Code</label>
        <input
          id="code"
          bind:this={input}
          bind:value={code}
          inputmode="numeric"
          maxlength="6"
          pattern="[0-9]*"
          autocomplete="one-time-code"
          enterkeyhint="go"
          disabled={busy}
        />
      {/if}
      <button bind:this={button} type="submit" disabled={busy}>
        {busy ? "Please wait…" : step === "email" ? "Send code" : "Sign in"}
      </button>
    </form>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <p class="hint"><kbd>Back</kbd> {step === "code" ? "change email" : "cancel"}</p>
  </section>
</main>

<style>
  main {
    display: grid;
    place-items: center;
    height: 1080px;
  }
  section {
    width: 960px;
    padding: 64px;
    border-radius: var(--radius);
    background: var(--surface);
  }
  h1 { margin: 0 0 12px; font-size: 56px; }
  form {
    display: grid;
    gap: 16px;
    margin: 40px 0 24px;
  }
  label { color: var(--muted); font-size: 24px; }
  input {
    height: 88px;
    padding: 0 28px;
    border: 2px solid var(--surface-2);
    border-radius: 16px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 36px;
  }
  button {
    height: 88px;
    border: 0;
    border-radius: 16px;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-size: 32px;
    font-weight: 700;
  }
  input:focus,
  button:focus {
    outline: none;
    box-shadow: var(--focus);
  }
  button:disabled { opacity: 0.6; }
  .error { color: var(--busy); }
  .spam { margin-top: 6px; font-size: 22px; }
</style>
