/**
 * Logistics Agent Storage — vehicles, shipments, events.
 * Uses PostgreSQL via Prisma (no local JSON files).
 */

import { getDb } from "@/lib/db";

// ─── Pipeline Vehicles ───

export async function getPipelineVehicles() {
  const db = await getDb();
  if (!db) return { vehicles: [] };
  const vehicles = await db.vehicle.findMany({ orderBy: { updatedAt: "desc" } });
  return { vehicles: vehicles.map(mapVehicleToJson) };
}

export async function savePipelineVehicle(vehicle) {
  const db = await getDb();
  if (!db) return vehicle;
  const data = mapJsonToVehicleData(vehicle);
  const saved = await db.vehicle.upsert({
    where: { id: vehicle.id },
    update: data,
    create: { id: vehicle.id, ...data },
  });
  return mapVehicleToJson(saved);
}

export async function getVehicleById(id) {
  const db = await getDb();
  if (!db) return null;
  const v = await db.vehicle.findUnique({ where: { id } });
  return v ? mapVehicleToJson(v) : null;
}

// ─── Pipeline Events ───

export async function getPipelineEvents(vehicleId = null) {
  const db = await getDb();
  if (!db) return { events: [] };
  const where = vehicleId ? { vehicleId } : {};
  const events = await db.pipelineEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  return {
    events: events.map((e) => ({
      id: e.id,
      vehicleId: e.vehicleId,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      agent: e.agent,
      message: e.message,
      metadata: e.metadata,
      timestamp: e.createdAt.toISOString(),
    })),
  };
}

export async function addPipelineEvent(event) {
  const db = await getDb();
  if (!db) return;
  await db.pipelineEvent.create({
    data: {
      vehicleId: event.vehicleId,
      fromStatus: event.fromStatus || null,
      toStatus: event.toStatus || event.status || "SOURCED",
      agent: event.agent || "logistics",
      message: event.message || null,
      metadata: event.metadata || {},
    },
  });
}

// ─── Shipments ───

export async function getShipments() {
  const db = await getDb();
  if (!db) return { shipments: [] };
  const shipments = await db.shipment.findMany({ orderBy: { createdAt: "desc" }, include: { vehicle: true } });
  return { shipments };
}

export async function saveShipment(shipment) {
  const db = await getDb();
  if (!db) return shipment;
  const id = shipment.id || shipment.shipmentId;
  const data = {
    vehicleId: shipment.vehicleId,
    vesselName: shipment.vesselName || "TBD",
    containerId: shipment.containerId || "TBD",
    containerType: shipment.containerType || "DEDICATED_20FT",
    originPort: shipment.originPort || "Yokohama",
    destinationPort: shipment.destinationPort || "Bremerhaven",
    carrier: shipment.carrier || null,
    departureDate: shipment.departureDate ? new Date(shipment.departureDate) : null,
    estimatedArrival: shipment.estimatedArrival ? new Date(shipment.estimatedArrival) : null,
    actualArrival: shipment.actualArrival ? new Date(shipment.actualArrival) : null,
    insuranceProvider: shipment.insuranceProvider || null,
    insurancePolicy: shipment.insurancePolicy || null,
    preShipPhotos: shipment.preShipPhotos || [],
    postArrivalPhotos: shipment.postArrivalPhotos || [],
    damageDetected: shipment.damageDetected || false,
    status: shipment.status || "PENDING",
  };
  const saved = await db.shipment.upsert({
    where: { id },
    update: data,
    create: { id, ...data },
  });
  return saved;
}

// ─── TUV Appointments ───

export async function getTuvAppointments() {
  const db = await getDb();
  if (!db) return { appointments: [] };
  const appointments = await db.tuvAppointment.findMany({ orderBy: { createdAt: "desc" } });
  return { appointments };
}

export async function saveTuvAppointment(appointment) {
  const db = await getDb();
  if (!db) return appointment;
  const id = appointment.id || undefined;
  const data = {
    vehicleId: appointment.vehicleId,
    stationName: appointment.stationName || "TBD",
    stationCity: appointment.stationCity || "TBD",
    appointmentDate: appointment.appointmentDate ? new Date(appointment.appointmentDate) : null,
    complexity: appointment.complexity || "LOW",
    estimatedCost: appointment.estimatedCost || null,
    passProbability: appointment.passProbability || null,
    checklist: appointment.checklist || [],
    result: appointment.result || null,
    notes: appointment.notes || null,
    status: appointment.status || "SCHEDULED",
  };
  if (id) {
    const saved = await db.tuvAppointment.upsert({ where: { id }, update: data, create: { id, ...data } });
    return saved;
  }
  return db.tuvAppointment.create({ data });
}

// ─── Customs Declarations (stored in KeyValueStore) ───

export async function getCustomsDeclarations() {
  const db = await getDb();
  if (!db) return { declarations: [] };
  const row = await db.keyValueStore.findUnique({ where: { key: "customs-declarations" } });
  return row?.value || { declarations: [] };
}

export async function saveCustomsDeclaration(declaration) {
  const db = await getDb();
  if (!db) return declaration;
  const current = await getCustomsDeclarations();
  current.declarations.push(declaration);
  await db.keyValueStore.upsert({
    where: { key: "customs-declarations" },
    update: { value: current },
    create: { key: "customs-declarations", value: current },
  });
  return declaration;
}

// ─── Agent Status ───

export async function getAgentStatus() {
  const db = await getDb();
  if (!db) return { status: "IDLE", lastActionTimestamp: null };
  const s = await db.agentStatus.findUnique({ where: { id: "logistics" } });
  if (!s) return { status: "IDLE", lastActionTimestamp: null };
  return { ...s.metadata, status: s.status, lastAction: s.lastAction, lastActionAt: s.lastActionAt?.toISOString(), updatedAt: s.updatedAt.toISOString() };
}

export async function updateAgentStatus(updates) {
  const db = await getDb();
  if (!db) return;
  const current = await getAgentStatus();
  const { status, lastAction, lastActionAt, ...rest } = { ...current, ...updates };
  await db.agentStatus.upsert({
    where: { id: "logistics" },
    update: { name: "Logistics", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
    create: { id: "logistics", name: "Logistics", status: status || "IDLE", lastAction, lastActionAt: lastActionAt ? new Date(lastActionAt) : new Date(), metadata: rest },
  });
}

// ─── Helpers ───

function mapVehicleToJson(v) {
  return {
    id: v.id,
    status: v.status,
    currentStage: v.status,
    make: v.make,
    model: v.model,
    year: v.year,
    variant: v.variant,
    vin: v.vin,
    driveSide: v.driveSide,
    mileageKm: v.mileageKm,
    exteriorColor: v.exteriorColor,
    interiorColor: v.interiorColor,
    specification: v.specification,
    engineSpec: v.engineSpec,
    auctionSource: v.auctionSource,
    auctionGrade: v.auctionGrade ? Number(v.auctionGrade) : null,
    auctionLot: v.auctionLot,
    purchasePriceJpy: v.purchasePriceJpy ? Number(v.purchasePriceJpy) : null,
    fxRateAtPurchase: v.fxRateAtPurchase ? Number(v.fxRateAtPurchase) : null,
    landedCostEur: v.landedCostEur ? Number(v.landedCostEur) : null,
    estimatedSalePrice: v.estimatedSalePrice ? Number(v.estimatedSalePrice) : null,
    listingPriceEur: v.listingPriceEur ? Number(v.listingPriceEur) : null,
    actualSalePrice: v.actualSalePrice ? Number(v.actualSalePrice) : null,
    marginEstimate: v.marginEstimate ? Number(v.marginEstimate) : null,
    marginActual: v.marginActual ? Number(v.marginActual) : null,
    conditionReport: v.conditionReport,
    provenanceRecord: v.provenanceRecord,
    riskFlags: v.riskFlags,
    costBreakdown: v.costBreakdown,
    documents: v.documents,
    photos: v.photos,
    stageEnteredAt: v.stageEnteredAt?.toISOString() || null,
    stageHistory: v.stageHistory,
    estimatedReadyDate: v.estimatedReadyDate?.toISOString() || null,
    notes: v.notes,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

function mapJsonToVehicleData(v) {
  const data = {};
  if (v.status !== undefined || v.currentStage !== undefined) data.status = v.status || v.currentStage || "SOURCED";
  if (v.make !== undefined) data.make = v.make;
  if (v.model !== undefined) data.model = v.model;
  if (v.year !== undefined) data.year = v.year;
  if (v.variant !== undefined) data.variant = v.variant;
  if (v.vin !== undefined) data.vin = v.vin;
  if (v.driveSide !== undefined) data.driveSide = v.driveSide;
  if (v.mileageKm !== undefined) data.mileageKm = v.mileageKm;
  if (v.exteriorColor !== undefined) data.exteriorColor = v.exteriorColor;
  if (v.interiorColor !== undefined) data.interiorColor = v.interiorColor;
  if (v.specification !== undefined) data.specification = v.specification;
  if (v.engineSpec !== undefined) data.engineSpec = v.engineSpec;
  if (v.auctionSource !== undefined) data.auctionSource = v.auctionSource;
  if (v.auctionGrade !== undefined) data.auctionGrade = v.auctionGrade;
  if (v.auctionLot !== undefined) data.auctionLot = v.auctionLot;
  if (v.purchasePriceJpy !== undefined) data.purchasePriceJpy = v.purchasePriceJpy;
  if (v.fxRateAtPurchase !== undefined) data.fxRateAtPurchase = v.fxRateAtPurchase;
  if (v.landedCostEur !== undefined) data.landedCostEur = v.landedCostEur;
  if (v.estimatedSalePrice !== undefined) data.estimatedSalePrice = v.estimatedSalePrice;
  if (v.listingPriceEur !== undefined) data.listingPriceEur = v.listingPriceEur;
  if (v.actualSalePrice !== undefined) data.actualSalePrice = v.actualSalePrice;
  if (v.marginEstimate !== undefined) data.marginEstimate = v.marginEstimate;
  if (v.marginActual !== undefined) data.marginActual = v.marginActual;
  if (v.conditionReport !== undefined) data.conditionReport = v.conditionReport;
  if (v.provenanceRecord !== undefined) data.provenanceRecord = v.provenanceRecord;
  if (v.riskFlags !== undefined) data.riskFlags = v.riskFlags;
  if (v.costBreakdown !== undefined) data.costBreakdown = v.costBreakdown;
  if (v.documents !== undefined) data.documents = v.documents;
  if (v.photos !== undefined) data.photos = v.photos;
  if (v.stageEnteredAt !== undefined) data.stageEnteredAt = v.stageEnteredAt ? new Date(v.stageEnteredAt) : null;
  if (v.stageHistory !== undefined) data.stageHistory = v.stageHistory;
  if (v.estimatedReadyDate !== undefined) data.estimatedReadyDate = v.estimatedReadyDate ? new Date(v.estimatedReadyDate) : null;
  if (v.notes !== undefined) data.notes = v.notes;
  // Ensure required fields
  if (!data.make) data.make = v.make || "Unknown";
  if (!data.model) data.model = v.model || "Unknown";
  if (!data.year) data.year = v.year || new Date().getFullYear();
  if (!data.driveSide) data.driveSide = v.driveSide || "RHD";
  return data;
}
