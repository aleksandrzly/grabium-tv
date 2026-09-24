// Player connection to one machine edge, driven by the TV remote.
// Protocol mirrors the Mini App (frontend/src/services/session.js and
// frontend/src/lib/wsMessages.js). It is re-implemented here rather than
// imported so the Mini App can change freely without breaking the TV build.
import { ORIGIN } from "./config.js";
import { wsTicket } from "./platform.svelte.js";
import { playDrop, startMotor, stopMotor } from "./audio.js";

const PING_MS = 20000;
// The Mini App re-sends a held direction every 100 ms; the edge treats the
// stream of commands as a dead-man switch, so the TV does the same.
const MOVE_REPEAT_MS = 100;
// A held arrow on the Vega Virtual Device's remote can arrive as keyup/keydown
// pairs, and stopping (H) on each keyup made the claw stutter. The stop waits
// this long and is cancelled if the same arrow comes back; the firmware's own
// 500 ms failsafe still stops a claw whose commands dry up.
const RELEASE_GRACE_MS = 200;
// The edge sends session_ended (with the result) only once the claw is home,
// then the machine's next status (ready / busy) a moment later. The result
// card is held this long so the player actually sees it.
const RESULT_HOLD_MS = 8000;
// A start takes a round trip to the platform; a second OK in that window is
// refused by the edge (platform_start_in_progress), so it is not sent.
const START_GUARD_MS = 4000;
const RECONNECT_MAX_MS = 15000;
const DIRECTIONS = { up: "U", down: "D", left: "L", right: "R" };

function guestId() {
  const key = "grabium_tv_guest_id";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = `guest_tv${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch (err) {
    console.warn("[game] localStorage unavailable, guest id is per launch", err);
    return `guest_tv${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
}

function wsUrl(machineId) {
  const base = ORIGIN || window.location.origin;
  return `${base.replace(/^http/, "ws")}/ws/${encodeURIComponent(machineId)}`;
}

// Same rotation as frontend/src/lib/gameUi.js mapControlCommand.
function mapDirection(cmd, inverted) {
  if (!inverted) return cmd;
  return { U: "L", D: "R", L: "D", R: "U" }[cmd] || cmd;
}

export function createGame(machineId, initialMode = "") {
  const state = $state({
    connected: false,
    // Last server status: ready | not_ready | busy | maintenance | queued |
    // turn_invited | controlling | returning_home | session_ended | ...
    status: "connecting",
    mode: initialMode,
    phase: "", // FreeDrop wire phase: aim | lifting | select
    sessionLeft: 0,
    sessionTotal: 0,
    canQueue: false,
    queuePosition: null,
    queueId: "",
    result: "", // WIN | LOSE after session_ended
    showResult: false, // result card on screen (see RESULT_HOLD_MS)
    afterRound: false, // this player's claw is heading home; the result is pending
    prize: null,
    refusal: "",
    inverted: false,
    dropSent: false,
    signedIn: false
  });

  let ws = null;
  let closed = false;
  let pingTimer = null;
  let reconnectDelay = 1000;
  let reconnectTimer = null;
  let resultTimer = null;
  let startSentAt = 0;
  // Timer handles are bookkeeping, not UI state, so they stay non-reactive.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const repeatTimers = new Map();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const releaseTimers = new Map();

  function send(obj) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function stopAllMoves() {
    for (const timer of repeatTimers.values()) clearInterval(timer);
    repeatTimers.clear();
    for (const timer of releaseTimers.values()) clearTimeout(timer);
    releaseTimers.clear();
    stopMotor();
  }

  function hideResult() {
    clearTimeout(resultTimer);
    state.showResult = false;
  }

  function apply(data) {
    if (data.event === "start.refused" || data.type === "start.refused") {
      startSentAt = 0;
      state.refusal = data.reason || "refused";
      return;
    }
    if (typeof data.controls_inverted === "boolean") state.inverted = data.controls_inverted;
    if (data.mode) state.mode = data.mode;
    if (data.freedrop_phase) {
      // Arduino owns the phase; a new aim/select phase re-arms the drop.
      if (data.freedrop_phase !== state.phase && data.freedrop_phase !== "lifting") state.dropSent = false;
      state.phase = data.freedrop_phase;
      if (state.phase === "lifting") stopAllMoves();
    }
    if (Number.isFinite(Number(data.session_left))) state.sessionLeft = Number(data.session_left);
    if (Number.isFinite(Number(data.session_total))) state.sessionTotal = Number(data.session_total);
    if (typeof data.can_queue === "boolean") state.canQueue = data.can_queue;
    if (data.queue_id) state.queueId = data.queue_id;
    if (Number.isFinite(Number(data.position))) state.queuePosition = Number(data.position);

    if (!data.status) return;
    // The edge drops a command that arrives under 90 ms after the last one
    // and says rate_limited. Held arrows repeat every 100 ms, and the tunnel
    // can deliver two close together, so this is routine jitter, not a lost
    // connection: keep the current status (the Mini App does the same).
    if (data.status === "rate_limited") return;
    if (data.status === "prize_win") {
      state.prize = data;
      return;
    }
    if (data.status === "controlling" && state.status !== "controlling") {
      startSentAt = 0;
      state.refusal = "";
      state.result = "";
      state.prize = null;
      state.dropSent = false;
      hideResult();
    }
    if (data.status === "returning_home" && (state.status === "controlling" || state.afterRound)) {
      state.afterRound = true;
    }
    if (data.status === "session_ended") {
      stopAllMoves();
      state.result = data.result || "LOSE";
      state.afterRound = false;
      state.showResult = true;
      clearTimeout(resultTimer);
      resultTimer = setTimeout(hideResult, RESULT_HOLD_MS);
    }
    if (data.status !== "controlling") stopAllMoves();
    // queue_update is a refresh of the same "in line" state.
    state.status = data.status === "queue_update" ? "queued" : data.status;
  }

  async function authFrame() {
    // A signed-in TV gets a platform ticket, which is what lets the edge
    // start a round under the central wallet. Without one the socket is a
    // guest: it sees live status but start is refused.
    try {
      const ticket = await wsTicket(machineId);
      if (ticket) return { ws_ticket: ticket, machine_id: machineId };
    } catch (err) {
      console.warn("[game] ws ticket failed, connecting as guest", err);
    }
    return { initData: "", guest_id: guestId(), machine_id: machineId };
  }

  async function connect() {
    if (closed) return;
    state.status = "connecting";
    // Tickets are one-shot and short-lived, so fetch right before opening.
    const frame = await authFrame();
    if (closed) return;
    const socket = new WebSocket(wsUrl(machineId));
    ws = socket;
    socket.onopen = () => {
      reconnectDelay = 1000;
      state.connected = true;
      state.signedIn = Boolean(frame.ws_ticket);
      socket.send(JSON.stringify(frame));
      clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ type: "ping" }), PING_MS);
    };
    socket.onmessage = (event) => {
      try {
        apply(JSON.parse(event.data));
      } catch (err) {
        console.warn("[game] bad message", err);
      }
    };
    socket.onclose = () => {
      if (socket !== ws) return;
      state.connected = false;
      clearInterval(pingTimer);
      stopAllMoves();
      if (closed) return;
      state.status = "connecting";
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2);
    };
    socket.onerror = () => socket.close();
  }

  const movable = () =>
    state.status === "controlling" && state.phase !== "lifting" && !(state.mode !== "freedrop" && state.dropSent);

  return {
    state,
    connect,
    /**
     * OK button: start, accept an invited turn, join the line, or drop.
     * @returns {"sign_in" | undefined} "sign_in" when a play action needs an account
     */
    ok() {
      const s = state.status;
      if (s === "controlling") {
        // Drop is one-shot per phase; the edge would ignore extras anyway.
        if (state.dropSent || state.phase === "lifting") return;
        stopAllMoves();
        state.dropSent = true;
        send({ cmd: "G" });
        playDrop();
        return;
      }
      state.refusal = "";
      hideResult();
      const wantsToPlay = ["ready", "busy", "not_ready", "session_ended", "turn_invited"].includes(s);
      if (wantsToPlay && !state.signedIn) return "sign_in";
      if (s === "turn_invited" && state.queueId) {
        send({ action: "accept_turn", queue_id: state.queueId, mode: state.mode });
      } else if (s === "busy" && state.canQueue) {
        send({ action: "join_queue" });
      } else if (s === "ready" || s === "session_ended" || s === "not_ready") {
        if (Date.now() - startSentAt < START_GUARD_MS) return;
        startSentAt = Date.now();
        send({ action: "start", machine_id: machineId, mode: state.mode });
      }
    },
    press(direction) {
      // The same arrow again inside the grace window: it never really let go.
      const pendingStop = releaseTimers.get(direction);
      if (pendingStop) {
        clearTimeout(pendingStop);
        releaseTimers.delete(direction);
        if (repeatTimers.has(direction)) return;
      }
      const cmd = DIRECTIONS[direction];
      if (!cmd || !movable() || repeatTimers.has(direction)) return;
      const wire = mapDirection(cmd, state.inverted);
      send({ cmd: wire });
      startMotor();
      repeatTimers.set(
        direction,
        setInterval(() => (movable() ? send({ cmd: wire }) : this.release(direction)), MOVE_REPEAT_MS)
      );
    },
    release(direction) {
      if (!repeatTimers.has(direction) || releaseTimers.has(direction)) return;
      releaseTimers.set(direction, setTimeout(() => this.stop(direction), RELEASE_GRACE_MS));
    },
    stop(direction) {
      releaseTimers.delete(direction);
      const timer = repeatTimers.get(direction);
      if (!timer) return;
      clearInterval(timer);
      repeatTimers.delete(direction);
      if (repeatTimers.size === 0) stopMotor();
      // H = safe stop that never opens the grip (see dispatch.py "H").
      if (state.status === "controlling") send({ cmd: "H" });
    },
    leave() {
      stopAllMoves();
      if (state.status === "controlling") send({ action: "leave" });
      else if (state.status === "queued" || state.status === "turn_invited") send({ action: "leave_queue" });
    },
    close() {
      closed = true;
      clearTimeout(resultTimer);
      stopAllMoves();
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      ws?.close();
    }
  };
}
