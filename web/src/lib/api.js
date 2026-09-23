import { url } from "./config.js";
import { request } from "./bridge.js";
import { applyEconomy } from "./economy.svelte.js";

async function getJson(path, signal) {
  const reply = await request(url(path), { signal });
  if (!reply.ok) throw new Error(`${path}: HTTP ${reply.status}`);
  const data = JSON.parse(reply.body);
  if (data.status !== "ok") throw new Error(`${path}: ${data.message || data.status}`);
  return data;
}

export async function fetchMachines(signal) {
  const data = await getJson("/api/machines", signal);
  applyEconomy(data);
  return (data.machines || []).filter((m) => !m.hidden);
}

export async function fetchMachine(id, signal) {
  const data = await getJson(`/api/machines/${encodeURIComponent(id)}/status`, signal);
  return data.machine;
}

export async function fetchRecentWins(signal) {
  const data = await getJson("/api/recent-wins", signal);
  return data.wins || [];
}

// Cache-busting keeps the lobby preview fresh without a socket per card.
export const previewUrl = (id, tick = 0) =>
  url(`/api/machines/${encodeURIComponent(id)}/preview.jpg?t=${tick}`);

export const iconUrl = (path) => (path ? url(path) : "");
