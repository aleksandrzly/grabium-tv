// Player-facing copy for the TV action panel, keyed by edge status / reason.
// The browser build is played with a keyboard, so key names follow it.
const OK = __GRABIUM_WEB__ ? "Enter" : "OK";
const REFUSALS = {
  insufficient_credits: "Out of plays for now.",
  guest_play_disabled: "Playing from the TV is switched off on this machine.",
  classic_cooldown_active: "Short cooldown. Try again in a moment.",
  user_banned: "This account can't play right now.",
  machine_mismatch: "Reconnecting to the machine. Try again."
};

export const refusalText = (reason) => REFUSALS[reason] || `Can't start right now (${reason}).`;

/**
 * @param {object} s game state
 * @param {{prizesShip?: boolean}} [econ] arcade (no shipped prizes) unless prizesShip
 * @returns {{title: string, subtitle?: string, keys: string[]}}
 */
export function actionCopy(s, econ = {}) {
  if (s.showResult) return resultCopy(s, econ);
  if (s.afterRound && s.status === "returning_home") {
    return { title: "Checking your grab", subtitle: "The claw is heading home.", keys: [] };
  }
  switch (s.status) {
    case "connecting":
      return { title: "Connecting…", keys: [] };
    case "ready":
      return { title: "Ready to play", keys: [s.signedIn ? `${OK}|Play` : `${OK}|Sign in to play`] };
    case "not_ready":
    case "returning_home":
      return { title: "Getting the claw ready…", keys: [] };
    case "busy":
      return s.canQueue
        ? { title: "Someone is playing", keys: [`${OK}|Get in line`] }
        : { title: "Someone is playing", keys: [] };
    case "queued":
      return {
        title: s.queuePosition > 0 ? `You're #${s.queuePosition} in line` : "You're in line",
        keys: ["Back|Leave the line"]
      };
    case "turn_invited":
      return { title: "Your turn!", keys: [`${OK}|Start now`] };
    case "controlling":
      if (s.phase === "lifting") return { title: "Grabbing…", keys: [] };
      if (s.phase === "select") return { title: "Pick the drop spot", keys: ["◀▲▼▶|Move", `${OK}|Release`] };
      if (s.dropSent) return { title: "Dropping…", keys: [] };
      return { title: "Your round", keys: ["◀▲▼▶|Hold to move", `${OK}|Drop`] };
    case "session_ended":
      return resultCopy(s, econ);
    case "maintenance":
      return { title: "Machine is taking a break", keys: [] };
    case "unauthorized":
    case "rate_limited":
      return { title: "Can't connect to play right now", keys: [] };
    default:
      return { title: "", keys: [] };
  }
}

// The machine may already be ready again (or taken) while the card shows, so
// the key follows the live status rather than always promising "Play again".
function resultCopy(s, econ) {
  const again = s.result === "WIN" ? "Play again" : "Try again";
  const keys =
    s.status === "busy" ? (s.canQueue ? [`${OK}|Get in line`] : [])
    : s.status === "maintenance" ? []
    : [`${OK}|${again}`];
  if (s.result === "WIN") {
    // Arcade wording mirrors the Mini App (resultWinTitleArcade/MsgArcade).
    return econ.prizesShip
      ? { title: "You won!", keys }
      : { title: "Great grab!", subtitle: "It counts on the weekly board.", keys };
  }
  return { title: econ.prizesShip ? "No prize this time" : "So close!", subtitle: "Aim for the middle of a toy.", keys };
}
