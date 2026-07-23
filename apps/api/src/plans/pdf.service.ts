import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { DietPlanPayloadSchema, TrainingPlanPayloadSchema } from "@keystone/core";

@Injectable()
export class PdfService {
  /** Render a branded PDF for any plan type. */
  planPdf(
    type: "DIET" | "TRAINING",
    payload: Record<string, unknown>,
    member: { name?: string } | null,
  ): Promise<Buffer> {
    return type === "TRAINING"
      ? this.trainingPlanPdf(payload, member)
      : this.dietPlanPdf(payload, member);
  }

  /** Render a branded one-page Diet plan PDF into a Buffer. */
  dietPlanPdf(
    payload: Record<string, unknown>,
    member: { name?: string } | null,
  ): Promise<Buffer> {
    const parsed = DietPlanPayloadSchema.safeParse(payload);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 54 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc.fillColor("#1A1560").fontSize(22).text("KEYSTONE", { continued: false });
      doc.fillColor("#8A857A").fontSize(10).text("Personalized nutrition plan");
      doc.moveDown(0.6);
      doc.fillColor("#100E0A").fontSize(14).text(member?.name ?? "Member");
      doc.moveDown(0.8);

      if (!parsed.success) {
        doc.fillColor("#c22e0e").fontSize(11).text("Plan data unavailable.");
        doc.end();
        return;
      }
      const p = parsed.data;
      const t = p.dailyTargets;

      doc.fillColor("#12995A").fontSize(12).text(`Protocol: ${p.protocolSlug}`);
      doc.moveDown(0.3);
      doc
        .fillColor("#100E0A")
        .fontSize(12)
        .text(`Daily target: ${t.kcal} kcal  •  P ${t.proteinG}g  •  C ${t.carbsG}g  •  F ${t.fatG}g`);
      doc.moveDown(0.8);

      doc.fillColor("#1568D4").fontSize(13).text("Meals");
      doc.moveDown(0.2);
      for (const meal of p.meals) {
        doc.fillColor("#100E0A").fontSize(11).text(meal.name, { underline: true });
        for (const item of meal.items) {
          doc.fillColor("#4C483E").fontSize(10).text(`• ${item}`, { indent: 12 });
        }
        doc.moveDown(0.3);
      }

      if (p.groceryList.length) {
        doc.moveDown(0.4);
        doc.fillColor("#D68C13").fontSize(13).text("Grocery list");
        doc.fillColor("#4C483E").fontSize(10).text(p.groceryList.map((g) => `• ${g}`).join("\n"), { indent: 12 });
      }

      doc.moveDown(1);
      doc
        .fillColor("#8A857A")
        .fontSize(8)
        .text(
          "This guidance is educational and not medical advice. Consult a qualified healthcare professional for any medical concern.",
        );

      doc.end();
    });
  }

  /** Render a branded one-page Training plan PDF into a Buffer. */
  trainingPlanPdf(
    payload: Record<string, unknown>,
    member: { name?: string } | null,
  ): Promise<Buffer> {
    const parsed = TrainingPlanPayloadSchema.safeParse(payload);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 54 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fillColor("#1A1560").fontSize(22).text("KEYSTONE");
      doc.fillColor("#8A857A").fontSize(10).text("Personalized training week");
      doc.moveDown(0.6);
      doc.fillColor("#100E0A").fontSize(14).text(member?.name ?? "Member");
      doc.moveDown(0.8);

      if (!parsed.success) {
        doc.fillColor("#c22e0e").fontSize(11).text("Plan data unavailable.");
        doc.end();
        return;
      }
      const p = parsed.data;

      doc.fillColor("#12995A").fontSize(12).text(`Protocol: ${p.protocolSlug}  •  ${p.daysPerWeek} days/week`);
      if (p.deload) {
        doc.moveDown(0.2);
        doc.fillColor("#D68C13").fontSize(11).text("⚠ Deload week — recover, don't chase PRs.");
      }
      if (p.eventTargetDate) {
        doc.moveDown(0.2);
        doc.fillColor("#1568D4").fontSize(11).text(`Peaking for: ${p.eventTargetDate}`);
      }
      doc.moveDown(0.6);

      for (const day of p.week) {
        doc
          .fillColor("#100E0A")
          .fontSize(12)
          .text(`${day.day} — ${day.focus} (${day.intensity})`, { underline: true });
        for (const ex of day.exercises) {
          const rpe = ex.targetRpe ? ` @RPE ${ex.targetRpe}` : "";
          doc.fillColor("#4C483E").fontSize(10).text(`• ${ex.name}: ${ex.sets}×${ex.reps}${rpe}`, { indent: 12 });
          if (ex.regression || ex.progression) {
            const notes = [
              ex.regression ? `easier: ${ex.regression}` : null,
              ex.progression ? `harder: ${ex.progression}` : null,
            ]
              .filter(Boolean)
              .join("  ·  ");
            doc.fillColor("#8A857A").fontSize(8).text(notes, { indent: 24 });
          }
        }
        doc.moveDown(0.4);
      }

      doc.moveDown(0.6);
      doc
        .fillColor("#8A857A")
        .fontSize(8)
        .text(
          "This guidance is educational and not medical advice. Stop and consult a professional if you feel pain.",
        );

      doc.end();
    });
  }
}
