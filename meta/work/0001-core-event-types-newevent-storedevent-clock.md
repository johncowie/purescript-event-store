---
type: work-item
id: "0001"
title: "Core event types: NewEvent, StoredEvent, and injectable Clock"
date: "2026-07-23T21:06:20+00:00"
author: John Cowie Del Corral
producer: create-work-item
status: draft
kind: story
priority: medium
tags: [event-store, purescript-port, phase-1, core-types]
last_updated: "2026-07-23T21:29:56+00:00"
last_updated_by: John Cowie Del Corral
schema_version: 1
---

# 0001: Core event types: NewEvent, StoredEvent, and injectable Clock

**Kind**: Story
**Status**: Draft
**Priority**: Medium
**Author**: John Cowie Del Corral

## Summary

As a library consumer building an event-sourced application on this store, I want core event value types — an unsent `NewEvent` and a persisted `StoredEvent`, both with bi-temporal timestamps and generic payload/metadata — plus an injectable `Clock` typeclass, so that I can construct and reason about events with type-safe payloads and deterministic, testable timestamps.

This is the foundational data-model item for the PureScript port of `logicblocks.event.store` (see Reference below): the event store, adapters, and everything downstream depend on these two types existing first.

## Context

The Python original (`logicblocks.event.types.event`) distinguishes `NewEvent[Name, Payload, Metadata]` (not yet persisted, with defaultable bi-temporal timestamps) from `StoredEvent[Name, Payload, Metadata]` (fully specified, produced only by the store — adds `id`, `stream`, `category`, `position`, `sequence_number`). Both are immutable and support a full `serialise()` and a payload/metadata-stripped `summarise()` for safe logging.

An existing PureScript spike, `purescript-johncowie-events` (at `/Users/john/Projects/johncowie/proto/lib/purescript-johncowie-events`), was investigated as a possible base to build on. It was found to be a 63-line skeleton with a bare `EventStore` record and toy example types — no identifiers, timestamps, serialisation, or clock abstraction, and no tests. It is not worth depending on or extending; this item builds the types fresh in the new `event-store` project. Retiring/archiving the spike, if desired, is a separate housekeeping action outside this item's scope.

## Requirements

- `NewEvent name payload metadata` — generic over name, payload, and metadata types (all defaulting to a JSON value type, to be defined by a later JSON-conversion-framework item). Timestamps `observedAt`/`occurredAt` default via an injectable `Clock` typeclass when not explicitly supplied: `observedAt` defaults to `Clock`'s current time; `occurredAt` defaults to `observedAt` if not given.
- `StoredEvent name payload metadata` — adds `id` (UUID, via `purescript-uuid`), `stream`, `category` (plain string/identifier values for now — full identifier types are a separate roadmap item), `position` (0-based, per-stream, non-negative integer), `sequenceNumber` (global, monotonic, cross-stream, non-negative integer). No default-filling constructor — all fields must be fully specified, since only the store produces these.
- Both types support `serialise` (full record) and `summarise` (all fields except payload/metadata) conversions. The concrete output shape of these conversions may be a plain record for now, pending the JSON-conversion-framework item.
- `Clock` — a typeclass (not an explicit threaded value or effect row) with at least two instances/implementations: a real-time `SystemClock` and a fixed, settable `StaticClock` for deterministic tests.
- Both `NewEvent` and `StoredEvent` derive structural equality (`Eq`) and are immutable (standard PureScript record semantics — no mutation-shaped API).

## Acceptance Criteria

- Given no `occurredAt`/`observedAt` supplied, when a `NewEvent` is constructed via the standard constructor under a `Clock` instance, then both timestamps equal that Clock's current time.
- Given an explicit `occurredAt` but no `observedAt`, when a `NewEvent` is constructed, then `observedAt` defaults to `occurredAt`.
- Given both `occurredAt` and `observedAt` supplied explicitly, when a `NewEvent` is constructed, then both are used as given (no defaulting occurs).
- Given a `StaticClock` instance fixed to a known instant, when used to construct a `NewEvent` in a test, then the resulting timestamps are deterministic and assertable.
- Given a `StoredEvent`, when `summarise` is called, then the result excludes `payload` and `metadata` but retains `id`, `stream`, `category`, `position`, `sequenceNumber`, and both timestamps.
- Given two `NewEvent` (or `StoredEvent`) values with identical field values, when compared with `==`, then they are equal; given any differing field, they are not equal.
- Given a `StoredEvent`, when its `id` field is inspected, then it is a `purescript-uuid` `UUID` value, not a bare string.

## Open Questions

None outstanding — Clock-as-typeclass and UUID library choice were resolved during drafting (see Drafting Notes).

## Dependencies

- Blocked by: none (this is the first Phase 1 item).
- Blocks: event source identifiers, the JSON conversion framework, and the `EventStore`/adapter items — all downstream Phase 1 work depends on these types existing.

## Assumptions

- `position` and `sequenceNumber` are non-negative integers (`Int`-based), matching the Python original's unconstrained `int` usage — no explicit bounded/`BigInt` type is assumed necessary at this stage.

## Technical Notes

- Use `purescript-uuid` for `StoredEvent.id`.
- Clock is modelled as a typeclass, resolved by instance rather than passed as an explicit argument or effect row — this shapes how every later constructor that needs "now" (event publishing, checkpoint state, etc.) will be written, so worth locking in here.
- `stream`/`category` fields on `StoredEvent` are plain values in this item; they'll likely be narrowed to proper identifier types once the event-source-identifiers item lands — don't over-invest in their shape here.
- Payload/metadata JSON-value defaulting is a forward reference to the not-yet-built JSON conversion framework item; this item should not block on that framework existing, just leave the type parameter open with a placeholder default if needed.
- Cross-language compatibility (see `CLAUDE.md`, added after this item was originally drafted): `Clock` as a typeclass is PureScript-idiomatic but not directly callable from TypeScript/JS — a TS caller can't provide a typeclass instance. This item's internal PureScript implementation should stay typeclass-based as decided, but implementation should not assume the typeclass itself is the TS/JS-facing surface; a plain-value/constructor-based wrapper around `SystemClock`/`StaticClock` (e.g. exposing constructor functions rather than the class) will likely be needed once the bindings boundary is designed. This doesn't block or change this item's scope — noted here so it isn't lost before implementation starts.

## Drafting Notes

- Payload/metadata generality preserved as type parameters (not JSON-only), per explicit decision — matches the Python `NewEvent[Name, Payload, Metadata]` design.
- Clock bundled into this item rather than split out, since `NewEvent`'s timestamp defaulting is meaningless without it.
- Clock modelled as a typeclass (not an explicit value/effect row) — explicit decision, shapes downstream ergonomics.
- UUID library choice: `purescript-uuid` — explicit decision.
- `purescript-johncowie-events` investigated and rejected as a base to build on (skeleton only, no substantive reusable code) — treated as a naming-convention reference at most.
- Treating "library consumer" (a developer building an event-sourced app) as the story's stakeholder, not an end-user of any downstream application.

## References

- Source: `meta/roadmap/2026-07-23-event-store-purescript-port-roadmap.md` (Phase 1, item 1)
- Research: `meta/research/codebase/2026-07-23-event-store-feature-catalog.md`
