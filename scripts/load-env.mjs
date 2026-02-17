import fs from "node:fs";
import path from "node:path";

/**
 * Load KEY=VALUE pairs into process.env if the file exists.
 * Existing process.env values are preserved.
 *
 * @param {string} envFile
 * @returns {Record<string, string>}
 */
export function loadEnvFile(envFile) {
  const resolvedPath = path.resolve(process.cwd(), envFile || ".env");
  if (!fs.existsSync(resolvedPath)) {
    return {};
  }

  const content = fs.readFileSync(resolvedPath, "utf8");
  /** @type {Record<string, string>} */
  const loaded = {};

  for (const lineRaw of content.split(/\r?\n/u)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIdx = line.indexOf("=");
    if (separatorIdx <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIdx).trim();
    let value = line.slice(separatorIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    loaded[key] = value;
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  return loaded;
}
