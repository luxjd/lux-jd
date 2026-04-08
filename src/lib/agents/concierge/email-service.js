/**
 * Email Service — sends customer responses and vehicle photos via SMTP.
 *
 * Supports:
 * - Nodemailer for SMTP delivery
 * - HTML-formatted luxury dealer emails
 * - Photo attachments from pipeline storage
 * - Multi-language subject lines
 *
 * Configure in .env.local:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=your@email.com
 *   SMTP_PASS=your-app-password
 *   SMTP_FROM="LuxJD GmbH <info@luxjd.com>"
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";

const PHOTOS_DIR = join(process.cwd(), "data", "logistics", "photos");

/**
 * Check if email service is configured.
 */
export function isEmailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Get Nodemailer transporter. Lazy-loaded to avoid import errors if nodemailer not installed.
 */
async function getTransporter() {
  try {
    const nodemailer = await import("nodemailer");
    return nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Get all photos for a vehicle from pipeline storage.
 * Returns array of { filename, path, buffer } for attachment.
 */
export function getVehiclePhotos(vehicleId) {
  const vehicleDir = join(PHOTOS_DIR, vehicleId);
  if (!existsSync(vehicleDir)) return [];

  const photos = [];
  const stages = readdirSync(vehicleDir).filter((f) => {
    const fullPath = join(vehicleDir, f);
    try { return require("fs").statSync(fullPath).isDirectory(); } catch { return false; }
  });

  for (const stage of stages) {
    const stageDir = join(vehicleDir, stage);
    const files = readdirSync(stageDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
    for (const file of files) {
      const filePath = join(stageDir, file);
      photos.push({
        filename: file,
        stage,
        path: filePath,
        buffer: readFileSync(filePath),
      });
    }
  }

  return photos;
}

/**
 * Build HTML email template for luxury dealer communication.
 */
function buildEmailHtml(responseText, vehicle, customerName) {
  const vehicleName = `${vehicle.make} ${vehicle.model} ${vehicle.year}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #0a0a0a; color: #e8e8e8; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; padding-bottom: 30px; border-bottom: 1px solid #222; margin-bottom: 30px; }
    .logo { font-size: 28px; font-weight: 700; letter-spacing: 3px; color: #f87171; }
    .subtitle { font-size: 11px; color: #888; letter-spacing: 2px; text-transform: uppercase; margin-top: 5px; }
    .vehicle-tag { display: inline-block; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 8px 16px; margin-bottom: 20px; font-size: 13px; color: #ccc; }
    .content { font-size: 15px; line-height: 1.8; color: #ddd; white-space: pre-wrap; }
    .photos-section { margin-top: 30px; padding-top: 20px; border-top: 1px solid #222; }
    .photos-title { font-size: 13px; color: #f87171; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #222; text-align: center; }
    .footer p { font-size: 11px; color: #666; line-height: 1.6; }
    .cta { display: inline-block; background: #f87171; color: #000; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">LUXJD</div>
      <div class="subtitle">Premium Automotive</div>
    </div>

    <div class="vehicle-tag">${vehicleName}</div>

    <div class="content">${responseText}</div>

    <div class="footer">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/showroom" class="cta">View Vehicle Details</a>
      <p>
        LuxJD GmbH · Premium Vehicle Import<br>
        Musterstraße 1 · 28195 Bremen · Germany<br>
        <a href="mailto:info@luxjd.com" style="color: #f87171;">info@luxjd.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

const SUBJECT_LINES = {
  DE: (vehicle) => `Ihre Anfrage: ${vehicle.make} ${vehicle.model} ${vehicle.year} — LuxJD`,
  EN: (vehicle) => `Your Inquiry: ${vehicle.make} ${vehicle.model} ${vehicle.year} — LuxJD`,
  FR: (vehicle) => `Votre demande: ${vehicle.make} ${vehicle.model} ${vehicle.year} — LuxJD`,
  IT: (vehicle) => `La sua richiesta: ${vehicle.make} ${vehicle.model} ${vehicle.year} — LuxJD`,
  NL: (vehicle) => `Uw aanvraag: ${vehicle.make} ${vehicle.model} ${vehicle.year} — LuxJD`,
};

/**
 * Send a response email to the customer, optionally with vehicle photos attached.
 */
export async function sendResponseEmail({ customerEmail, customerName, responseText, vehicle, language = "EN", includePhotos = false }) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local");
    return { sent: false, reason: "SMTP not configured" };
  }

  if (!customerEmail) {
    return { sent: false, reason: "No customer email" };
  }

  const transporter = await getTransporter();
  if (!transporter) {
    return { sent: false, reason: "Nodemailer not available — run: npm install nodemailer" };
  }

  const subjectFn = SUBJECT_LINES[language] || SUBJECT_LINES.EN;
  const subject = subjectFn(vehicle);
  const html = buildEmailHtml(responseText, vehicle, customerName);

  const mailOptions = {
    from: process.env.SMTP_FROM || `"LuxJD GmbH" <${process.env.SMTP_USER}>`,
    to: customerEmail,
    subject,
    html,
    attachments: [],
  };

  // Attach vehicle photos if requested
  if (includePhotos && vehicle.id) {
    const photos = getVehiclePhotos(vehicle.id);
    const maxPhotos = 10; // Limit to avoid huge emails
    for (const photo of photos.slice(0, maxPhotos)) {
      mailOptions.attachments.push({
        filename: photo.filename,
        content: photo.buffer,
        contentType: "image/jpeg",
      });
    }
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${customerEmail}: ${info.messageId}`);
    return {
      sent: true,
      messageId: info.messageId,
      to: customerEmail,
      subject,
      photosAttached: mailOptions.attachments.length,
    };
  } catch (err) {
    console.error("Email send failed:", err.message);
    return { sent: false, reason: err.message };
  }
}
