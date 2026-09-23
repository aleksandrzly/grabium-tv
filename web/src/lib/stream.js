// WHEP player with native-HLS fallback for the TV client.
// Follows frontend/src/lib/streamClient.js (recvonly offer, full ICE gather,
// POST SDP), trimmed to what a spectator needs. It is a port, not an import,
// so Mini App changes cannot break the TV build.
const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
// On VVD server-reflexive candidates were ready well under a second; waiting
// for "complete" alone cost ~3 s of the first-frame time in the B0 probe.
const ICE_GATHER_MAX_MS = 1000;
const CONNECT_TIMEOUT_MS = 8000;

function waitForIce(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timer = setTimeout(resolve, ICE_GATHER_MAX_MS);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/**
 * @param {HTMLVideoElement} video
 * @param {{whepUrl: string, hlsUrl: string, iceServers?: RTCIceServer[],
 *          onState?: (state: "connecting"|"live"|"hls"|"error", detail?: string) => void}} opts
 * @returns {() => void} stop
 */
export function startStream(video, { whepUrl, hlsUrl, iceServers = STUN, onState = () => {} }) {
  let stopped = false;
  let pc = null;
  let sessionUrl = null;
  let timeout = null;
  const abort = new AbortController();

  let hls = null;
  const fallbackToHls = async (reason) => {
    if (stopped || video.dataset.mode === "hls") return;
    closePeer();
    video.dataset.mode = "hls";
    video.srcObject = null;
    onState("hls", reason);
    // The TV WebView plays HLS natively; desktop Chrome and Firefox do not,
    // so the browser build brings hls.js. The TV build drops this branch.
    if (__GRABIUM_WEB__ && !video.canPlayType("application/vnd.apple.mpegurl")) {
      const { default: Hls } = await import("hls.js/light");
      if (stopped || !Hls.isSupported()) {
        if (!stopped) onState("error", "no hls support");
        return;
      }
      hls = new Hls({ lowLatencyMode: true });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) onState("error", `hls ${data.type}`);
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
    } else {
      video.src = hlsUrl;
    }
    video.play().catch(() => {});
  };

  const closePeer = () => {
    clearTimeout(timeout);
    if (pc) {
      pc.close();
      pc = null;
    }
    // Free the MediaMTX reader slot now instead of waiting for its timeout.
    if (sessionUrl) {
      fetch(sessionUrl, { method: "DELETE" }).catch(() => {});
      sessionUrl = null;
    }
  };

  async function connect() {
    onState("connecting");
    video.dataset.mode = "whep";
    pc = new RTCPeerConnection({ iceServers });
    const peer = pc;
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.ontrack = (event) => {
      if (event.streams[0]) {
        video.srcObject = event.streams[0];
        video.play().catch(() => {});
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer !== pc) return;
      if (peer.connectionState === "connected") {
        clearTimeout(timeout);
        onState("live");
      } else if (peer.connectionState === "failed") {
        fallbackToHls("webrtc failed");
      }
    };
    timeout = setTimeout(() => fallbackToHls("webrtc timeout"), CONNECT_TIMEOUT_MS);

    await peer.setLocalDescription(await peer.createOffer());
    await waitForIce(peer);
    if (peer !== pc) return;
    const response = await fetch(whepUrl, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: peer.localDescription.sdp,
      cache: "no-store",
      signal: abort.signal
    });
    if (!response.ok) throw new Error(`WHEP ${response.status}`);
    const location = response.headers.get("Location");
    // whepUrl is relative in the browser build, so resolve it against the page.
    if (location) sessionUrl = new URL(location, new URL(whepUrl, window.location.href)).toString();
    const answer = await response.text();
    if (peer !== pc) return;
    await peer.setRemoteDescription({ type: "answer", sdp: answer });
  }

  video.addEventListener("error", () => {
    if (video.dataset.mode === "hls") onState("error", "hls error");
  });

  connect().catch((err) => {
    if (!stopped) fallbackToHls(err.message);
  });

  return () => {
    stopped = true;
    abort.abort();
    closePeer();
    hls?.destroy();
    video.removeAttribute("src");
    video.srcObject = null;
    video.load();
  };
}
