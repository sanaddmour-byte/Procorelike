import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createDbClient } from "@siteops/db";
import { deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { loadEnv } from "../env";
import { createS3Client } from "../lib/s3";

/**
 * Puts real sample files behind the `demo/*` attachments that
 * packages/db/src/seed-demo-content.ts creates, so the document/drawing viewers and photo
 * grids have something to display. Also repairs databases seeded by the earlier version of
 * that script, which pointed every document/drawing/photo at one attachment with the
 * unrecognised owner type `demo_placeholder` (the download route rejects it with a 400).
 *
 * Idempotent. Needs DATABASE_URL and the same S3_* variables the API uses.
 */

async function samplePdf(title: string, sub: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 20, y: 20, width: 802, height: 555, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 2 });
  page.drawRectangle({ x: 600, y: 20, width: 222, height: 90, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 1 });
  page.drawText(title, { x: 616, y: 78, size: 16, font: bold });
  page.drawText(sub, { x: 616, y: 56, size: 10, font });
  page.drawText("SAMPLE - DEMO DATA", { x: 616, y: 34, size: 9, font, color: rgb(0.7, 0.1, 0.1) });
  // A simple floor-plan-ish drawing so zoom/markup has something to look at.
  page.drawRectangle({ x: 80, y: 160, width: 440, height: 340, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 3 });
  for (const x of [220, 360]) page.drawLine({ start: { x, y: 160 }, end: { x, y: 500 }, thickness: 2, color: rgb(0.2, 0.2, 0.2) });
  page.drawLine({ start: { x: 80, y: 330 }, end: { x: 520, y: 330 }, thickness: 2, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("LEVEL 1 - GENERAL ARRANGEMENT", { x: 80, y: 515, size: 14, font: bold });
  return doc.save();
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 640x480 diagonal-stripe PNG, standing in for a site photo. */
function samplePng(): Buffer {
  const w = 640;
  const h = 480;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x += 1) {
      const stripe = Math.floor((x + y) / 40) % 2 === 0;
      const o = row + 1 + x * 3;
      raw[o] = stripe ? 250 : 40;
      raw[o + 1] = stripe ? 190 : 40;
      raw[o + 2] = stripe ? 20 : 40;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const { queryClient: sql } = createDbClient(env.DATABASE_URL);
  const s3 = createS3Client(env);

  // Repair rows from the earlier seed: split the shared `demo_placeholder` attachment into one per module.
  const legacy = await sql`select id, project_id, uploaded_by from attachments where owner_type = 'demo_placeholder'`;
  for (const old of legacy) {
    const mk = async (ownerType: string, key: string, filename: string, mime: string): Promise<string> => {
      const [row] = await sql`
        insert into attachments (owner_type, owner_id, project_id, storage_key, filename, mime, size, uploaded_by)
        values (${ownerType}, ${old.project_id}, ${old.project_id}, ${key}, ${filename}, ${mime}, 1024, ${old.uploaded_by})
        returning id`;
      return row?.id as string;
    };
    const docId = await mk("document", "demo/sample-document.pdf", "sample-document.pdf", "application/pdf");
    const drawId = await mk("drawing_revision", "demo/sample-drawing.pdf", "sample-drawing.pdf", "application/pdf");
    const photoId = await mk("photo", "demo/sample-photo.png", "sample-photo.png", "image/png");
    await sql`update documents set current_attachment_id = ${docId} where current_attachment_id = ${old.id}`;
    await sql`update drawing_revisions set attachment_id = ${drawId} where attachment_id = ${old.id}`;
    await sql`update photos set attachment_id = ${photoId} where attachment_id = ${old.id}`;
    await sql`delete from attachments where id = ${old.id}`;
    console.warn(`Repaired legacy demo_placeholder attachment ${String(old.id)}`);
  }

  const put = async (key: string, body: Uint8Array | Buffer, type: string): Promise<void> => {
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: type }));
    console.warn(`Uploaded ${key} (${body.length} bytes) to ${env.S3_BUCKET} @ ${env.S3_ENDPOINT}`);
  };
  await put("demo/sample-document.pdf", await samplePdf("Sample document", "Demo data"), "application/pdf");
  await put("demo/sample-drawing.pdf", await samplePdf("A-101 Level 1 Floor Plan", "Rev 2 - demo data"), "application/pdf");
  await put("demo/sample-photo.png", samplePng(), "image/png");

  await sql.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
