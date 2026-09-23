<script>
  import Lobby from "./screens/Lobby.svelte";
  import Play from "./screens/Play.svelte";
  import Login from "./screens/Login.svelte";
  import Ambient from "./components/Ambient.svelte";
  import Settings from "./components/Settings.svelte";
  import { applyTheme } from "./lib/settings.svelte.js";
  import { syncMusic } from "./lib/audio.js";

  applyTheme();
  syncMusic();
  document.addEventListener("visibilitychange", syncMusic);

  import { hasRefresh, refreshSession } from "./lib/platform.svelte.js";

  // A TV stays signed in for weeks: swap the refresh cookie for a fresh
  // access token at launch instead of waiting for the first 401.
  if (hasRefresh()) refreshSession();

  let screen = $state("lobby");
  let machine = $state(null);

  function open(m) {
    machine = m;
    screen = "play";
  }
</script>

<Ambient />
<Settings />

{#if screen === "lobby"}
  <Lobby onOpen={open} initialFocusId={machine?.id} />
{:else if screen === "login"}
  <!-- Play remounts afterwards, so its socket reconnects with the new ticket. -->
  <Login onDone={() => (screen = "play")} onCancel={() => (screen = "play")} />
{:else}
  <Play initial={machine} onBack={() => (screen = "lobby")} onSignIn={() => (screen = "login")} />
{/if}
