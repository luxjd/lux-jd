import { isAIAvailable } from "@/lib/claude";
import { extractWithPipeline } from "@/lib/agents/valuation/extraction-pipeline";

export async function POST(request) {
  if (!isAIAvailable()) {
    return Response.json({ error: "AI service not configured" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    const images = [];
    for (const file of files) {
      if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mediaType = file.type || "image/jpeg";
        images.push({ data: base64, mediaType });
      }
    }

    if (images.length === 0) {
      return Response.json({ error: "No valid files provided" }, { status: 400 });
    }

    const result = await extractWithPipeline(images);

    return Response.json(result);
  } catch (err) {
    console.error("Data extraction error:", err);
    return Response.json(
      { error: err.message || "Failed to extract data from files" },
      { status: err.message?.includes("Could not extract") ? 422 : 500 }
    );
  }
}
