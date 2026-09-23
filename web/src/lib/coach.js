// Client for the AI coach (FireTv/ai-coach): Claude on Amazon Bedrock reads
// the machine's camera frame and returns one line. It is an extra only: any
// failure returns "", and the panel stays hidden.
import { request } from "./bridge.js";

const COACH = __GRABIUM_COACH_ORIGIN__;

async function ask(path, body) {
  if (!__GRABIUM_COACH_ENABLED__) return "";
  try {
    const reply = await request(`${COACH}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!reply.ok) return "";
    return String(JSON.parse(reply.body).line || "");
  } catch (err) {
    console.info("[coach] unavailable", err);
    return "";
  }
}

export const coachHint = (machineId) => ask("/coach/hint", { machine_id: machineId });
export const coachRecap = (machineId, result) => ask("/coach/recap", { machine_id: machineId, result });
