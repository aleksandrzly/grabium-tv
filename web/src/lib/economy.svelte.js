// Arcade vs prize economy, as the Mini App decides it (frontend/src/lib/economy.js):
// prize_fulfillment_enabled === false means an arcade pilot with no shipped
// prizes. The TV is stricter about the unknown case: until the edge says
// prizes ship, it makes no prize promises at all.
export const economy = $state({ prizesShip: false });

export function applyEconomy(payload) {
  if (payload && Object.hasOwn(payload, "prize_fulfillment_enabled")) {
    economy.prizesShip = payload.prize_fulfillment_enabled === true;
  }
}

const MODES = {
  classic: { label: "Classic", blurb: "Steer, drop, grab — one shot per round" },
  freedrop: { label: "FreeDrop", blurb: "Grab, then pick where to drop it" }
};

export const modeInfo = (mode) => MODES[mode] || { label: mode || "Arcade", blurb: "Live skill game" };
