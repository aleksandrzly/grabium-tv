<script>
  import { listenRemote } from "../lib/remote.js";
  import { settings, saveSettings, applyTheme, THEMES } from "../lib/settings.svelte.js";
  import { account, signOut } from "../lib/platform.svelte.js";
  import { syncMusic, stopMotor } from "../lib/audio.js";
  import QrCode from "./QrCode.svelte";

  // Always mounted: it owns the ≡ key. While open it listens in the capture
  // phase and consumes every remote key, so the screen underneath (which may
  // be mid-round) never sees them.
  let open = $state(false);
  let focus = $state(0);
  // "list" or "legal" (the QR sheet for rules and policies).
  let view = $state("list");

  const origin = "https://play.freeskillclaw.cc";
  const LEGAL = [
    { label: "How FreeDrop works", url: `${origin}/fairness` },
    { label: "Terms of service", url: `${origin}/legal/terms` },
    { label: "Privacy policy", url: `${origin}/legal/privacy` }
  ];
  const rows = $derived([
    { id: "sound", label: "Sound effects", value: settings.sound ? "On" : "Off", hint: "Claw motor and drop" },
    { id: "music", label: "Music", value: settings.music ? "On" : "Off", hint: "Background arcade track" },
    {
      id: "theme",
      label: "Theme",
      value: THEMES.find((t) => t.id === settings.theme)?.label,
      hint: "◀ ▶ to change",
      cycle: true
    },
    account.token
      ? { id: "account", label: "Account", value: account.email || "Signed in", hint: "OK to sign out" }
      : { id: "account", label: "Account", value: "Not signed in", hint: "Press OK on a machine to sign in" },
    { id: "legal", label: "Rules & privacy", value: "Show QR codes", hint: "How FreeDrop works, terms, privacy" },
    { id: "version", label: "Version", value: `${__APP_VERSION__} · ${__APP_BUILT__}`, info: true }
  ]);

  function show() {
    // Release anything held on the screen underneath (e.g. a claw moving):
    // its keyup will be consumed here, so tell the remote listeners now.
    window.dispatchEvent(new Event("blur"));
    stopMotor();
    focus = 0;
    view = "list";
    open = true;
  }

  function change(id, step = 1) {
    if (id === "sound") settings.sound = !settings.sound;
    else if (id === "music") {
      settings.music = !settings.music;
      syncMusic();
    } else if (id === "theme") {
      const i = THEMES.findIndex((t) => t.id === settings.theme);
      settings.theme = THEMES[(i + step + THEMES.length) % THEMES.length].id;
      applyTheme();
    } else if (id === "account" && account.token) signOut();
    else if (id === "legal") {
      view = "legal";
      return;
    } else return;
    saveSettings();
  }

  $effect(() =>
    listenRemote(
      (key, { first }) => {
        if (!open) {
          if (key === "menu" && first) {
            show();
            return true;
          }
          return false;
        }
        if (view === "legal") {
          if ((key === "back" || key === "ok") && first) view = "list";
          else if (key === "menu" && first) open = false;
          return true;
        }
        const row = rows[focus];
        if ((key === "menu" || key === "back") && first) open = false;
        else if (key === "up") focus = Math.max(0, focus - 1);
        else if (key === "down") focus = Math.min(rows.length - 1, focus + 1);
        else if (key === "ok" && first && !row.info) change(row.id);
        else if ((key === "left" || key === "right") && first && row.cycle) change(row.id, key === "left" ? -1 : 1);
        return true;
      },
      undefined,
      { capture: true }
    )
  );
</script>

{#if open}
  <div class="scrim">
    <section class="panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      {#if view === "legal"}
        <h2 id="settings-title">Rules & privacy</h2>
        <p class="hint">Scan with your phone to read.</p>
        <div class="qrs">
          {#each LEGAL as item (item.url)}
            <figure>
              <QrCode value={item.url} size={200} />
              <figcaption>{item.label}</figcaption>
            </figure>
          {/each}
        </div>
        <p class="hint"><kbd>Back</kbd> settings</p>
      {:else}
      <h2 id="settings-title">Settings</h2>
      <ul>
        {#each rows as row, i (row.id)}
          <li class:focused={i === focus} class:info={row.info}>
            <div>
              <span class="label">{row.label}</span>
              {#if row.hint}<span class="hint">{row.hint}</span>{/if}
            </div>
            <span class="value" class:on={row.value === "On"}>
              {#if row.cycle && i === focus}◀ {/if}{row.value}{#if row.cycle && i === focus} ▶{/if}
            </span>
          </li>
        {/each}
      </ul>
      <p class="hint"><kbd>▲</kbd> <kbd>▼</kbd> move &nbsp; <kbd>OK</kbd> change &nbsp; <kbd>Back</kbd> close</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    justify-content: flex-end;
    background: rgba(0, 0, 0, 0.45);
    animation: fade 180ms ease-out both;
  }
  .panel {
    width: 820px;
    height: 100%;
    padding: 56px 48px;
    background: var(--panel);
    box-shadow: -24px 0 60px rgba(0, 0, 0, 0.4);
    animation: slide 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  h2 { margin: 0 0 28px; font-size: 52px; }
  ul { display: grid; gap: 10px; margin: 0 0 28px; padding: 0; list-style: none; }
  li {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    min-height: 88px;
    padding: 14px 24px;
    border-radius: 16px;
    background: var(--surface-2);
  }
  li::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: var(--focus);
    opacity: 0;
    transition: opacity 160ms ease-out;
  }
  li.focused::after { opacity: 1; }
  li > div { display: grid; gap: 2px; }
  .label { font-size: 30px; font-weight: 600; }
  li .hint { font-size: 20px; }
  .value { font-size: 26px; color: var(--muted); text-align: right; white-space: nowrap; }
  .value.on { color: var(--ok); }
  li.info .value { font-size: 22px; }
  .qrs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin: 32px 0;
  }
  figure {
    display: grid;
    justify-items: center;
    gap: 14px;
    margin: 0;
    padding: 20px 12px;
    border-radius: 16px;
    background: var(--surface-2);
  }
  figcaption { font-size: 22px; text-align: center; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes slide { from { transform: translate3d(60px, 0, 0); opacity: 0; } }
</style>
