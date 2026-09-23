// TV player preferences. Mirrors the Mini App's sound / music / skin
// settings (frontend/src/stores/settings.svelte.js), minus the phone-only
// ones (tilt, haptics, notifications, telemetry HUD).
const KEY = "grabium_tv_settings";
export const THEMES = [
  { id: "dark", label: "Grabium Dark" },
  { id: "parlor", label: "Parlor Light" },
  { id: "candy", label: "Candy Toy" }
];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch (err) {
    console.warn("[settings] unreadable, using defaults", err);
    return {};
  }
}

const saved = load();
export const settings = $state({
  sound: saved.sound !== false,
  music: saved.music === true, // off by default: a TV in a living room should not start playing music
  theme: THEMES.some((t) => t.id === saved.theme) ? saved.theme : "dark"
});

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn("[settings] not saved", err);
  }
}

export function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}
