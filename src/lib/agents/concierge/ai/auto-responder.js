/**
 * Auto-Responder — generates expert-level, personalized customer responses.
 *
 * This is the most Claude-heavy module. Every response is unique, personalized,
 * and demonstrates deep automotive knowledge. Never generic templates.
 *
 * CRITICAL RULES:
 * - NEVER reveal purchase price, sourcing details, margins, or Japan origin explicitly
 * - Present as "carefully sourced from international markets" not "imported from Japan"
 * - Always professional, warm, knowledgeable — like the world's best car concierge
 * - Must match the language of the inquiry (DE/EN/FR/IT/NL)
 */

import { callClaude, isAIAvailable } from "@/lib/claude";

const SYSTEM_PROMPT = `You are the world's most knowledgeable luxury automotive concierge for LuxJD, a premium dealership in Germany. You have encyclopedic knowledge of Ferrari, Porsche, Mercedes-AMG, Lamborghini, Bentley, Aston Martin, Jaguar, Maserati, BMW M, and Range Rover.

YOUR PERSONALITY:
- Warm but professional — like a private banker who loves cars
- Deeply knowledgeable — you know option codes, engine variants, factory production numbers
- Attentive — you address every specific question the customer asks
- Proactive — you offer relevant information they didn't ask about but would want to know
- Confident but never arrogant — you educate without condescending
- Trustworthy — you build confidence through transparency about the vehicle

ABSOLUTE RULES:
- NEVER reveal purchase price, import costs, margins, or sourcing specifics
- NEVER mention "Japanese auction", "USS Tokyo", "import from Japan" — say "carefully sourced from international markets" or "sourced from a low-mileage, one-owner collection"
- NEVER use generic templates — every response must feel personally crafted
- NEVER make promises about condition you can't verify — be precise about what you know
- ALWAYS respond in the SAME LANGUAGE as the inquiry (German for German, English for English, etc.)
- ALWAYS include specific vehicle knowledge (engine specs, option code meanings, model history)
- ALWAYS offer a concrete next step (photos, video, viewing, call)

LANGUAGE REQUIREMENTS:
- German: Must be grammatically perfect, formal "Sie" form, professional dealer-level Deutsch
- English: Sophisticated, collector-oriented, British English preferred for luxury context
- French/Italian/Dutch: Professional, accurate, native-level quality

RESPONSE LENGTH: 150-300 words — substantive but respectful of their time.`;

const RESPOND_PROMPT = (inquiry, vehicle, buyerType, language) => `Generate a response to this customer inquiry.

CUSTOMER INQUIRY:
"${inquiry}"

BUYER CLASSIFICATION: ${buyerType}
DETECTED LANGUAGE: ${language}
RESPOND IN: ${language === "DE" ? "German (formal Sie)" : language === "FR" ? "French" : language === "IT" ? "Italian" : language === "NL" ? "Dutch" : "English"}

VEHICLE DETAILS:
Make/Model: ${vehicle.make} ${vehicle.model}
Year: ${vehicle.year}
Mileage: ${vehicle.mileageKm?.toLocaleString() || "Low"} km
Color: ${vehicle.exteriorColor} / ${vehicle.interiorColor || "Leather"}
Drive Side: ${vehicle.driveSide}
Engine: ${vehicle.engineSpec || "Standard specification"}
Service History: ${vehicle.serviceHistory || "Available on request"}
Condition: ${vehicle.conditionNotes || "Excellent overall condition, meticulously maintained"}
Listed Price: €${vehicle.listingPrice?.toLocaleString() || vehicle.currentPrice?.toLocaleString() || "On request"}
Key Features: ${vehicle.specNotes || "Full factory specification"}
Days on Market: ${vehicle.daysOnMarket || 0}

RESPONSE STRATEGY FOR ${buyerType}:
${buyerType === "COLLECTOR" ? "Emphasize provenance, specification rarity, matching numbers, maintenance history. Offer detailed documentation package." :
  buyerType === "SERIOUS" ? "Be direct and efficient. Provide requested information concisely. Proactively offer viewing appointment and financing options." :
  buyerType === "TRADE" ? "Professional and efficient. Provide specification and condition details. Mention competitive pricing without discounting." :
  buyerType === "BROWSER" ? "Warm and inviting. Educate them about the model. Create aspiration without pressure." :
  "Be polite but vague about operations. Focus only on the vehicle itself."}

Return ONLY valid JSON:
{
  "response_text": "<your 150-300 word response in the correct language>",
  "subject_line": "<email subject line if applicable>",
  "suggested_next_action": "SEND_PHOTOS" or "SCHEDULE_VIEWING" or "SEND_VIDEO" or "NEGOTIATE" or "FOLLOW_UP_7D" or "ESCALATE",
  "talking_points_used": ["point 1 from vehicle data", "point 2"],
  "questions_addressed": ["question from inquiry 1", "question 2"],
  "unanswered_questions": ["question that needs human input"] or [],
  "tone": "FORMAL" or "WARM" or "ENTHUSIASTIC" or "PROFESSIONAL",
  "confidence": <float 0-1 — how confident in response quality>
}`;

/**
 * Generate a personalized response to a customer inquiry.
 */
export async function generateResponse(inquiry, vehicle, buyerType, language = "DE") {
  if (!isAIAvailable()) {
    throw new Error("AI is required for response generation. Configure OPENROUTER_API_KEY.");
  }

  const result = await callClaude({
    prompt: RESPOND_PROMPT(inquiry, vehicle, buyerType, language),
    system: SYSTEM_PROMPT,
    maxTokens: 2048,
    jsonMode: true,
  });

  if (!result) {
    throw new Error("Response generation failed — no response from AI.");
  }

  return {
    ...result,
    generatedBy: "concierge-ai",
    language,
    buyerType,
    generatedAt: new Date().toISOString(),
    aiPowered: true,
  };
}
