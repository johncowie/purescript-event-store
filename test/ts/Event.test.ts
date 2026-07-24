// Exercises EventStore.Event the way a real TypeScript consumer would have
// to. See Clock.test.ts and CLAUDE.md's cross-language-compatibility section
// for context on why this reads as awkwardly as it does.
import { describe, expect, it } from "vitest";

import { clockStaticClock, StaticClock } from "../../output/EventStore.Clock/index.js";
import {
  newEvent,
  newEvent$prime,
  summarise,
  summariseStored,
} from "../../output/EventStore.Event/index.js";
import { Just, Nothing } from "../../output/Data.Maybe/index.js";
import type { StoredEvent } from "../../types/EventStore.Event.js";

describe("EventStore.Event (TypeScript consumer)", () => {
  const fixedInstant = 1690000000000;
  const clock = StaticClock(fixedInstant);

  it("defaults both timestamps to the Clock's current time via newEvent", () => {
    // Explicit type arguments are required here — Name/Payload/Metadata only
    // appear in nested return positions, so TS can't infer them from a
    // single fully-applied curried call the way it would an uncurried
    // function taking one options object.
    const event = newEvent<typeof clock, string, { amount: number }, {}>(clockStaticClock)(clock)(
      "AmountAdded",
    )({ amount: 5 })({})();

    expect(event.observedAt).toBe(fixedInstant);
    expect(event.occurredAt).toBe(fixedInstant);
    expect(event.name).toBe("AmountAdded");
    expect(event.payload).toEqual({ amount: 5 });
  });

  it("back-fills observedAt from an explicit occurredAt via newEvent', using PureScript's Maybe rather than undefined", () => {
    const explicitOccurredAt = 1700000000000;

    const event = newEvent$prime<typeof clock, string, {}, {}>(clockStaticClock)(clock)(
      "AmountAdded",
    )({})({})(
      Nothing.value, // no explicit observedAt
    )(Just.create(explicitOccurredAt))(); // explicit occurredAt

    expect(event.occurredAt).toBe(explicitOccurredAt);
    expect(event.observedAt).toBe(explicitOccurredAt);
  });

  it("summarise excludes payload/metadata from a NewEvent", () => {
    const event = newEvent<typeof clock, string, { amount: number }, { source: string }>(
      clockStaticClock,
    )(clock)("AmountAdded")({ amount: 5 })({ source: "cli" })();

    const summary = summarise(event);

    expect(summary).toEqual({
      name: "AmountAdded",
      observedAt: fixedInstant,
      occurredAt: fixedInstant,
    });
    expect((summary as Record<string, unknown>).payload).toBeUndefined();
    expect((summary as Record<string, unknown>).metadata).toBeUndefined();
  });

  it("summariseStored excludes payload/metadata from a StoredEvent but keeps every other field", () => {
    const storedEvent: StoredEvent<string, { amount: number }, {}> = {
      id: "e5f8c9d0-1234-4abc-8def-0123456789ab",
      name: "AmountAdded",
      payload: { amount: 5 },
      metadata: {},
      stream: "account-123",
      category: "account",
      position: 0,
      sequenceNumber: 0,
      observedAt: fixedInstant,
      occurredAt: fixedInstant,
    };

    const summary = summariseStored(storedEvent);

    expect(summary).toEqual({
      id: storedEvent.id,
      name: storedEvent.name,
      stream: storedEvent.stream,
      category: storedEvent.category,
      position: storedEvent.position,
      sequenceNumber: storedEvent.sequenceNumber,
      observedAt: storedEvent.observedAt,
      occurredAt: storedEvent.occurredAt,
    });
  });
});
