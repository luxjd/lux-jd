import { getDb } from "@/lib/db";

// Strip Carsensor's "S" thumbnail prefix from a filename (SUZxxxx_N_NNN.jpg → UZxxxx_N_NNN.jpg).
// Verified via direct CDN probe: filename-prefixed "S" returns a ~2KB thumbnail;
// the unprefixed filename returns the full-resolution image (~45KB+).
function upgradeCarsensorUrl(url) {
  if (typeof url !== "string") return url;
  if (!/ccsrpcml\.carsensor\.net|img\.carsensor\.net/i.test(url)) return url;
  return url.replace(/\/S([A-Z]{1,4}\d+_\d+_\d+\.(?:jpe?g|png|webp))/i, "/$1");
}

function upgradeList(list) {
  if (!Array.isArray(list)) return { list, changed: 0 };
  let changed = 0;
  const next = list.map((u) => {
    const up = upgradeCarsensorUrl(u);
    if (up !== u) changed++;
    return up;
  });
  return { list: next, changed };
}

export async function POST() {
  const db = await getDb();
  if (!db) return Response.json({ error: "DB unavailable" }, { status: 500 });

  const row = await db.keyValueStore.findUnique({
    where: { key: "jp-sourcing-latest-opportunities" },
  });
  if (!row?.value?.opportunities) {
    return Response.json({ message: "No opportunities to migrate", upgradedUrls: 0, opportunitiesTouched: 0 });
  }

  const data = row.value;
  let upgradedUrls = 0;
  let opportunitiesTouched = 0;

  for (const opp of data.opportunities) {
    if (!opp?.vehicle?.photoUrls) continue;
    const { list, changed } = upgradeList(opp.vehicle.photoUrls);
    if (changed > 0) {
      opp.vehicle.photoUrls = list;
      upgradedUrls += changed;
      opportunitiesTouched++;
    }
  }

  await db.keyValueStore.update({
    where: { key: "jp-sourcing-latest-opportunities" },
    data: { value: data },
  });

  return Response.json({
    message: "Photo URLs upgraded in place",
    upgradedUrls,
    opportunitiesTouched,
    totalOpportunities: data.opportunities.length,
  });
}
