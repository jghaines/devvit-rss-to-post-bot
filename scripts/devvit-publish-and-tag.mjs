#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

async function main() {
  ensureCleanWorktree();

  const commit = runCommand("git", ["rev-parse", "HEAD"]).stdout.trim();
  const publishArgs = resolvePublishArgs(process.argv.slice(2));
  const upload = await runStreamingCommand("npx", ["devvit", "publish", ...publishArgs]);

  if (upload.code !== 0) {
    process.exit(upload.code ?? 1);
  }

  const version = extractVersion(upload.output);
  if (!version) {
    console.error("Could not determine Devvit version from CLI output.");
    console.error("Upload may have succeeded; create the git tag manually using the printed version.");
    process.exit(1);
  }

  const tag = `devvit/prod/v${version}`;
  const existing = runCommand("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
    allowFailure: true,
  });

  if (existing.code === 0) {
    const existingCommit = runCommand("git", ["rev-list", "-n", "1", `refs/tags/${tag}`]).stdout.trim();
    if (existingCommit === commit) {
      console.log(`Tag ${tag} already exists at ${commit.slice(0, 12)}.`);
      return;
    }
    console.error(`Tag ${tag} already exists at ${existingCommit.slice(0, 12)}.`);
    process.exit(1);
  }

  runCommand("git", ["tag", "-a", tag, "-m", `Devvit prod deployment ${version}`, "-m", `Commit: ${commit}`]);
  runCommand("git", ["push", "origin", `refs/tags/${tag}`]);

  console.log(`Created and pushed ${tag}`);
}

function resolvePublishArgs(args) {
  const publishArgs = args.filter((arg) => arg !== "--no-public");
  if (args.includes("--no-public")) {
    return publishArgs.filter((arg) => arg !== "--public");
  }
  return publishArgs.includes("--public") ? publishArgs : [...publishArgs, "--public"];
}

function ensureCleanWorktree() {
  const status = runCommand("git", ["status", "--porcelain"], { allowFailure: true });
  if (status.code !== 0) {
    console.error("Could not determine git status.");
    process.exit(status.code ?? 1);
  }
  if (status.stdout.trim()) {
    console.error("Working tree is not clean. Commit or stash changes before publishing.");
    process.exit(1);
  }
}

function extractVersion(output) {
  const patterns = [
    /Uploading new version "?([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)"?/gi,
    /(?:uploaded|uploading|published|version)[^0-9]*([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)/gi,
  ];

  for (const pattern of patterns) {
    const matches = [...output.matchAll(pattern)];
    if (matches.length > 0) {
      return matches[matches.length - 1][1];
    }
  }

  return "";
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (!options.allowFailure && result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  return {
    code: result.status ?? 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function runStreamingCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
