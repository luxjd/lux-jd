/**
 * Minimal Apify client — starts actor runs, polls for completion, fetches dataset items.
 */

const APIFY_API = "https://api.apify.com/v2";
const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 90000;

function getApiKey() {
  return process.env.APIFY_API_KEY || "";
}

/**
 * Run an Apify actor and return the dataset items.
 * @param {string} actorId - e.g. "apify~web-scraper"
 * @param {object} input - Actor input
 * @returns {Array} Dataset items
 */
export async function runActorAndGetItems(actorId, input) {
  const token = getApiKey();
  if (!token) throw new Error("APIFY_API_KEY not set");

  // 1. Start run
  const startRes = await fetch(`${APIFY_API}/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!startRes.ok) {
    throw new Error(`Apify start failed: ${startRes.status}`);
  }

  const startData = await startRes.json();
  const runId = startData.data?.id;
  const datasetId = startData.data?.defaultDatasetId;

  if (!runId || !datasetId) {
    throw new Error("Apify run missing id or datasetId");
  }

  // 2. Poll until done
  const deadline = Date.now() + MAX_WAIT_MS;
  let status = startData.data.status;

  while (status !== "SUCCEEDED" && status !== "FAILED" && status !== "ABORTED" && status !== "TIMED-OUT") {
    if (Date.now() > deadline) {
      // Try to abort the run so we don't waste compute
      fetch(`${APIFY_API}/actor-runs/${runId}/abort?token=${token}`, { method: "POST" }).catch(() => {});
      throw new Error("Apify run timed out");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${APIFY_API}/actor-runs/${runId}?token=${token}`);
    if (!pollRes.ok) throw new Error(`Apify poll failed: ${pollRes.status}`);
    const pollData = await pollRes.json();
    status = pollData.data?.status;
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run ended with status: ${status}`);
  }

  // 3. Fetch dataset items
  const itemsRes = await fetch(`${APIFY_API}/datasets/${datasetId}/items?token=${token}&format=json`);
  if (!itemsRes.ok) throw new Error(`Apify dataset fetch failed: ${itemsRes.status}`);
  return itemsRes.json();
}
