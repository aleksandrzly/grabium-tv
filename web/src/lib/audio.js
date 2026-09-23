// Sound for the TV, using the Mini App's own clips as the edge serves them
// (frontend/public/assets). Streamed from the edge rather than bundled: the
// music alone is 3.7 MB, and the single-file TV bundle would carry it inline.
import { url } from "./config.js";
import { settings } from "./settings.svelte.js";

let music = null;
let motor = null;
let drop = null;

function clip(path, volume, loop = false) {
  const el = new Audio(url(path));
  el.preload = "auto";
  el.volume = volume;
  el.loop = loop;
  return el;
}

function ensure() {
  // Volumes match frontend/src/services/audio.js.
  music ??= clip("/assets/background_music.mp3", 0.34, true);
  motor ??= clip("/assets/motor.mp3", 0.72, true);
  drop ??= clip("/assets/cat_drop_sound.mp3", 0.9);
}

const play = (el) => el.play().catch((err) => console.info("[audio] play blocked", err?.name));

export function syncMusic() {
  ensure();
  if (settings.music && !document.hidden) play(music);
  else music.pause();
}

export function startMotor() {
  if (!settings.sound) return;
  ensure();
  if (motor.paused) {
    motor.currentTime = 0;
    play(motor);
  }
}

export function stopMotor() {
  if (!motor) return;
  motor.pause();
  motor.currentTime = 0;
}

export function playDrop() {
  if (!settings.sound) return;
  ensure();
  drop.currentTime = 0;
  play(drop);
}
