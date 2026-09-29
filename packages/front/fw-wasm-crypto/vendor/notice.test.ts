// vendor/notice.test.ts
// Byte-free sync check: asserts vendor/NOTICE stays in sync with
// PROVENANCE.json + per-tree NOTICE-<id> files.
// No compile, no wasm, no network.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VENDOR_DIR = join(import.meta.dir);
const PROVENANCE_PATH = join(VENDOR_DIR, "PROVENANCE.json");
const NOTICE_PATH = join(VENDOR_DIR, "NOTICE");

interface ProvenanceTree {
  id: string;
  url: string;
  ref: string;
  sha256: string;
  license: string;
  notice: string;
}

interface Provenance {
  version: number;
  trees: ProvenanceTree[];
}

const provenance: Provenance = JSON.parse(readFileSync(PROVENANCE_PATH, "utf8"));
const notice = readFileSync(NOTICE_PATH, "utf8");
const trees = provenance.trees;

describe("vendor/NOTICE — sync with PROVENANCE.json", () => {
  it("has exactly the same number of sections as PROVENANCE trees[]", () => {
    const sectionPattern = /^={80}$/gm;
    const matches = notice.match(sectionPattern);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(trees.length);
  });

  it("contains a section header line for each tree id with its license", () => {
    for (const tree of trees) {
      const expectedLine = `${tree.id} — ${tree.license}`;
      expect(notice).toContain(expectedLine);
    }
  });

  it("section header order matches trees[] order (find-index monotonic)", () => {
    let lastIndex = -1;
    for (const tree of trees) {
      const headerLine = `${tree.id} — ${tree.license}`;
      const idx = notice.indexOf(headerLine);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("contains the sha256 of each tree in its section", () => {
    for (const tree of trees) {
      // Find the section start for this tree
      const headerLine = `${tree.id} — ${tree.license}`;
      const sectionStart = notice.indexOf(headerLine);
      expect(sectionStart).toBeGreaterThan(-1);

      // Find end of section (next ===... divider or end of file)
      const divider = "=".repeat(80);
      const nextSection = notice.indexOf(divider, sectionStart + headerLine.length);
      const sectionEnd = nextSection === -1 ? notice.length : nextSection;
      const sectionText = notice.slice(sectionStart, sectionEnd);

      expect(sectionText).toContain(tree.sha256);
    }
  });

  it("contains the ref of each tree in its section", () => {
    for (const tree of trees) {
      const headerLine = `${tree.id} — ${tree.license}`;
      const sectionStart = notice.indexOf(headerLine);
      expect(sectionStart).toBeGreaterThan(-1);

      const divider = "=".repeat(80);
      const nextSection = notice.indexOf(divider, sectionStart + headerLine.length);
      const sectionEnd = nextSection === -1 ? notice.length : nextSection;
      const sectionText = notice.slice(sectionStart, sectionEnd);

      expect(sectionText).toContain(tree.ref);
    }
  });

  it("embeds the full NOTICE-<id> body verbatim for each tree", () => {
    // Normalise line endings so the test is portable across Windows / Unix checkouts.
    const noticeNorm = notice.replace(/\r\n/g, "\n");
    for (const tree of trees) {
      const noticeFilePath = join(VENDOR_DIR, `NOTICE-${tree.id}`);
      const perTreeBody = readFileSync(noticeFilePath, "utf8").replace(/\r\n/g, "\n");
      expect(noticeNorm).toContain(perTreeBody);
    }
  });

  it("references no tree id absent from trees[]", () => {
    // Extract all section header ids from NOTICE (lines after ===...=== separators)
    const divider = "=".repeat(80);
    const knownIds = new Set(trees.map((t) => t.id));
    const lines = notice.split("\n");
    const validIds: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === divider) {
        // The next non-empty line should be the section header
        for (let j = i + 1; j < lines.length; j++) {
          const candidate = lines[j].trim();
          if (candidate.length === 0) continue;
          // Extract the id (portion before " — ")
          const dashIdx = candidate.indexOf(" — ");
          if (dashIdx !== -1) {
            const extractedId = candidate.slice(0, dashIdx);
            validIds.push(extractedId);
            expect(knownIds.has(extractedId)).toBe(true);
          }
          break;
        }
      }
    }

    // Confirm we found exactly as many ids as trees
    expect(validIds.length).toBe(trees.length);
  });
});
