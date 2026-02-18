import { test } from "vitest";
import assert from "node:assert/strict";
import {
  applyPostedEntry,
  buildCheckpoint,
  chooseEntriesToPost,
  fingerprintEntry,
  parseState,
  serializeState,
} from "../src/core/bot-core.mjs";

const FEED = [
  {
    id: "a",
    title: "A",
    url: "https://example.com/a",
    publishedAt: "2026-02-15T12:00:00Z",
  },
  {
    id: "b",
    title: "B",
    url: "https://example.com/b",
    publishedAt: "2026-02-15T13:00:00Z",
  },
  {
    id: "c",
    title: "C",
    url: "https://example.com/c",
    publishedAt: "2026-02-15T14:00:00Z",
  },
];

test("chooseEntriesToPost selects only entries after checkpoint", () => {
  const checkpoint = buildCheckpoint(FEED[1]);
  const selected = chooseEntriesToPost({
    entries: FEED,
    checkpoint,
    dedupe: [],
    maxPostsPerRun: 10,
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].entry.id, "c");
});

test("chooseEntriesToPost on first run selects newest maxPostsPerRun entries", () => {
  const selected = chooseEntriesToPost({
    entries: FEED,
    checkpoint: null,
    dedupe: [],
    maxPostsPerRun: 2,
  });

  assert.deepEqual(
    selected.map((item) => item.entry.id),
    ["b", "c"]
  );
});

test("chooseEntriesToPost skips dedupe fingerprints", () => {
  const dedupe = [fingerprintEntry(FEED[0]), fingerprintEntry(FEED[1])];
  const selected = chooseEntriesToPost({
    entries: FEED,
    checkpoint: null,
    dedupe,
    maxPostsPerRun: 10,
  });

  assert.deepEqual(
    selected.map((item) => item.entry.id),
    ["c"]
  );
});

test("applyPostedEntry updates checkpoint and dedupe list", () => {
  let state = { checkpoint: null, dedupe: [] };
  state = applyPostedEntry(state, { entry: FEED[0] }, 5);
  state = applyPostedEntry(state, { entry: FEED[1] }, 5);

  assert.equal(state.checkpoint?.fingerprint, fingerprintEntry(FEED[1]));
  assert.equal(state.dedupe.length, 2);
  assert.deepEqual(state.dedupe, [fingerprintEntry(FEED[1]), fingerprintEntry(FEED[0])]);
});

test("state serialization round-trips", () => {
  const original = {
    checkpoint: buildCheckpoint(FEED[2]),
    dedupe: [fingerprintEntry(FEED[2]), fingerprintEntry(FEED[1])],
  };
  const serialized = serializeState(original, 100);
  const parsed = parseState(serialized);

  assert.deepEqual(parsed, original);
});
