export async function POST() {
  // Simulated scan trigger — in production this would kick off a real scraping job
  return Response.json({
    jobId: `scan-${Date.now()}`,
    status: "COMPLETED",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    results: { listingsScanned: 142, newFound: 3, priceChanges: 8, duration: 23400 },
  });
}
