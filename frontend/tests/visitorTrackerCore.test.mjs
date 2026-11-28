import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_QUEUE,
  buildEventPayload,
  createUuid,
  dedupeKey,
  formatDuration,
  isConsentAllowed,
  isDuplicate,
  isUuid,
  normalizeConsent,
  normalizePage,
  parseQueue,
  routeToPath,
  toId,
  trimQueue
} from "../src/services/visitorTrackerCore.js";

test("createUuid returns unique RFC4122 v4 values", () => {
  const first = createUuid();
  const second = createUuid();
  assert.equal(isUuid(first), true);
  assert.equal(isUuid(second), true);
  assert.notEqual(first, second);
});

test("consent defaults to enabled and only explicit refusal disables", () => {
  assert.equal(isConsentAllowed(null), true);
  assert.equal(isConsentAllowed(undefined), true);
  assert.equal(isConsentAllowed("1"), true);
  assert.equal(isConsentAllowed("0"), false);
  assert.equal(isConsentAllowed(false), false);
  assert.equal(normalizeConsent(false), "0");
  assert.equal(normalizeConsent(true), "1");
});

test("normalizePage strips origin and keeps path with query", () => {
  assert.equal(normalizePage("https://shop.example.com/catalog?category=bed"), "/catalog?category=bed");
  assert.equal(normalizePage("catalog"), "/catalog");
  assert.equal(normalizePage(""), "/");
  assert.equal(normalizePage("x".repeat(900)).length, 500);
});

test("routeToPath maps SPA routes to stable URLs", () => {
  assert.equal(routeToPath({ page: "home" }), "/home");
  assert.equal(routeToPath({ page: "catalog", category: "bed" }), "/catalog?category=bed");
  assert.equal(routeToPath({ page: "catalog", category: "" }), "/catalog");
  assert.equal(routeToPath({ page: "product", slug: "soft sheet" }), "/product/soft%20sheet");
});

test("isDuplicate respects TTL and allows repeated events later", () => {
  const map = new Map();
  const key = dedupeKey("page_view", "/catalog");

  assert.equal(isDuplicate(map, key, 1000, 2000), false);
  assert.equal(isDuplicate(map, key, 1500, 2000), true);
  assert.equal(isDuplicate(map, key, 4000, 2000), false);
});

test("trimQueue keeps the newest events", () => {
  const queue = Array.from({ length: MAX_QUEUE + 10 }, (_, index) => index);
  const trimmed = trimQueue(queue);
  assert.equal(trimmed.length, MAX_QUEUE);
  assert.equal(trimmed[0], 10);
  assert.equal(trimmed.at(-1), MAX_QUEUE + 9);
});

test("parseQueue tolerates broken storage", () => {
  assert.deepEqual(parseQueue("not json"), []);
  assert.deepEqual(parseQueue("null"), []);
  assert.deepEqual(parseQueue('[{"a":1}]'), [{ a: 1 }]);
});

test("buildEventPayload drops empty ids and normalizes page", () => {
  const payload = buildEventPayload({
    visitorUuid: "11111111-1111-4111-8111-111111111111",
    sessionUuid: "22222222-2222-4222-8222-222222222222",
    eventType: "product_view",
    eventUuid: "33333333-3333-4333-8333-333333333333",
    pageUrl: "https://shop.example.com/product/x",
    productId: "0",
    categoryId: 7,
    eventData: { slug: "x" }
  });

  assert.equal(payload.page_url, "/product/x");
  assert.equal("product_id" in payload, false);
  assert.equal(payload.category_id, 7);
  assert.deepEqual(payload.event_data, { slug: "x" });
});

test("toId accepts only positive numbers", () => {
  assert.equal(toId("12"), 12);
  assert.equal(toId(3.9), 3);
  assert.equal(toId(0), null);
  assert.equal(toId("abc"), null);
  assert.equal(toId(null), null);
});

test("formatDuration renders compact human values", () => {
  assert.equal(formatDuration(0), "0с");
  assert.equal(formatDuration(45), "45с");
  assert.equal(formatDuration(200), "3м 20с");
  assert.equal(formatDuration(3900), "1ч 05м");
});
