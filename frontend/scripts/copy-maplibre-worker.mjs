import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const target = resolve(root, "public/maplibre-gl-worker.mjs");
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log("Copied MapLibre worker to public/maplibre-gl-worker.mjs");
