import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import assert from "node:assert/strict";

const configPath = path.resolve(process.cwd(), "devvit.json");
const readmePath = path.resolve(process.cwd(), "README.md");

function readConfig() {
  const raw = fs.readFileSync(configPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    assert.fail(`devvit.json is not valid JSON: ${error.message}`);
  }
}

function readReadmeFetchDomains() {
  const lines = fs.readFileSync(readmePath, "utf8").split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Fetch Domains");
  assert.notEqual(start, -1, "README.md is missing its '## Fetch Domains' section");

  const domains = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) {
      break;
    }
    const match = /^- `([^`]+)`\s*$/.exec(line);
    if (match) {
      domains.push(match[1]);
    }
  }

  assert.ok(domains.length > 0, "README.md '## Fetch Domains' lists no domains");
  return domains;
}

test("devvit.json is valid JSON with a usable fetch domain list", () => {
  const config = readConfig();
  const domains = config?.permissions?.http?.domains;

  assert.ok(Array.isArray(domains), "devvit.json permissions.http.domains must be an array");
  assert.ok(domains.length > 0, "devvit.json permissions.http.domains must not be empty");
  for (const domain of domains) {
    assert.equal(typeof domain, "string", `devvit.json fetch domain is not a string: ${JSON.stringify(domain)}`);
    assert.doesNotMatch(domain, /^[a-z]+:\/\//i, `devvit.json fetch domain must be a bare hostname: ${domain}`);
  }
  assert.equal(
    new Set(domains).size,
    domains.length,
    "devvit.json permissions.http.domains contains duplicates",
  );
});

test("README Fetch Domains list stays in sync with devvit.json", () => {
  const configDomains = readConfig().permissions.http.domains;
  const readmeDomains = readReadmeFetchDomains();

  const missingFromReadme = configDomains.filter((domain) => !readmeDomains.includes(domain));
  const missingFromConfig = readmeDomains.filter((domain) => !configDomains.includes(domain));

  const details = [
    "README.md '## Fetch Domains' is out of sync with devvit.json permissions.http.domains.",
    missingFromReadme.length ? `Missing from README.md: ${missingFromReadme.join(", ")}` : "",
    missingFromConfig.length ? `Missing from devvit.json: ${missingFromConfig.join(", ")}` : "",
    "Fix: edit devvit.json (the source of truth), then run `npm run sync:readme`.",
  ]
    .filter(Boolean)
    .join("\n");

  assert.deepEqual(readmeDomains, configDomains, details);
});
