---
type: roadmap
id: "2026-07-23-event-store-purescript-port-roadmap"
title: "Roadmap: event-store PureScript port, phased work-item candidates"
date: "2026-07-23T00:00:00+00:00"
author: John Cowie Del Corral
producer: manual
status: draft
tags: [roadmap, event-sourcing, purescript-port, event-store]
last_updated: "2026-07-23T00:00:00+00:00"
last_updated_by: John Cowie Del Corral
schema_version: 1
---

# Roadmap: event-store PureScript port

**Source**: `meta/research/codebase/2026-07-23-event-store-feature-catalog.md`

This is not itself a work item. It's a list of work-item candidates, grouped
into three delivery phases, intended as input to `/create-work-item` — each
entry below should become one work item (or be split further during
refinement if it turns out too large).

## Phase sequencing rationale

The original research proposed a 10-step dependency-ordered catalog. This
roadmap regroups that into three coarser phases, per project priorities:

1. **Phase 1 — Foundations**: core types, the event store itself, both
   storage adapters (in-memory + Postgres), and projectors. Explicitly
   *excludes* projection storage — projectors fold a stream into a
   `Projection` value, but persisting/searching projections is deferred.
2. **Phase 2 — Running & distributing consumers**: everything needed to run
   long-lived services that consume events, including checkpointed
   consumption and distributing subscriptions across multiple
   processes/nodes (the broker).
3. **Phase 3 — Projection store & query DSL**: the backend-agnostic
   filter/sort/paging query language, and the projection store that reuses
   it for read-model persistence and search.

Within each phase, items are listed in a reasonable build order, but phases
themselves are the hard sequencing constraint — nothing in Phase 2 or 3
should be started before Phase 1 is usable end-to-end (append events, read
them back, fold them into a projection value, in both memory and Postgres).

Note one cross-phase wrinkle: `ProjectionEventProcessor` (event-by-event
projection materialisation) sits at the seam of consumers (Phase 2) and the
projection store (Phase 3) — it's listed in Phase 3 since it depends on
`ProjectionStore`, but it's really "Phase 2 machinery applied to a Phase 3
dependency." Worth flagging during refinement.

---

## Phase 1 — Core types, event store, adapters, projectors

1. **Core event types** — `NewEvent`/`StoredEvent`, bi-temporal timestamps
   (`observed_at`/`occurred_at`), generic name/payload/metadata parameters,
   `serialise`/`summarise`. Includes the injectable `Clock` abstraction
   (needed to make timestamp defaulting testable).

2. **Event source identifiers** — `LogIdentifier`/`CategoryIdentifier`/
   `StreamIdentifier` sibling hierarchy, the `target(category?, stream?)`
   smart constructor enforcing "stream requires category," and
   round-tripping an identifier from its serialised form.

3. **JSON conversion framework** — typeclass-based `ToJson`/`FromJson`
   equivalents replacing the Python protocol+fallback dispatch, including a
   deliberate decision on how (or whether) to preserve the fallback escape
   hatch for values with no static instance. This is the load-bearing
   extensibility mechanism the rest of the port depends on — do it early and
   get the design right rather than fast.

4. **EventStore API surface** — `EventStore` factory plus `EventStream`/
   `EventCategory`/`EventLog`, single-stream `publish`, atomic
   category-level multi-stream `publish` (sorted-key-order writes for
   deadlock avoidance), and the "categories/streams implicitly exist"
   semantics.

5. **Write conditions** — `WriteCondition` ADT (`NoCondition`,
   `PositionIsCondition`, `EmptyStreamCondition`, `And`/`Or` with
   auto-flattening) and enforcement inside the write lock for optimistic
   concurrency.

6. **Event serialisation guarantees** — `Log`/`Category`/`Stream` locking
   granularity as an explicit, adapter-constructor-time choice, including
   multi-lock acquisition (sorted, deadlock-avoiding) for multi-stream
   writes under `Stream` guarantee.

7. **In-memory event storage adapter** — flat sequence-indexed store plus
   log/category/stream indices, snapshot-based read isolation for
   concurrent scans, and staged-transaction (buffer-then-flush) commit
   semantics.

8. **EventSource abstraction & constraints** — the `latest`/`iterate`/`read`
   interface decoupled from the concrete store, `QueryConstraint`
   (`SequenceNumberAfterConstraint`), and `ConstrainedEventSource` for
   baking in a mandatory filter (e.g. "always resume after position N").
   This is a much smaller mechanism than the full query DSL (Phase 3) —
   scope it tightly.

9. **EventSourceFactory dispatch** — type-keyed construction of the right
   `EventLog`/`EventCategory`/`EventStream` wrapper from an identifier
   value alone, so later consumer/broker code doesn't need direct
   `EventStore` access.

10. **Postgres event storage adapter** — `events` table schema, advisory-lock
    write serialisation (transaction-scoped, auto-released), single-
    transaction batched insert, and cursor-based pagination during scan
    (re-querying with an advancing `sequence_number_after`, avoiding one
    giant open result set).

11. **Write retry/ignore helpers** — decorators/combinators wrapping a
    publish call to retry or swallow a single `UnmetWriteConditionError`.

12. **Projector abstraction** — folding an `EventSource` into a
    `Projection[State, Metadata]`: initial-state/metadata factories,
    per-event-name handler dispatch, `apply`/`project`. Requires an early
    decision (see Open Questions in the research doc) on whether to use
    explicit `Map EventName Handler` dispatch instead of the Python
    reflection-based naming convention — PureScript's static style favours
    explicit mapping.

13. **Event store adapter conformance test suite** — a shared abstract test
    contract (saves, concurrency races, scanning, paging, write conditions)
    mixed into both the in-memory and Postgres adapter test modules, proving
    behavioural parity between backends. Establishes the testing pattern
    (builders, fake `Clock`, random-data generators) reused in later phases.

---

## Phase 2 — Running services, consumers, and distributing work

1. **Service/Process lifecycle contracts** — `Process` (status-only
   observability contract), `Service` (`execute`), `ProcessStatus` enum, and
   multi-process status aggregation (precedence ladder, e.g. ERRORED beats
   everything).

2. **PollingService** — fixed-interval poll loop turning a one-shot
   service/callable into a long-running one. Consider adding backoff/jitter
   here, since the Python original notably ships without any.

3. **Error handling framework** — `ErrorHandlerDecision` variants (exit,
   raise, continue, retry), `ErrorHandler` implementations (exit/raise/
   continue/retry/type-mapping-by-exception), and `RetryStrategy`
   implementations. Worth adding a real exponential/jittered backoff
   strategy, which the Python library lacks entirely.

4. **ServiceManager** — top-level multi-service scheduler: register with
   execution/isolation mode, start (await foreground services, let
   background ones run independently), signal-driven graceful stop. Likely
   simplifies substantially versus Python's thread+event-loop juggling given
   PureScript's `Aff`.

5. **Consumer processor styles** — `EventProcessor` (per-event callback,
   auto-commit), `AutoCommitEventIteratorProcessor`, and
   `ManagedEventIteratorProcessor` (processor controls its own commit
   timing), unified as a single consumer-driving abstraction.

6. **EventSourceConsumer** — the core resumable consumption loop: load a
   resumption constraint from checkpoint state, iterate the source with it
   applied, dispatch to a processor, track consumed/processed counts,
   handle unhandled exceptions (re-raise, but let cancellation propagate
   untouched).

7. **EventConsumerStateStore (checkpointing)** — checkpoints modelled as
   ordinary events (`state-changed`) in a dedicated per-partition stream,
   guarded by the same optimistic-concurrency write conditions as normal
   writes, throttled by a configurable persistence interval with a
   forced-final-save option. Depends on Phase 1's event store, not on
   anything else in Phase 2.

8. **LockManager abstraction** — `try_lock`/`wait_for_lock` contract, plus
   in-memory (process-local) and Postgres (`pg_try_advisory_xact_lock`,
   transaction-scoped) implementations — the shared locking primitive
   underneath both write serialisation and broker leader election.

9. **EventBroker/EventSubscriber contracts** — the `register(subscriber)`
   entry point and the subscriber contract (`group`/`id`, requested
   sources, `health`, `accept`/`withdraw`).

10. **Singleton broker strategy** — single-process deployment: unconditional
    fixed-interval re-`accept` of every subscriber's every requested source,
    no coordination or state store required.

11. **Distributed broker: subscriber registration & heartbeating** —
    `EventSubscriberManager` bridging the local subscriber registry to a
    shared `EventSubscriberStateStore`, heartbeat loop, and stale-record
    purge loop. Decide whether to fix the known Python bug (list mutation
    during iteration in purge) or port it as-is.

12. **Distributed broker: leader election & rebalancing** —
    `EventSubscriptionCoordinator`: non-blocking cluster-wide leader
    election with a bounded term, and the rebalance algorithm (canonical
    target source-set, eligible/ineligible split, diff-based add/remove,
    round-robin allocation minimising churn).

13. **Distributed broker: subscription diffing & local apply** —
    `EventSubscriptionObserver`, running on every node: poll the shared
    subscription state store, diff against last-seen snapshot, call
    `accept`/`withdraw` only for locally-hosted subscribers.

14. **Broker configuration/top-level factory** — single entry point
    dispatching to the four concrete strategy/storage combinations
    (Singleton/Distributed × InMemory/Postgres). Decide whether to fix the
    unimplemented Postgres `EventSubscriptionStateStore.get()` and the
    sub-second-only lock-timeout conversion bug flagged in the research, or
    treat them as spec to port faithfully.

---

## Phase 3 — Projection store & query DSL

1. **Query DSL core types** — `FilterClause`/`Operator` (equality,
   comparison, `IN`, `CONTAINS`, regex), `SortField`/`SortClause`, `Path`
   (nested/JSON field addressing), and `PagingClause` (keyset + offset
   strategies) as a single backend-agnostic AST.

2. **Query DSL functions & extensibility decision** — the `Function`
   mechanism (e.g. `Similarity`) usable in sort clauses. Needs an early
   decision (flagged as an open question in the research): closed sum type
   now, with extensibility added later if needed, versus an open/typeclass-
   based extension point from day one.

3. **Search/Lookup query types** — `Search` (filters + optional sort/
   paging) and `Lookup` (point lookup, filters only), the two query shapes
   used by both event-scan constraints and projection search.

4. **In-memory query DSL backend** — direct pattern-match interpreter over
    the AST (PureScript's closed ADTs likely make this simpler than Python's
    runtime type-registry dispatch), including trigram similarity scoring
    if `Similarity` is carried over.

5. **Postgres query DSL backend** — SQL-builder AST (conditions,
    expressions, column/function references, casts), safe parameterised
    `.build()`, and keyset pagination across all direction × sort-shape
    combinations (asc/desc/mixed, using `UNION ALL` for mixed-direction
    cases). Flagged in the research as the single most complex piece to
    port — plan for it to take longer than it looks.

6. **ProjectionStore façade** — `save`/`locate` (find "the" projection for a
    source+name)/`load` (point lookup by id+name)/`search` (full query),
    reusing the Phase 3.1–3.3 DSL rather than inventing a parallel one.

7. **In-memory projection storage adapter** — keyed by `(name, id)`, upsert
    preserving the existing `source` on update, linear-scan search via the
    same result-set-transformer engine as the in-memory query backend.

8. **Postgres projection storage adapter** — `projections` table schema,
    blind last-write-wins upsert (`ON CONFLICT ... DO UPDATE`, deliberately
    no optimistic concurrency here unlike the event store itself).

9. **ProjectionEventProcessor** — event-by-event read-model materialisation:
    per event, locate the existing projection, re-run it through the
    projector for a single-event "batch," and persist the result. Bridges
    Phase 2's consumer machinery to this phase's `ProjectionStore` — flag as
    a cross-phase dependency during refinement.

10. **Projection store adapter conformance test suite** — shared abstract
    test contract for `ProjectionStorageAdapter`, mixed into in-memory and
    Postgres concrete test modules, mirroring the Phase 1 pattern.

---

## Open questions to resolve during refinement (not roadmap-blocking)

Carried over from the research doc — worth settling per-item as each is
refined via `/create-work-item`, rather than up front:

- Projector dispatch: explicit handler map vs. naming-convention reflection
  (Phase 1, item 12).
- Query DSL `Function` extensibility: closed vs. open (Phase 3, item 2).
- Whether to fix or faithfully port the three known broker bugs (Phase 2,
  items 11 and 14).
- Whether an existing library in `purescript-johncowie-postgres` or
  `purescript-johncowie-events` already covers ground here and should be
  reused rather than rebuilt — worth checking before starting Phase 1,
  item 10 (Postgres adapter) in particular.
