// Maps Fire TV / Vega remote keys to app actions.
// Measured on Vega Virtual Device (docs/b0-results.md): a held arrow repeats
// keydown with e.repeat === false, so held-key state is tracked here instead
// of trusting the flag. Back arrives as GoBack / BrowserBack, keyCode 27.
const KEYMAP = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "ok",
  " ": "ok",
  GoBack: "back",
  BrowserBack: "back",
  Escape: "back",
  Backspace: "back",
  // Fire TV's ≡ button. Which name Vega's WebView reports is not confirmed
  // yet, so the common spellings are all accepted.
  ContextMenu: "menu",
  Menu: "menu",
  MediaContextMenu: "menu",
  // Desktop browser build: a keyboard has no Menu button.
  m: "menu",
  M: "menu"
};

// Keys aimed at a focused form control belong to it, not to the remote:
// typing in a field, and OK/Enter on a focused button (which the browser
// turns into a click only if nobody calls preventDefault on it).
const typing = (event) => /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target?.tagName || "");

// Keys a listener consumed stay consumed until they are released. Without
// this, the remote's auto-repeat keydowns for the same press land on the
// layer underneath once the top layer has closed: Back that closed Settings
// would repeat into the lobby and close the app.
const swallowed = new Set();

function actionOf(event) {
  if (KEYMAP[event.key] || KEYMAP[event.code]) return KEYMAP[event.key] || KEYMAP[event.code];
  if (event.keyCode === 27) return "back";
  // 82 is Android's KEYCODE_MENU, 93 the DOM context-menu key.
  if (event.keyCode === 82 || event.keyCode === 93) return "menu";
  return null;
}

/**
 * @param {(action: string, info: {first: boolean}) => boolean | void} onPress
 *   called on every keydown; `first` is false for auto-repeat. Returning true
 *   consumes the key so later listeners (the screen under an overlay) skip it.
 * @param {(action: string) => boolean | void} [onRelease]
 * @param {{capture?: boolean}} [options] capture runs before normal listeners
 * @returns {() => void} cleanup
 */
export function listenRemote(onPress, onRelease, { capture = false } = {}) {
  const held = new Set();
  const down = (event) => {
    if (typing(event)) return;
    const action = actionOf(event);
    if (!action) return;
    event.preventDefault();
    if (swallowed.has(action)) return;
    const first = !held.has(action);
    held.add(action);
    if (onPress(action, { first }) === true) {
      swallowed.add(action);
      event.stopImmediatePropagation();
    }
  };
  const up = (event) => {
    if (typing(event)) return;
    const action = actionOf(event);
    if (!action) return;
    event.preventDefault();
    held.delete(action);
    if (swallowed.has(action)) {
      // The press belonged to whoever consumed it; its release does too.
      swallowed.delete(action);
      event.stopImmediatePropagation();
      return;
    }
    if (onRelease?.(action) === true) event.stopImmediatePropagation();
  };
  // Losing focus while a key is held would otherwise leave it "held" forever.
  const blur = () => {
    for (const action of held) onRelease?.(action);
    held.clear();
    swallowed.clear();
  };
  window.addEventListener("keydown", down, { capture });
  window.addEventListener("keyup", up, { capture });
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down, { capture });
    window.removeEventListener("keyup", up, { capture });
    window.removeEventListener("blur", blur);
  };
}
