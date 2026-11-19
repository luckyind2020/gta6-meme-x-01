// gta6-meme-x-01 entry program (Node 22, standard library only).
//
// What it does, in order:
//   1. Hands in POST.json: copies it byte-for-byte from the repository root
//      to the output directory, where the gate reads the X post's address.
//      The post itself is the entry; the house reads its first picture and
//      its text from X and hands them to the judge.
//   2. Rebuilds the meme picture deterministically from the bundled assets:
//      the Vice City scene (assets/base.png), the real make.fun ghost mark
//      (assets/ghost.png, from the press kit), and a block-letter caption
//      drawn from an embedded 5x7 bitmap font. No network, no clock, no
//      files outside the repository, so two runs write identical bytes.
//
// The joke: waited thirteen years for GTA 6 — while the agent already got
// paid on make.fun. Top caption sets up the wait, the ghost cruises Vice
// City in the scene, bottom caption delivers the punchline.

import { inflateSync, deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------

function envDir(name: string, fallback: string): string {
  const v = process.env[name];
  return v !== undefined && v !== "" ? v : fallback;
}

function crc32(buf: Buffer): number {
  let table = (crc32 as unknown as { t?: Int32Array }).t;
  if (table === undefined) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as unknown as { t: Int32Array }).t = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(kind: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(kind, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(kind, "ascii"), payload])), 0);
  return Buffer.concat([head, payload, tail]);
}

// ---------------------------------------------------------------------------
// PNG decode (8-bit, non-interlaced; colour types 0, 2, 3, 4, 6)
// ---------------------------------------------------------------------------

type Picture = { width: number; height: number; rgba: Buffer };

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function decodePng(raw: Buffer): Picture {
  if (raw.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("not a PNG file");
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  while (pos < raw.length) {
    const size = raw.readUInt32BE(pos);
    const kind = raw.toString("ascii", pos + 4, pos + 8);
    const body = raw.subarray(pos + 8, pos + 8 + size);
    if (kind === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (kind === "PLTE") {
      palette = Buffer.from(body);
    } else if (kind === "tRNS") {
      trns = Buffer.from(body);
    } else if (kind === "IDAT") {
      idat.push(Buffer.from(body));
    } else if (kind === "IEND") {
      break;
    }
    pos += 12 + size;
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  if (interlace !== 0) throw new Error("interlaced PNG not supported");
  const channels = colour === 0 ? 1 : colour === 2 ? 3 : colour === 3 ? 1 : colour === 4 ? 2 : colour === 6 ? 4 : 0;
  if (channels === 0) throw new Error(`unsupported colour type ${colour}`);
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  // --- unfilter pass: rebuild raw scanlines from the filtered stream ---
  const rawRows = Buffer.alloc(width * height * channels);
  {
    let p = 0;
    for (let y = 0; y < height; y++) {
      const f = inflated[p++];
      const rowStart = p;
      for (let i = 0; i < stride; i++) {
        const v = inflated[p++];
        const a = i >= channels ? rawRows[y * stride + i - channels] : 0;
        const b = y === 0 ? 0 : rawRows[(y - 1) * stride + i];
        const c = i >= channels && y !== 0 ? rawRows[(y - 1) * stride + i - channels] : 0;
        let rec = v;
        if (f === 1) rec = v + a;
        else if (f === 2) rec = v + b;
        else if (f === 3) rec = v + ((a + b) >> 1);
        else if (f === 4) rec = v + paeth(a, b, c);
        rawRows[y * stride + i] = rec & 0xff;
      }
      void rowStart;
    }
  }
  for (let px = 0; px < width * height; px++) {
    const o = px * 4;
    const s = px * channels;
    if (colour === 0) {
      const g = rawRows[s];
      rgba[o] = g;
      rgba[o + 1] = g;
      rgba[o + 2] = g;
      rgba[o + 3] = 255;
    } else if (colour === 2) {
      rgba[o] = rawRows[s];
      rgba[o + 1] = rawRows[s + 1];
      rgba[o + 2] = rawRows[s + 2];
      rgba[o + 3] = 255;
    } else if (colour === 3) {
      const idx = rawRows[s] * 3;
      rgba[o] = palette![idx];
      rgba[o + 1] = palette![idx + 1];
      rgba[o + 2] = palette![idx + 2];
      rgba[o + 3] = trns !== null && rawRows[s] < trns.length ? trns[rawRows[s]] : 255;
    } else if (colour === 4) {
      const g = rawRows[s];
      rgba[o] = g;
      rgba[o + 1] = g;
      rgba[o + 2] = g;
      rgba[o + 3] = rawRows[s + 1];
    } else {
      rgba[o] = rawRows[s];
      rgba[o + 1] = rawRows[s + 1];
      rgba[o + 2] = rawRows[s + 2];
      rgba[o + 3] = rawRows[s + 3];
    }
  }
  return { width, height, rgba };
}

function encodePng(pic: Picture): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(pic.width, 0);
  ihdr.writeUInt32BE(pic.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scan = Buffer.alloc((pic.width * 4 + 1) * pic.height);
  for (let y = 0; y < pic.height; y++) {
    const dst = y * (pic.width * 4 + 1);
    scan[dst] = 0;
    pic.rgba.copy(scan, dst + 1, y * pic.width * 4, (y + 1) * pic.width * 4);
  }
  const idat = deflateSync(scan, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// image ops: area-average downscale + alpha paste
// ---------------------------------------------------------------------------

function shrink(pic: Picture, target: number): Picture {
  const scale = pic.width / target;
  const out: Picture = { width: target, height: Math.round(pic.height / scale), rgba: Buffer.alloc(target * Math.round(pic.height / scale) * 4) };
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.min(pic.width, Math.ceil((x + 1) * scale));
      const y0 = Math.floor(y * scale);
      const y1 = Math.min(pic.height, Math.ceil((y + 1) * scale));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const o = (sy * pic.width + sx) * 4;
          r += pic.rgba[o];
          g += pic.rgba[o + 1];
          b += pic.rgba[o + 2];
          a += pic.rgba[o + 3];
          n++;
        }
      }
      const o = (y * out.width + x) * 4;
      out.rgba[o] = Math.round(r / n);
      out.rgba[o + 1] = Math.round(g / n);
      out.rgba[o + 2] = Math.round(b / n);
      out.rgba[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

function stamp(base: Picture, mark: Picture, dx: number, dy: number): void {
  for (let y = 0; y < mark.height; y++) {
    const by = dy + y;
    if (by < 0 || by >= base.height) continue;
    for (let x = 0; x < mark.width; x++) {
      const bx = dx + x;
      if (bx < 0 || bx >= base.width) continue;
      const so = (y * mark.width + x) * 4;
      const alpha = mark.rgba[so + 3] / 255;
      if (alpha === 0) continue;
      const bo = (by * base.width + bx) * 4;
      for (let c = 0; c < 3; c++) {
        base.rgba[bo + c] = Math.round(mark.rgba[so + c] * alpha + base.rgba[bo + c] * (1 - alpha));
      }
      base.rgba[bo + 3] = 255;
    }
  }
}

// ---------------------------------------------------------------------------
// block-letter caption font (5x7 glyphs, '#' = ink)
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
};

function lineWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function paintLine(pic: Picture, text: string, centreX: number, top: number, scale: number): void {
  const w = lineWidth(text, scale);
  let x = Math.round(centreX - w / 2);
  const outline = Math.max(2, Math.round(scale / 2));
  const passes: Array<[number, number, number, number, number]> = [];
  for (let k = 0; k < 8; k++) {
    const ang = (k * Math.PI) / 4;
    passes.push([Math.round(Math.cos(ang) * outline), Math.round(Math.sin(ang) * outline), 18, 16, 24]);
  }
  passes.push([0, 0, 255, 255, 255]);
  for (const [ox, oy, r, g, b] of passes) {
    let cx = x;
    for (const ch of text) {
      const glyph = GLYPHS[ch] ?? GLYPHS[" "];
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy][gx] !== "#") continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cx + ox + gx * scale + sx;
              const py = top + oy + gy * scale + sy;
              if (px < 0 || px >= pic.width || py < 0 || py >= pic.height) continue;
              const o = (py * pic.width + px) * 4;
              pic.rgba[o] = r;
              pic.rgba[o + 1] = g;
              pic.rgba[o + 2] = b;
              pic.rgba[o + 3] = 255;
            }
          }
        }
      }
      cx += 6 * scale;
    }
  }
}

// ---------------------------------------------------------------------------
// the meme
// ---------------------------------------------------------------------------

const TOP_LINES = ["WAITED 13 YEARS", "FOR GTA 6"];
const BOTTOM_LINES = ["MY AGENT ALREADY", "GOT PAID ON MAKE.FUN"];

function buildMeme(repoRoot: string): Buffer {
  const scene = decodePng(readFileSync(join(repoRoot, "assets", "base.png")));
  const ghost = decodePng(readFileSync(join(repoRoot, "assets", "ghost.png")));
  const side = scene.width;
  const mid = side / 2;
  // Top caption over the sky.
  paintLine(scene, TOP_LINES[0], mid, Math.round(side * 0.034), 13);
  paintLine(scene, TOP_LINES[1], mid, Math.round(side * 0.1), 13);
  // The ghost cruises the open road, left of the convertible.
  const mark = shrink(ghost, Math.round(side * 0.2375));
  stamp(scene, mark, Math.round(side * 0.3), Math.round(side * 0.594));
  // Bottom caption over the road.
  paintLine(scene, BOTTOM_LINES[0], mid, Math.round(side * 0.875), 11);
  paintLine(scene, BOTTOM_LINES[1], mid, Math.round(side * 0.931), 11);
  return encodePng(scene);
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

function main(): void {
  const repoRoot = envDir("MAKEFUN_BOT_DIR", "/bot");
  const outRoot = envDir("MAKEFUN_OUTPUT_DIR", "/output");
  mkdirSync(outRoot, { recursive: true });
  // 1. Hand in the post: copy POST.json verbatim for the gate.
  const postBytes = readFileSync(join(repoRoot, "POST.json"));
  writeFileSync(join(outRoot, "POST.json"), postBytes);
  // 2. Rebuild the meme picture. A failure here must never sink the entry:
  //    the post on X is what the judge reads, so warn and carry on.
  try {
    writeFileSync(join(outRoot, "meme.png"), buildMeme(repoRoot));
  } catch (err) {
    console.error(`meme rebuild skipped: ${(err as Error).message}`);
  }
}

main();
