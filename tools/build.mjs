#!/usr/bin/env node

// Bundles the Devvit Web server entry to a single CommonJS file.
//
//   node tools/build.mjs [--watch]
//
// Devvit Web requires the server bundle to be CommonJS (ESM output is not
// supported by the runtime). devvit.json points `server.entry` at the output.

import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const serverOpts = {
  bundle: true,
  logLevel: "info",
  sourcemap: "linked",
  entryPoints: ["src/server/index.js"],
  outfile: "dist/server/index.cjs",
  format: "cjs",
  platform: "node",
  target: "node22",
};

if (watch) {
  const ctx = await esbuild.context(serverOpts);
  await ctx.watch();
} else {
  await esbuild.build(serverOpts);
}
