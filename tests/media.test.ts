import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { imageSize } from "../src/server/media";

const dir = mkdtempSync(join(tmpdir(), "ap-media-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Writes the bytes to a file and measures it. */
function measure(name: string, bytes: number[] | Buffer) {
  const path = join(dir, name);
  writeFileSync(path, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  return imageSize(path);
}

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16be = (n: number) => [(n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

test("a PNG is measured from its header", () => {
  const png = [0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, ...u32be(13), ...ascii("IHDR"), ...u32be(1376), ...u32be(768), 8, 6, 0, 0, 0];
  expect(measure("a.png", png)).toEqual({ width: 1376, height: 768 });
});

test("the app's own pictures measure as ffprobe does", () => {
  expect(imageSize(join(import.meta.dir, "../src/web/art/empty-done.png"))).toEqual({ width: 480, height: 326 });
});

test("a GIF and the three kinds of WebP are measured", () => {
  expect(measure("a.gif", [...ascii("GIF89a"), 0x40, 0x01, 0xf0, 0x00, 0, 0])).toEqual({ width: 320, height: 240 });
  const riff = (chunk: string, body: number[]) => [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii(chunk), 0, 0, 0, 0, ...body, ...new Array(16).fill(0)];
  // VP8: a frame tag, the start code, then 14-bit sizes.
  expect(measure("lossy.webp", riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01]))).toEqual({ width: 640, height: 480 });
  // VP8L: a signature byte, then width-1 and height-1 in 14 bits each.
  const w = 1023, h = 511;
  const bits = w | (h << 14);
  expect(measure("lossless.webp", riff("VP8L", [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255]))).toEqual({ width: 1024, height: 512 });
  // VP8X: flags, then width-1 and height-1 in 24 bits each.
  expect(measure("extended.webp", riff("VP8X", [0, 0, 0, 0, 0x7f, 0x07, 0x00, 0x37, 0x04, 0x00]))).toEqual({ width: 1920, height: 1080 });
});

test("a JPEG is measured past its metadata segments", () => {
  const app1 = [0xff, 0xe1, ...u16be(2 + 3000), ...new Array(3000).fill(0)];
  const sof2 = [0xff, 0xc2, ...u16be(17), 8, ...u16be(1080), ...u16be(1920), 3, ...new Array(9).fill(0)];
  expect(measure("a.jpg", [0xff, 0xd8, ...app1, ...sof2])).toEqual({ width: 1920, height: 1080 });
});

test("an AVIF takes its largest image, past a smaller one such as a thumbnail", () => {
  const box = (w: number, h: number) => [...u32be(20), ...ascii("ispe"), 0, 0, 0, 0, ...u32be(w), ...u32be(h)];
  const avif = [...u32be(28), ...ascii("ftyp"), ...ascii("avif"), 0, 0, 0, 0, ...ascii("mif1avif"), ...box(320, 180), ...box(2048, 1152)];
  expect(measure("a.avif", avif)).toEqual({ width: 2048, height: 1152 });
});

test("anything else, or a damaged file, is left to ffprobe", () => {
  expect(measure("a.svg", ascii('<svg width="10" height="10"/>'))).toBeNull();
  expect(measure("broken.png", [0x89, ...ascii("PNG")])).toBeNull();
  expect(measure("cut.jpg", [0xff, 0xd8, 0xff, 0xe1, 0x10, 0x00])).toBeNull();
  expect(imageSize(join(dir, "missing.png"))).toBeNull();
});
