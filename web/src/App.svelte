<script>
  import Lobby from "./screens/Lobby.svelte";
  import Play from "./screens/Play.svelte";
  import Login from "./screens/Login.svelte";
  import Ambient from "./components/Ambient.svelte";
  import Settings from "./components/Settings.svelte";
  import Splash from "./components/Splash.svelte";
  import { applyTheme } from "./lib/settings.svelte.js";
  import { syncMusic } from "./lib/audio.js";

  applyTheme();

  // Fit the 1920x1080 stage into the window. On the TV this is 1; in a
  // browser window it letterboxes instead of cropping the edges.
  const fitStage = () => {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.documentElement.style.setProperty("--stage-scale", String(scale));
  };
  fitStage();
  window.addEventListener("resize", fitStage);
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
<Splash />

{#if screen === "lobby"}
  <Lobby onOpen={open} initialFocusId={machine?.id} />
{:else if screen === "login"}
  <!-- Play remounts afterwards, so its socket reconnects with the new ticket. -->
  <Login onDone={() => (screen = "play")} onCancel={() => (screen = "play")} />
{:else}
  <Play initial={machine} onBack={() => (screen = "lobby")} onSignIn={() => (screen = "login")} />
{/if}
