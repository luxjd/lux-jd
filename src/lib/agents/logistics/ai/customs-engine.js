/**
 * Customs Engine — prepares customs documentation (Zollanmeldung).
 *
 * Generates all required customs data from vehicle purchase information.
 * In production: integrates with ATLAS (German customs electronic system).
 */

import { callClaude, isAIAvailable } from "@/lib/claude";

/**
 * Generate customs declaration data.
 * @param {object} vehicle — vehicle data
 * @param {object} shipment — shipment details
 * @returns {object} Zollanmeldung data package
 */
export function generateCustomsDeclaration(vehicle, shipment) {
  const cifValue = vehicle.landedCost?.cifValueEur || vehicle.cifValueEur || calculateCIF(vehicle);
  const customsDuty = Math.round(cifValue * 0.10);
  const importVat = Math.round((cifValue + customsDuty) * 0.19);

  return {
    declarationType: "IMPORT_DEFINITIVE",
    documentId: `ZA-${Date.now()}`,

    importer: {
      name: "LuxJD GmbH",
      eoriNumber: "DE000000000000001",
      vatId: "DE000000000",
      address: "Musterstraße 1, 28195 Bremen, Germany",
    },

    vehicle: {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin || `WBA${Date.now().toString().slice(-14)}`,
      originCountry: "JP",
      hsCode: "8703.24", // Vehicles with spark-ignition engine >3000cc
      engineCapacityCc: vehicle.engineCapacityCc || 4000,
      fuelType: vehicle.fuelType || "PETROL",
      newOrUsed: "USED",
      firstRegistrationDate: `${vehicle.year}-01-01`,
      mileageKm: vehicle.mileageKm,
      co2GKm: vehicle.co2 || 250,
    },

    financial: {
      invoiceValueJpy: vehicle.purchasePriceJpy || vehicle.askingPriceJpy,
      invoiceValueEur: vehicle.purchasePriceEur || Math.round((vehicle.purchasePriceJpy || 0) / 167),
      freightCostEur: shipment?.route ? 2800 : 2800,
      insuranceCostEur: vehicle.landedCost?.insuranceEur || Math.round(cifValue * 0.02),
      cifValueEur: cifValue,
      customsDutyRate: 10.0,
      customsDutyEur: customsDuty,
      importVatRate: 19.0,
      importVatEur: importVat,
      totalDueEur: customsDuty + importVat,
      vatReclaimable: true,
    },

    documents: {
      commercialInvoice: true,
      billOfLading: true,
      exportPermissionCertificate: true,
      radiationCertificate: true,
      certificateOfOrigin: true,
      marineInsuranceCertificate: true,
      vehicleRegistrationCopy: true,
      deRegistrationCertificate: true,
    },

    portOfEntry: shipment?.route?.destination || "Bremerhaven",
    customsBroker: {
      name: "Kühne + Nagel Customs Services",
      contact: "customs@kuehne-nagel.com",
      reference: `KN-${Date.now().toString().slice(-8)}`,
    },

    status: "PREPARED",
    preparedAt: new Date().toISOString(),
    estimatedProcessingDays: 3,
  };
}

function calculateCIF(vehicle) {
  const purchaseEur = vehicle.purchasePriceEur || vehicle.askingPriceEur || 80000;
  const auctionFees = Math.round(purchaseEur * 0.04);
  const transport = 400;
  const docs = 175;
  const freight = 2800;
  const insurance = Math.round(purchaseEur * 0.02);
  return purchaseEur + auctionFees + transport + docs + freight + insurance;
}

/**
 * Track document upload status for a customs declaration.
 * Returns which docs are uploaded, pending, or missing.
 */
export function getDocumentStatus(declaration) {
  const required = [
    { key: "commercialInvoice", label: "Commercial Invoice (Kaufvertrag)", critical: true },
    { key: "billOfLading", label: "Bill of Lading (Konnossement)", critical: true },
    { key: "exportPermissionCertificate", label: "Export Permission Certificate (EPC)", critical: true },
    { key: "radiationCertificate", label: "Radiation Inspection Certificate", critical: true },
    { key: "certificateOfOrigin", label: "Certificate of Origin", critical: false },
    { key: "marineInsuranceCertificate", label: "Marine Insurance Certificate", critical: true },
    { key: "vehicleRegistrationCopy", label: "Japanese Vehicle Registration Copy", critical: false },
    { key: "deRegistrationCertificate", label: "Japanese De-Registration Certificate (抹消登録証明書)", critical: true },
  ];

  const docs = declaration.documents || {};
  const uploaded = required.filter((d) => docs[d.key] === true);
  const pending = required.filter((d) => !docs[d.key]);
  const criticalMissing = pending.filter((d) => d.critical);

  return {
    total: required.length,
    uploaded: uploaded.length,
    pending: pending.length,
    criticalMissing: criticalMissing.length,
    readyForSubmission: criticalMissing.length === 0,
    documents: required.map((d) => ({
      ...d,
      status: docs[d.key] ? "UPLOADED" : "PENDING",
    })),
    brokerReference: declaration.customsBroker?.reference || null,
    estimatedProcessingDays: declaration.estimatedProcessingDays || 3,
  };
}

/**
 * Mark a document as uploaded.
 */
export function markDocumentUploaded(declaration, documentKey) {
  if (!declaration.documents) declaration.documents = {};
  declaration.documents[documentKey] = true;
  declaration.documentsUpdatedAt = new Date().toISOString();

  // Check if all critical docs are now present
  const status = getDocumentStatus(declaration);
  if (status.readyForSubmission) {
    declaration.status = "READY_FOR_SUBMISSION";
  }

  return declaration;
}

/**
 * Submit declaration to customs broker (simulated — v2 will integrate with ATLAS).
 */
export function submitToBroker(declaration) {
  declaration.status = "SUBMITTED_TO_BROKER";
  declaration.submittedAt = new Date().toISOString();
  declaration.brokerStatus = "PROCESSING";
  declaration.expectedClearanceDate = new Date(Date.now() + (declaration.estimatedProcessingDays || 3) * 24 * 60 * 60 * 1000).toISOString();
  return declaration;
}

/**
 * AI-powered customs document review.
 */
export async function reviewCustomsDocuments(declaration) {
  if (!isAIAvailable()) return null;

  const result = await callClaude({
    prompt: `Review this German customs import declaration for a luxury vehicle from Japan.

Vehicle: ${declaration.vehicle.make} ${declaration.vehicle.model} ${declaration.vehicle.year}
VIN: ${declaration.vehicle.vin}
HS Code: ${declaration.vehicle.hsCode}
CIF Value: €${declaration.financial.cifValueEur.toLocaleString()}
Duty (10%): €${declaration.financial.customsDutyEur.toLocaleString()}
VAT (19%): €${declaration.financial.importVatEur.toLocaleString()}
Port: ${declaration.portOfEntry}

Documents present: ${Object.entries(declaration.documents).filter(([,v]) => v).map(([k]) => k).join(", ")}

Return ONLY valid JSON:
{
  "status": "APPROVED" or "ISSUES_FOUND",
  "issues": ["issue 1"] or [],
  "recommendations": ["rec 1"],
  "hs_code_correct": <boolean>,
  "duty_calculation_correct": <boolean>,
  "missing_documents": ["doc 1"] or [],
  "estimated_clearance_days": <integer>,
  "risk_level": "LOW" or "MEDIUM" or "HIGH"
}`,
    system: "You are a German customs specialist (Zollberater) with expertise in vehicle imports from Japan under EU customs regulations.",
    jsonMode: true,
  });

  return result;
}
