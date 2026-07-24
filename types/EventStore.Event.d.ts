// Hand-authored declaration for the compiled output of src/EventStore/Event.purs.
//
// Raw compiled-JS shape, not a TS-ergonomic API (see EventStore.Clock.d.ts
// and CLAUDE.md's cross-language-compatibility section). Notable friction
// points a TS caller hits here, all preserved rather than papered over:
//
//   - newEvent/newEvent' take a ClockDict as their first argument (the
//     compiled form of the Clock typeclass constraint) — see
//     EventStore.Clock.d.ts.
//   - newEvent' takes `Maybe Instant`, not `Instant | undefined` — see
//     Data.Maybe.d.ts.
//   - Both are curried multi-argument functions, not a single options
//     object — every argument is its own call.
//   - Because Name/Payload/Metadata only appear in nested return positions,
//     TS cannot infer them from a single fully-applied call chain the way it
//     would for an uncurried function; callers generally need explicit type
//     arguments (`newEvent<C, Name, Payload, Metadata>(...)`) to get
//     anything other than `unknown`.

import type { ClockDict, Effect, Instant } from "./EventStore.Clock.js";
import type { Maybe } from "./Data.Maybe.js";

export interface NewEvent<Name, Payload, Metadata> {
  name: Name;
  payload: Payload;
  metadata: Metadata;
  observedAt: Instant;
  occurredAt: Instant;
}

export interface StoredEvent<Name, Payload, Metadata> {
  id: string;
  name: Name;
  payload: Payload;
  metadata: Metadata;
  stream: string;
  category: string;
  position: number;
  sequenceNumber: number;
  observedAt: Instant;
  occurredAt: Instant;
}

export declare function newEvent<C, Name, Payload, Metadata>(
  dict: ClockDict<C>,
): (
  clock: C,
) => (
  name: Name,
) => (payload: Payload) => (metadata: Metadata) => Effect<NewEvent<Name, Payload, Metadata>>;

export declare function newEvent$prime<C, Name, Payload, Metadata>(
  dict: ClockDict<C>,
): (
  clock: C,
) => (
  name: Name,
) => (
  payload: Payload,
) => (
  metadata: Metadata,
) => (
  maybeObservedAt: Maybe<Instant>,
) => (maybeOccurredAt: Maybe<Instant>) => Effect<NewEvent<Name, Payload, Metadata>>;

export declare function serialise<Name, Payload, Metadata>(
  event: NewEvent<Name, Payload, Metadata>,
): NewEvent<Name, Payload, Metadata>;

export declare function summarise<Name, Payload, Metadata>(
  event: NewEvent<Name, Payload, Metadata>,
): { name: Name; observedAt: Instant; occurredAt: Instant };

export declare function serialiseStored<Name, Payload, Metadata>(
  event: StoredEvent<Name, Payload, Metadata>,
): StoredEvent<Name, Payload, Metadata>;

export declare function summariseStored<Name, Payload, Metadata>(
  event: StoredEvent<Name, Payload, Metadata>,
): {
  id: string;
  name: Name;
  stream: string;
  category: string;
  position: number;
  sequenceNumber: number;
  observedAt: Instant;
  occurredAt: Instant;
};
