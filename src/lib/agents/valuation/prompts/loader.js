// Spec §8.1 + §5.1: "All LLM prompts stored in .txt files under llm/prompts/.
// Loaded at runtime. No prompts hardcoded."
//
// This loader reads the .txt files that live in this directory and does
// simple {{var}} interpolation. Files are cached on first read (server-side
// process lifetime) so we don't re-read from disk on every pipeline run.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const cache = new Map();

function readTemplate(name) {
  if (cache.has(name)) return cache.get(name);
  const path = join(HERE, `${name}.txt`);
  const text = readFileSync(path, "utf8");
  cache.set(name, text);
  return text;
}

export function loadPrompt(name, vars = {}) {
  const tmpl = readTemplate(name);
  return tmpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    if (v == null) return "";
    return String(v);
  });
}
