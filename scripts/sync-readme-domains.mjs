#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const configPath = path.resolve(process.cwd(), "devvit.json");
const readmePath = path.resolve(process.cwd(), "README.md");
const heading = "## Fetch Domains";

function main() {
  const domains = readConfigDomains();
  const readme = fs.readFileSync(readmePath, "utf8");
  const updated = replaceDomainList(readme, domains);

  if (updated === readme) {
    console.log(`README.md '${heading}' already matches devvit.json (${domains.length} domains).`);
    return;
  }

  fs.writeFileSync(readmePath, updated);
  console.log(`Synced README.md '${heading}' from devvit.json (${domains.length} domains).`);
}

function readConfigDomains() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    fail(`devvit.json is not valid JSON: ${error.message}`);
  }

  const domains = config?.permissions?.http?.domains;
  if (!Array.isArray(domains) || domains.length === 0) {
    fail("devvit.json permissions.http.domains must be a non-empty array.");
  }
  if (domains.some((domain) => typeof domain !== "string")) {
    fail("devvit.json permissions.http.domains must contain only strings.");
  }

  return domains;
}

function replaceDomainList(readme, domains) {
  const lines = readme.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    fail(`README.md is missing its '${heading}' section.`);
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      end = index;
      break;
    }
  }

  const isDomainBullet = (line) => /^- `[^`]+`\s*$/.test(line);
  const first = lines.slice(start, end).findIndex(isDomainBullet);
  if (first === -1) {
    fail(`README.md '${heading}' has no domain bullet list to sync.`);
  }

  const listStart = start + first;
  let listEnd = listStart;
  while (listEnd < end && isDomainBullet(lines[listEnd])) {
    listEnd += 1;
  }

  const bullets = domains.map((domain) => `- \`${domain}\``);
  return [...lines.slice(0, listStart), ...bullets, ...lines.slice(listEnd)].join("\n");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main();
