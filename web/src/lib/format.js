// The edge sends a camera crop as fractions of the frame; object-view-box
// crops inside the element box, so no wrapper sizing or layout animation.
export function cropStyle(crop) {
  if (!crop) return "";
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  const right = 1 - crop.x - crop.w;
  const bottom = 1 - crop.y - crop.h;
  return `object-view-box: inset(${pct(crop.y)} ${pct(right)} ${pct(bottom)} ${pct(crop.x)});`;
}

const STATUS = {
  ready: { label: "Open now", tone: "ok" },
  busy: { label: "Someone is playing", tone: "busy" },
  playing: { label: "Someone is playing", tone: "busy" },
  preparing: { label: "Getting ready", tone: "wait" },
  returning_home: { label: "Getting ready", tone: "wait" },
  cooldown: { label: "Getting ready", tone: "wait" },
  maintenance: { label: "Taking a break", tone: "off" },
  offline: { label: "Offline", tone: "off" }
};

export function statusOf(machine) {
  if (!machine) return { label: "Connecting", tone: "wait" };
  if (machine.maintenance) return STATUS.maintenance;
  if (machine.session?.active_user) return STATUS.busy;
  return STATUS[machine.status] || STATUS[machine.machine_phase] || { label: machine.friendly_message || machine.status, tone: "wait" };
}

export function timeAgo(tsSeconds, now = Date.now()) {
  const s = Math.max(0, Math.round(now / 1000 - tsSeconds));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
