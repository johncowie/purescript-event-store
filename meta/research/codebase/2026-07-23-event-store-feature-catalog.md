---
type: codebase-research
id: "2026-07-23-event-store-feature-catalog"
title: "Research: logicblocks.event.store feature catalog for a PureScript port"
date: "2026-07-23T14:28:27+00:00"
author: "John Cowie Del Corral"
producer: research-codebase
status: complete
topic: "Full feature catalog of the event.store Python library, as a roadmap basis for a PureScript reimplementation"
tags: [research, codebase, event-sourcing, purescript-port, event-store, query-dsl, projections, broker, distributed-systems]
last_updated: "2026-07-23T14:28:27+00:00"
last_updated_by: "John Cowie Del Corral"
schema_version: 1
---

# Research: logicblocks.event.store feature catalog for a PureScript port

**Date**: 2026-07-23
**Author**: John Cowie Del Corral
**Source repository**: `logicblocks/event.store` (`git@github.com:logicblocks/event.store.git`), analysed at commit `4d496b24bddaee28a7d45df54721ce3461a58f5f`, local checkout at `/Users/john/Projects/ebury/event.store`
**Target repository (this document lives here)**: `/Users/john/Projects/johncowie/event-store` (new, empty — destination for the PureScript port)

## Research Question

Thoroughly catalog the full feature set of the `event.store` Python codebase, to serve as the basis of a roadmap for building a PureScript reimplementation of the library.

## Summary

`event.store` (PyPI: `logicblocks.event.store`) is a general-purpose eventing/event-sourcing library: an append-only event log with log/category/stream scoping, pluggable storage adapters (in-memory + Postgres), optimistic-concurrency write conditions, a backend-agnostic query DSL shared between event scanning constraints and a full projection-store search API, a `Projector` abstraction for folding event streams into read models, and a fairly sophisticated distributed processing layer (subscriber/subscription coordination, leader election, checkpointing) for building always-on event consumers across multiple nodes.

The codebase is organised into eight cohesive subsystems, each independently portable:

1. **Types** (`logicblocks.event.types`) — core value types: events, identifiers, projections, JSON/string conversion protocols.
2. **Store** (`logicblocks.event.store`) — the event log itself: publish, read, write conditions, serialisation guarantees, adapters.
3. **Query** (`logicblocks.event.query` + `logicblocks.event.persistence`) — a backend-agnostic filter/sort/paging DSL with two converter backends (in-memory, Postgres).
4. **Sources** (`logicblocks.event.sources`) — the `EventSource` abstraction and constraint-based filtering, decoupled from the concrete store.
5. **Projection** (`logicblocks.event.projection`) — folding an `EventSource` into a `Projection`, plus a projection store reusing the query DSL.
6. **Processing: consumers** (`logicblocks.event.processing.consumers`) — checkpointed, resumable event consumption.
7. **Processing: services** (`logicblocks.event.processing.services` + `.process`) — generic async service lifecycle, polling, error handling/retry framework, multi-executor scheduling.
8. **Processing: broker** (`logicblocks.event.processing.broker`) — single-process and multi-node distributed coordination of event subscribers (leader election, rebalancing, heartbeating).

Plus supporting **persistence/testing infrastructure**: the low-level query-to-SQL/in-memory conversion layer, the Postgres schema, and a shared "adapter conformance test suite" pattern that proves behavioural parity between backends — itself a pattern worth reproducing in the PureScript port.

A rough dependency order for porting: **Types → Store (in-memory adapter) → Sources → Query DSL (in-memory) → Projection → Store (Postgres adapter) → Query DSL (Postgres) → Consumers/checkpointing → Services (error handling/polling) → Broker (singleton, then distributed)**.

---

## Detailed Findings

### 1. Core Types (`logicblocks.event.types`)

Files: `types/event.py`, `types/identifier.py`, `types/projection.py`, `types/conversion.py`, `types/functions.py`, `types/json.py`, `types/string.py`.

**Events** — `NewEvent[Name, Payload, Metadata]` vs `StoredEvent[Name, Payload, Metadata]`, both frozen/immutable:
- `NewEvent`: `name`, `payload`, `metadata`, `observed_at`, `occurred_at` (bi-temporal: "when it happened" vs "when the system recorded it"). Custom constructor defaults `observed_at` to `clock.now(UTC)` and `occurred_at` to `observed_at` if not given — an injectable `Clock` makes this testable.
- `StoredEvent`: adds `id` (uuid), `stream`, `category`, `position` (0-based, **per-stream**), `sequence_number` (global, monotonic, cross-stream). No default-filling constructor — must be fully specified (this is what the store produces).
- Both have `.serialise()` (full JSON) and `.summarise()` (JSON minus payload/metadata, for safe logging).
- **Porting note**: `position` vs `sequence_number` is a key distinction to preserve — per-stream ordinal vs global log ordinal (used for cursor pagination via `sequence_number_after`).

**Identifiers** — strict widening hierarchy `LogIdentifier` (no fields) ⊃ `CategoryIdentifier(category)` ⊃ `StreamIdentifier(category, stream)`, all siblings under `EventSourceIdentifier`, not a class-inheritance chain. Plus partition variants (`StreamNamePrefixPartitionIdentifier`, `LogPartitionIdentifier`, `CategoryPartitionIdentifier`) not currently used elsewhere in the analysed code. `target(*, category, stream)` factory enforces the invariant "stream requires category." `event_sequence_identifier(dict)` reconstructs an identifier from its serialised dict form (used when reading e.g. a `Projection.source` back out of storage).

**Projections** — `Projection[State, Metadata]`: `id`, `name`, `source: EventSourceIdentifier`, `state`, `metadata`. Same serialise/summarise/immutability pattern. `serialise_projection`/`deserialise_projection` round-trip strongly-typed state/metadata through JSON.

**JSON conversion framework** (`json.py`, `conversion.py`) — the load-bearing extensibility mechanism used throughout the whole library:
- `JsonValue = JsonObject | JsonArray | JsonPrimitive` recursive type alias; `is_json_value`/`is_json_object`/`is_json_array`/`is_json_primitive` are recursive type-guard predicates.
- `JsonValueSerialisable`/`JsonValueDeserialisable`/`JsonValueConvertible` — structural (duck-typed) protocols any custom payload/state type can implement to plug into (de)serialisation.
- `serialise_to_json_value`/`deserialise_from_json_value` — the central 3-tier dispatch: protocol implementation → already-valid-JSON pass-through → caller-supplied fallback (raise, or best-effort `str()`/similar). `deserialise_from_json_value` additionally reflects over generic container types (`Sequence[T]`, `Mapping[str, T]`) to recursively validate/convert nested structures.
- A parallel, structurally identical framework exists for `str` (`StringSerialisable`/`StringDeserialisable`/`StringConvertible`, `serialise_to_string`/`deserialise_from_string`) — used for event/stream names.
- **Porting note**: this "protocol + fallback + recursive dispatch" pattern is the biggest design decision to carry over faithfully — in PureScript it maps naturally to a typeclass (`class ToJson a`/`class FromJson a`, akin to `argonaut`'s `EncodeJson`/`DecodeJson`) but the *fallback-callback* escape hatch (used for values that don't have a static instance, e.g. logging arbitrary objects) has no direct typeclass equivalent and needs a deliberate design choice (existential wrapper? separate "loggable" variant type?).

**Generics/protocols style**: heavy use of Python 3.13 PEP 695 generics with defaults (`class NewEvent[Name = str, Payload = JsonValue, Metadata = JsonValue]`) and `@runtime_checkable Protocol`s for structural typing — in PureScript these become ordinary type parameters with default instances resolved via typeclasses, and Protocols become typeclasses (no structural/duck-typed equivalent needed since PS is nominally typed via instances).

---

### 2. Event Store Core (`logicblocks.event.store`)

Files: `store/store.py`, `conditions.py`, `exceptions.py`, `transactions.py`, `source_factories.py`, `sources.py`, `types.py`, `store/adapters/{base,memory,postgres}`.

**API surface** — `EventStore` (factory only, no IO) → `.stream(category, stream)` / `.category(category)` / `.log()`, producing `EventStream` / `EventCategory` / `EventLog`, all implementing the generic `EventSource[I, E]` interface (`latest()`, `iterate()`, `read()`, `__aiter__`):
- `EventStream.publish(events, condition=NoCondition())` — single-stream, atomic batch write.
- `EventCategory.publish(streams: Mapping[str, StreamPublishDefinition])` — **atomic multi-stream** write across a category; each stream gets its own independent write condition; streams processed in **sorted key order** for deadlock avoidance.
- `EventCategory.stream(stream)` narrows to a single stream within the category.
- `EventLog` — read-only, whole-log view (no publish at log level — you always publish to a stream or set of streams).
- Categories/streams "implicitly exist" — addressing a never-written stream is not an error.

**Write conditions (optimistic concurrency)** — `WriteCondition` ABC with `&`/`|` operator overloads building `AndCondition`/`OrCondition` (auto-flattening nested same-type combinations into one `frozenset`). Built-ins: `NoCondition`, `PositionIsCondition(position)`, `EmptyStreamCondition`, plus helpers `position_is()`/`stream_is_empty()`. Enforcement is a registry (`WriteCondition` subtype → `WriteConditionEnforcer`) checked *inside* the write lock, using the just-read "latest event" — this read-check-write atomicity under lock is what gives the optimistic-concurrency guarantee. `OrCondition` re-raises the *first* failure if none of its alternatives pass.

**Ordering/consistency: `EventSerialisationGuarantee`** — three singleton strategy objects controlling write-lock granularity:
- `LOG` (default) — one global lock; total store-wide write order.
- `CATEGORY` — one lock per category; ordering guaranteed within a category, not across categories.
- `STREAM` — one lock per stream; ordering only within a single stream, max write concurrency.
For category-level multi-stream publishes under `STREAM` guarantee, multiple stream-locks are acquired together (sorted-order, deadlock-avoiding) via a `MultiLock` (memory) or multiple `pg_advisory_xact_lock` calls (Postgres).

**`EventStorageAdapter` ABC** — the pluggable-backend contract: `save(target, events?, condition?, streams?)` (overloaded on `Saveable = StreamIdentifier | CategoryIdentifier`), `latest(target: Latestable)`, `scan(target: Scannable, constraints: Set[QueryConstraint])`.

**`InMemoryEventStorageAdapter`** — flat `events` array indexed by global sequence number, plus `log_index`/`category_index`/`stream_index` lookup lists; a `snapshot()` deep-copy gives read isolation for concurrent scans; a `transaction()` staging buffer accumulates writes and only flushes (commits) once all condition checks for the whole batch pass, giving all-or-nothing atomicity. Async locks (`aiologic.Lock`) keyed by computed lock name, lazily created, never evicted.

**`PostgresEventStorageAdapter`** — single `events` table (schema below), advisory-lock-based (`pg_advisory_xact_lock`, transaction-scoped, released automatically at commit/rollback) write-serialisation, single-connection/single-transaction batched multi-row `INSERT ... RETURNING *` for atomicity, cursor-based **pagination during scan** (repeatedly re-querying with an advancing `sequence_number_after` constraint, to avoid one giant open transaction/result set — contrast with the in-memory adapter's single upfront snapshot).

**Exceptions**: only one domain exception, `UnmetWriteConditionError`; a plain `ValueError` for API misuse (wrong target/kwargs combination); a plain `RuntimeError` for an internal Postgres row-count consistency check (distinguished deliberately from the "normal" concurrency-conflict exception).

**Transaction/retry decorators** (`transactions.py`) — despite the name, purely control-flow sugar around `UnmetWriteConditionError`, not real DB transactions: `@retry_on_unmet_condition_error(tries=N)` retries a publish N times on condition failure; `@ignore_on_unmet_condition_error()` swallows a single failure and returns `None`. Generalised via abstract `retry_on_error`/`ignore_on_error` bases parameterised by exception type.

**`EventStoreEventSourceFactory`** (`source_factories.py`) — a type-keyed dispatch table (`type[EventSourceIdentifier] → constructor`) letting generic code (projections, consumers, broker) obtain the right `EventLog`/`EventCategory`/`EventStream` wrapper purely from an identifier value, decoupling identifier-driven code from `EventStore` construction details. Extensible via `register_constructor`.

---

### 3. Query DSL (`logicblocks.event.query` + `logicblocks.event.persistence`)

This is a single backend-agnostic AST, shared verbatim between event-scan constraints and the full projection-store search API, with two independent converter backends.

**Clauses** (`query/clauses.py`):
- `Operator`: `EQUAL, NOT_EQUAL, GREATER_THAN, GREATER_THAN_OR_EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL, IN, CONTAINS, REGEX_MATCHES, NOT_REGEX_MATCHES`.
- `FilterClause(operator, field: Path, value)`.
- `SortField(field: Path | Function, order: SortOrder [ASC|DESC])`, `SortClause(fields: Sequence[SortField])` — a sort field can be a computed `Function` result (e.g. sort by relevance score).
- `PagingClause` — two strategies: `KeySetPagingClause(last_id, direction [FORWARDS|BACKWARDS], item_count)` (cursor-based) and `OffsetPagingClause(page_number, item_count)` (page-number based, derived `offset`).
- No boolean clause composition (`AND`/`OR` of clauses) — `Search`/`Lookup` implicitly AND together a flat list of filters.

**Functions** (`query/functions.py`) — the extensibility point for computed/derived values usable in sorting: `Function(alias)` ABC, one built-in `Similarity(alias, left: Path, right: str)` (trigram string similarity). Adding a new function means implementing a per-backend converter and registering it — the extension mechanism, not a closed set.

**Queries** (`query/queries.py`) — `Search(filters, sort?, paging?)` (full query) and `Lookup(filters)` (point lookup, no sort/paging). No nested/boolean `Query` composition, only the flat one-level model.

**`Path`** (`query/utilities.py`) — `Path(top_level, *sub_levels)` addressing nested/JSON fields; `is_nested()` distinguishes plain column access from nested-path access (drives Postgres `jsonb_extract_path` vs plain column reference).

**Conversion architecture — `TypeRegistryConverter[I, R]`** (`persistence/converter.py`) — the single dispatch mechanism reused everywhere (clauses, functions, queries, write-conditions, event-source constraints): a `dict[type[I], Converter]` keyed by **exact class** (not `isinstance`/MRO), raising if unregistered. This is a manual class-keyed dispatch table, not a classic visitor (AST nodes have no `accept()` method).

**Memory backend** — converts to `ResultSetTransformer[T] = Callable[ResultSet[T], ResultSet[T]]`; composition via `compose_transformers` (functional left-fold); every operator implemented directly in Python (`==`, `>`, `in`, `re.match`); `Similarity` computed via hand-rolled trigram Jaccard scoring, stashed into a `Result.extra` side-map so it can subsequently be sorted on.

**Postgres backend** — converts to `QueryApplier(Applier[Query])`, mutating (via clone) an immutable internal SQL-builder AST (`persistence/postgres/query.py`: `Query`, `Condition`, `Expression`, `ColumnReference`, `FunctionApplication`, `Cast`, `SortBy`, etc.), which `.build()`s into a driver-parameterised `(sql, params)` tuple — safe against injection since every literal goes through `%s` placeholders (never string interpolation). `Similarity` delegates to Postgres's own `pg_trgm` `similarity()` SQL function. **Keyset pagination is the most complex part of the whole codebase**: 8+ distinct SQL-generation branches depending on paging direction × existing sort shape (none/all-asc/all-desc/mixed), using row-value tuple comparisons and CTEs (`WITH last AS (...)`) to seek from a cursor anchor, with `UNION ALL` disjunctions needed for "mixed" (some-asc-some-desc) sort orders since Postgres can't row-compare across mixed directions directly.

**Porting note**: for the PureScript port, this "one AST, two converter backends via a type-keyed registry" architecture is highly portable — a sum-type ADT for `Clause`/`Function`/`Query` plus a typeclass-per-backend (or explicit interpreter functions) replaces the Python registry pattern naturally, likely *more* naturally than in Python since PS pattern matching on a closed ADT eliminates the need for a runtime registry at all (unless the extensibility requirement — arbitrary user-defined `Function` subtypes — needs to be preserved, in which case an open existential/typeclass-based extension point is needed instead of a closed sum type).

---

### 4. Sources abstraction (`logicblocks.event.sources`) and Constraints

Distinct from the query DSL above — a separate, much smaller mechanism for constraining live/streamed `EventSource` iteration (not projection/read-model search).

- `EventSource[I: EventSourceIdentifier, E: Event]` ABC: `identifier` (property), `latest()`, `iterate(constraints)`, `read()` (default impl = collect `iterate()`), `__aiter__` (powers `async for event in source`).
- `QueryConstraint` — bare marker ABC; only one concrete constraint exists: `SequenceNumberAfterConstraint(sequence_number)` / helper `sequence_number_after(n)` — used for resuming a scan/subscription after a known point.
- `ConstrainedEventSource` — decorator wrapping a delegate `EventSource` with a fixed constraint set, unioned with any caller-supplied constraints at iterate-time — "bake in a mandatory filter" (e.g. always read only after position N).
- `InMemoryEventSource` — a static, read-only `EventSource` view over a fixed in-memory `Sequence[E]`, entirely separate from `InMemoryEventStorageAdapter` (which is a full mutable indexed adapter) — useful for tests/fixtures.
- `EventSourceFactory[E]` — one-method ABC (`construct(identifier) -> EventSource`), implemented by `EventStoreEventSourceFactory` (section 2).

---

### 5. Projections (`logicblocks.event.projection`)

**`Projector[Identifier, State, Metadata=JsonValue]`** — abstract base with three required factories (`initial_state_factory`, `initial_metadata_factory`, `id_factory(state, source) -> str`) and one overridable hook (`update_metadata(state, metadata, event)`, default no-op).
- **Handler dispatch is naming-convention-based**: event name `"profile-created"` (kebab-case) → method `profile_created(state, event) -> state` (snake_case), resolved via `pyheck.snake` + `getattr`. Missing handler behaviour configurable (`RAISE` default, or `IGNORE` → identity passthrough).
- `apply(event, state?)` — single-event application (uses factory if no state given).
- `project(source, state?, metadata?) -> Projection` — the main entry point: async-iterates the whole `source`, applying each event and calling `update_metadata` after each, returning the final `Projection` only once the source is exhausted (no incremental yielding).
- `projection_name` defaults to kebab-case class name with trailing `"Projector"` stripped.

**No built-in incremental/resume support** — `project()`'s optional `state`/`metadata` params are the seam: callers must manually load a prior `Projection` (via `ProjectionStore`) and separately constrain the source (via `sequence_number_after`, section 4) to avoid re-processing. `update_metadata`'s default no-op means version/timestamp tracking in metadata is entirely a subclass responsibility, not automatic.

**`ProjectionStore`** — thin façade adding logging over a `ProjectionStorageAdapter`: `save(projection)`, `locate(source, name)` (find "the" projection for a source+name via `Lookup`), `load(id, name)` (point lookup by id+name), `search(filters, sort, paging)` (full `Search`). **Reuses the exact same `Query`/`Clause`/`Path`/`Operator` DSL as the event store's own query converters** — one unified query language for both event-scan constraints (a much smaller subset) and read-model search.

**`ProjectionStorageAdapter` ABC**: `save`, `find_one`, `find_many`, `count` — generic over `State`/`Metadata` (both `JsonPersistable`).

- **In-memory**: `dict[(name, id), Projection[JsonValue, JsonValue]]` (always stores serialised form); upsert preserves existing `source` on update (implicit invariant: source never changes for a given (name,id)); filtering/search via the same generic `ResultSetTransformer` engine as the event store's memory query converter — no dedicated indexing, linear scan.
- **Postgres**: `projections` table (schema below); **blind upsert, no optimistic concurrency** — `INSERT ... ON CONFLICT (name, id) DO UPDATE SET (state, metadata) = (...)`, last-write-wins, unlike the event store's own condition-checked writes.

**Snapshotting is confirmed unimplemented** — README says "coming soon"; no code exists anywhere in `projection/` or `sources/` beyond an unrelated same-named internal method (`InMemoryEventsDB.snapshot()`, a copy-on-write clone of adapter indices used for read isolation, not projection persistence).

---

### 6. Consumers (`logicblocks.event.processing.consumers`)

Three processor styles an `EventConsumer` can drive, unified as `SupportedProcessors[E]`:
- `EventProcessor[E]` — simplest, `process_event(event)` callback per event, auto-committed after each.
- `AutoCommitEventIteratorProcessor[E]` — consumes an async iterator, auto-acknowledge/commit per event.
- `ManagedEventIteratorProcessor[E]` — consumes an iterator *and* an `EventProcessorManager` handle, so the processor itself decides when to acknowledge/commit (e.g. batch commits).

**`EventSourceConsumer`** — the core "read one `EventSource`, drive a processor, checkpoint progress" consumer:
1. Loads a resumption constraint from its `EventConsumerStateStore` (`load_to_query_constraint()`).
2. Iterates the source with that constraint applied (or unconstrained if none).
3. Dispatches to one of the three processor-driving code paths above, tracking consumed/processed counts.
4. On unhandled exception in the callback path: logs and re-raises (except `CancelledError`/`GeneratorExit`, which propagate untouched without triggering the log path); optionally forces a final checkpoint save.

**Checkpointing (`EventConsumerStateStore`)** — checkpoints are themselves modelled as **events**: a `"state-changed"` event is appended to a dedicated checkpoint category/stream per "partition" (allowing one state store to back several concurrent per-source consumers, differentiated by partition key), guarded by the *same* optimistic-concurrency write conditions as ordinary event writes (`position_is`/`stream_is_empty`). Saves are throttled by a configurable `persistence_interval: EventCount` (default: every 100 processed events) rather than after every event, with an explicit forced-final-save option. `EventConsumerStateConverter[E]` is the pluggable strategy translating a raw event into checkpoint state and back into a resumption `QueryConstraint` (built-in: `StoredEventEventConsumerStateConverter`, tracking `last_sequence_number` → `sequence_number_after`).

**`ProjectionEventProcessor`** — glue: an `EventProcessor[StoredEvent]` that, per event, looks up the existing projection (via `ProjectionStore.locate`), wraps the single incoming event in an ad-hoc `InMemoryStoredEventSource`, re-runs it through a `Projector.project()`, and persists the result — i.e. event-by-event read-model materialisation, reusing the whole-source `project()` API for a batch of one.

**`EventSubscriptionConsumer`** — the integration point with the broker (section 8): implements both `EventConsumer` and `EventSubscriber`; on `accept(source)`/`withdraw(source)` (called by the broker) it creates/tears down a per-source `EventSourceConsumer` delegate (all delegates for one subscriber share one `EventConsumerStateStore`, partitioned by source); `consume_all()` fans out one `consume_all()` call to every currently-assigned delegate.

---

### 7. Services & Processes (`logicblocks.event.processing.services`, `.process`)

**Layering**: `Process` (bare `status: ProcessStatus` property, pure observability contract, no execution) ← `Service[T]` (single `execute() -> T`, the executable-unit contract) ← `EventConsumer`/broker sub-processes are typically wrapped in a `Service` to be run/scheduled.

**`ProcessStatus`**: `INITIALISED, STARTING, WAITING, RUNNING, STOPPING, STOPPED, ERRORED, UNKNOWN`. `determine_multi_process_status` aggregates several child statuses into one via an explicit precedence ladder (ERRORED beats everything; a mix including STOPPED-but-not-all-STOPPED reports STOPPING; etc.) — used to combine e.g. a distributed broker's coordinator+observer statuses into one overall status.

**`PollingService`** — turns a one-shot `Service`/callable into an infinite fixed-interval poll loop (`poll_interval`, default 200ms) — **no backoff, no jitter, no max-iteration cap**; relies purely on external cancellation to stop.

**`ServiceManager`** — the top-level multi-service scheduler/supervisor:
- `register(service, name?, execution_mode [FOREGROUND|BACKGROUND], isolation_mode [MAIN_THREAD|SHARED_THREAD|DEDICATED_THREAD])`.
- Three isolation strategies map to three executor implementations: run as an `asyncio.create_task` on the caller's loop; run on one shared dedicated background-thread event loop; or spin up a brand-new dedicated thread+event loop per service.
- `start()` schedules everything, but only *awaits* (blocks on) `FOREGROUND` services' futures — `BACKGROUND` ones run independently; also wires OS signal handlers (`stop_on(signals)`) to trigger graceful `stop()`.
- Each registered service gets a `DeferredFuture` that raises if queried before the manager actually schedules it.

**Error handling framework** (`services/error/`) — a decision-based, composable design:
- `ErrorHandlerDecision` variants: `ExitErrorHandlerDecision(exit_code)`, `RaiseErrorHandlerDecision(exception)`, `ContinueErrorHandlerDecision(value)`, `RetryErrorHandlerDecision(wait_before_retry?)`.
- `ErrorHandler` implementations: `ExitErrorHandler` (always exits, code from a factory, default 1), `RaiseErrorHandler` (re-raises, optionally transformed via a factory), `ContinueErrorHandler` (swallows `Exception` and substitutes a computed value — but not more severe `BaseException`s like `KeyboardInterrupt`), `RetryErrorHandler` (delegates to a pluggable `RetryStrategy`, or retries immediately forever if none given), `TypeMappingErrorHandler` (routes by walking the exception's MRO against a `type → (handler, callback)` map, falling back to a default handler — `RaiseErrorHandler` by default).
- `RetryStrategy` implementations: `ConstantRetryStrategy(fixed delay)` — no attempt-count tracking at all (no built-in "give up after N tries"); `IncludeExceptionsRetryStrategy`/`ExcludeExceptionsRetryStrategy` — decorator filters that bypass a delegate strategy's real policy (retry-immediately instead) for excluded/non-included exception types. **No exponential/jittered backoff strategy ships with the library.**
- `ErrorHandlingService` wraps a whole `Service.execute()` call in a retry/handle loop (`apply_error_handling`) — on retry, the *entire* `execute()` re-runs from scratch, not some inner checkpoint.
- Pre-built decorators layer on top: `@retry_on_unmet_condition_error`, `@ignore_on_unmet_condition_error`, `@retry_on_error`, `@ignore_on_error` (store-level, section 2) reuse this same decision vocabulary conceptually but are independent, store-specific implementations.

---

### 8. Broker & Distributed Processing (`logicblocks.event.processing.broker`)

The most architecturally complex subsystem — coordinates which event sources each subscriber process consumes, across one or many nodes.

**`EventBroker[E]`** — `Service + Process` with one method, `register(subscriber: EventSubscriber[E])`. `EventSubscriber` contract: `group`/`id` identity, `subscription_requests: Sequence[EventSourceIdentifier]` (desired sources), `health()`, `accept(source)`/`withdraw(source)` (broker-driven lifecycle hooks).

**Singleton strategy** — for single-process deployments, no coordination needed: a fixed-interval loop (default 30s) that unconditionally re-`accept`s every subscriber's every requested source every iteration. No state store, no leader election, no diffing, no revocation — relies on `accept` being idempotent.

**Distributed strategy** — for multi-node deployments; runs three concurrent sub-processes per node in one `TaskGroup`:

1. **`EventSubscriberManager`** — bridges the local (process-only) subscriber registry to a *shared* `EventSubscriberStateStore` (visible to all nodes): `register()`/`unregister()` push/pull local subscribers on start/stop; `heartbeat()` loop (default 10s) marks healthy subscribers as recently-seen in the shared store; `purge()` loop (default 1 min) deletes globally-stale subscriber records (any node can purge, store-wide) older than a max age (default 10 min).

2. **`EventSubscriptionCoordinator`** (leader-elected rebalancer) — **leader election** via a single, fixed, class-name-derived lock (`try_lock`, non-blocking attempt, retried every 5s by non-leaders) shared cluster-wide across *all* subscriber groups (not partitioned per group — a scalability ceiling). The elected leader runs a `distribute()` rebalance every 20s, for a bounded leadership term (default 15 min, then voluntarily gives it up, forcing periodic re-election even absent failure). **Rebalance algorithm** per subscriber group: (a) among all subscribers in the group, take the *largest* requested source-set as the canonical target (trusting whichever subscriber(s) know the most); (b) split subscribers into eligible (exact match to the target set) vs ineligible (stale, lose everything); (c) diff currently-allocated vs target sources to find removals/additions; (d) round-robin-stride ("chunk") the newly-needed sources across eligible subscribers, trying to preserve each subscriber's already-correct allocations (minimal churn); (e) apply the whole batch of `ADD`/`REMOVE`/`REPLACE` changes to the shared subscription state store in one call.

3. **`EventSubscriptionObserver`** — runs on *every* node (not just the leader), polling the shared subscription state store every 20s, diffing against its last-seen snapshot (`EventSubscriptionDifference.diff`, fine-grained per-source-set-diffing, not just per-subscription), and for any subscriber it hosts *locally*, calling `accept`/`withdraw` with the concrete `EventSource` built via `EventSourceFactory`. This decouples "who computes the global plan" (leader) from "who executes the local accept/withdraw calls" (every node, for its own subscribers).

**Shared state stores** (in-memory or Postgres implementations of the same abstract contract, table schemas below): `EventSubscriberStateStore` (group/id/node_id/subscription_requests/last_seen) and `EventSubscriptionStateStore` (group/id/node_id/event_sources — the actual current assignment).

**Locks (`processing.locks`)** — `LockManager` ABC with `try_lock` (non-blocking) / `wait_for_lock` (blocking, optional timeout); `InMemoryLockManager` (process-local `asyncio.Lock`s); `PostgresLockManager` (real cross-node locking via `pg_try_advisory_xact_lock`/`pg_advisory_xact_lock`, transaction-scoped auto-release, lock name hashed via SHA-256 mod 10^16 to fit the integer key advisory locks require — same hashing scheme as the event store's own write-serialisation locks).

**Configuration surface** — `make_event_broker(node_id, broker_type [Singleton|Distributed], storage_type [InMemory|Postgres], **kwargs)` is the single top-level factory, `match`-dispatching to four concrete builder/factory combinations, each with its own `TypedDict` kwargs shape and `@overload` for static type safety.

**Known implementation quirks flagged by the analysis** (worth deciding whether to reproduce or fix in the port): in-memory subscriber-state `purge()` mutates a list while iterating it (skip-element hazard); Postgres lock-manager's wait-timeout conversion only considers the sub-second `microseconds` component of a `timedelta`, breaking multi-second timeouts; `PostgresEventSubscriptionStateStore.get()` is unimplemented despite being part of the abstract contract.

---

### 9. Persistence layer internals & Postgres schema

**Converter architecture** — see section 3; identical `TypeRegistryConverter` pattern reused for write-condition enforcement and event-source-constraint conversion, not just query clauses.

**Full Postgres schema** (from `/Users/john/Projects/ebury/event.store/sql/`):

```sql
-- events
CREATE TABLE events (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    stream TEXT NOT NULL,
    category TEXT NOT NULL,
    position INT NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB NOT NULL,
    sequence_number BIGSERIAL NOT NULL,
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id), UNIQUE (id)
);
-- indices: sequence_number; (category, stream, position); (category, sequence_number); (category, stream, sequence_number DESC)

-- projections
CREATE TABLE projections (
    id TEXT NOT NULL, name TEXT NOT NULL,
    source JSONB NOT NULL, state JSONB NOT NULL, metadata JSONB NOT NULL,
    PRIMARY KEY (name, id), UNIQUE (name, id)
);
-- indices: (name, source); (name, id)

-- subscriptions (broker: current assignment)
CREATE TABLE subscriptions (
    id TEXT NOT NULL, "group" TEXT NOT NULL, node_id TEXT NOT NULL,
    event_sources JSONB NOT NULL,
    PRIMARY KEY (id, "group"), UNIQUE (id, "group")
);
-- index: node_id

-- subscribers (broker: heartbeat/liveness)
CREATE TABLE subscribers (
    "group" TEXT NOT NULL, id TEXT NOT NULL, node_id TEXT NOT NULL,
    subscription_requests JSONB NOT NULL, last_seen TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY ("group", id), UNIQUE ("group", id)
);
-- index: last_seen DESC

CREATE EXTENSION IF NOT EXISTS pg_trgm; -- required for the Similarity query function
```

**Testing infrastructure worth reproducing structurally**:
- `testing/builders.py` — fluent, immutable "with_x"-style builders (`NewEventBuilder`, `StoredEventBuilder`, `BaseProjectionBuilder`/`MappingProjectionBuilder`) with randomised sensible defaults, and an injectable `Clock` for deterministic timestamps.
- `testing/data.py` — layered random-data generators (low-level string/int/uuid primitives → domain-specific generators for event/projection/subscriber fields).
- `utils/clock.py` — `Clock` ABC with `SystemClock` (real), `StaticClock` (fixed, settable), `TimezoneRequiredStaticClock` (fixed + guards against being queried with the wrong timezone) — the injectable-time pattern used throughout for deterministic tests.
- **Shared adapter conformance test suites** (`tests/shared/.../testcases/`) — abstract mixin test classes (`EventStorageAdapterCases`, `ProjectionStorageAdapterCases`, `LockManagerCases`, `EventSubscriberStateStoreCases`, `EventSubscriptionStateStoreCases`) exercising a full behavioural contract (saves, concurrency races under both threads and asyncio, scanning, paging, write conditions, etc.), each mixed into both an in-memory-backed and a Postgres-backed concrete test module — this is exactly the "storage adapters ensure consistency across implementations" feature called out in the README, and is a strong pattern to replicate for the PureScript port's own memory/Postgres adapters.

---

## Feature Catalog (Roadmap Basis)

Organised as a rough dependency-ordered roadmap for the PureScript port. Each phase is largely self-contained and testable before starting the next.

**Phase 1 — Core types & JSON conversion**
- `NewEvent`/`StoredEvent` (bi-temporal timestamps, generic name/payload/metadata)
- `LogIdentifier`/`CategoryIdentifier`/`StreamIdentifier` hierarchy + `target()` smart constructor
- `Projection[State, Metadata]`
- JSON conversion typeclasses (`ToJson`/`FromJson`-equivalent) with a fallback/escape-hatch story
- Injectable `Clock` abstraction

**Phase 2 — Event store core + in-memory adapter**
- `EventStore`/`EventCategory`/`EventStream`/`EventLog` API surface
- `WriteCondition` ADT (`NoCondition`, `PositionIsCondition`, `EmptyStreamCondition`, `And`/`Or` with flattening) + enforcement
- `EventSerialisationGuarantee` (Log/Category/Stream locking granularity)
- Single-stream publish + atomic category-level multi-stream publish
- In-memory adapter: indices, snapshot-based read isolation, staged-transaction commit

**Phase 3 — Sources & constraints**
- `EventSource` interface (`latest`, `iterate`, `read`)
- `QueryConstraint` (`SequenceNumberAfterConstraint`), `ConstrainedEventSource`
- `EventSourceFactory` type-keyed dispatch

**Phase 4 — Query DSL (in-memory backend first)**
- `Clause`/`Function`/`Query` ADTs (`FilterClause`+`Operator`, `SortClause`, `KeySetPagingClause`/`OffsetPagingClause`, `Similarity`, `Search`/`Lookup`, `Path`)
- In-memory `ResultSetTransformer` interpreter (or direct pattern-match interpreter, given PS's closed ADTs)

**Phase 5 — Projections**
- `Projector` (naming-convention or explicit-mapping handler dispatch — PS likely wants explicit mapping over reflection-based naming conventions)
- `ProjectionStore` (reusing the Phase 4 query DSL) + in-memory adapter

**Phase 6 — Postgres adapters**
- Postgres event store adapter (schema above, advisory-lock write serialisation, batched insert, cursor-paginated scan)
- Postgres query-DSL backend (SQL builder AST, keyset pagination — the most complex single piece to port)
- Postgres projection-store adapter

**Phase 7 — Consumers & checkpointing**
- `EventProcessor`/`AutoCommitEventIteratorProcessor`/`ManagedEventIteratorProcessor`
- `EventSourceConsumer` (resumable iteration)
- `EventConsumerStateStore` (checkpoint-as-event pattern, throttled saves)
- `ProjectionEventProcessor`

**Phase 8 — Services & error handling**
- `Service`/`Process`/`ProcessStatus` + status aggregation
- `PollingService`, `ServiceManager` (execution/isolation modes — likely simplifies significantly in PS/Aff vs Python's thread+event-loop juggling)
- Error handling decision framework (`ErrorHandler`, `RetryStrategy`) — worth adding a real backoff strategy here, since the Python original notably lacks one

**Phase 9 — Broker (singleton, then distributed)**
- `EventBroker`/`EventSubscriber` contracts
- Singleton strategy (simple re-accept loop)
- Distributed strategy: `LockManager` (in-memory + Postgres advisory locks), subscriber heartbeating/purging, leader-elected rebalance algorithm, subscription-diff-driven local accept/withdraw
- Decide whether to fix the flagged quirks (list-mutation-during-iteration purge bug, sub-second-only lock timeout, unimplemented `get()`) rather than port them as-is

**Phase 10 — Testing infrastructure**
- Builders + random-data generators + `Clock` fakes
- Shared adapter-conformance test suites (one abstract suite per adapter contract, mixed into both memory and Postgres concrete test modules)

---

## Code References

- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/types/event.py` — `NewEvent`, `StoredEvent`
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/types/identifier.py` — identifier hierarchy
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/types/projection.py` — `Projection`
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/types/conversion.py`, `json.py`, `string.py` — conversion framework
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/store/store.py` — `EventStore`/`EventCategory`/`EventStream`/`EventLog`
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/store/conditions.py` — `WriteCondition` hierarchy
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/store/adapters/base.py` — `EventStorageAdapter`, `EventSerialisationGuarantee`
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/store/adapters/memory/{adapter,db,locks}.py` — in-memory adapter
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/store/adapters/postgres/adapter.py` — Postgres adapter
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/store/transactions.py` — retry/ignore decorators
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/sources/{base,constrained,constraints,memory,factory/base}.py` — `EventSource` abstraction
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/query/{clauses,functions,queries,utilities}.py` — query DSL
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/persistence/converter.py` — `TypeRegistryConverter`
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/persistence/memory/converters/*.py` — in-memory query backend
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/persistence/postgres/{query,converters/*}.py` — Postgres query backend / SQL builder
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/projection/projector.py` — `Projector`
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/projection/store/{store,adapters/*}.py` — `ProjectionStore`
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/processing/consumers/{source,projection,subscription,state/*}.py` — consumers
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/processing/services/{types,polling,manager,status,error/*}.py` — services & error handling
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/processing/process/{base,multi}.py` — process status
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/processing/broker/{base,types,factories}.py` — broker contracts
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/processing/broker/strategies/singleton/*.py` — singleton strategy
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/processing/broker/strategies/distributed/{broker,coordinator,difference,observer,builder,factories}.py` — distributed strategy
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/processing/broker/strategies/distributed/subscribers/**`, `subscriptions/**` — shared subscriber/subscription state stores
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/processing/locks/{base,memory,postgres}.py` — distributed locking
- `/Users/john/Projects/ebury/event.store/src/logicblocks/event/testing/{builders,data}.py`, `utils/clock.py` — testing utilities
- `/Users/john/Projects/ebury/event.store/tests/shared/logicblocks/event/testcases/**` — shared adapter conformance suites
- `/Users/john/Projects/ebury/event.store/sql/*.sql` — Postgres schema
- `/Users/john/Projects/ebury/event.store/CHANGELOG.md`, `README.md`, `docs/index.md` — feature history and public API reference

## Architecture Insights

- **One query DSL, two use-sites, two backends**: the same `Clause`/`Query` types serve both the event store's constraint mechanism (a small subset: `SequenceNumberAfterConstraint`) and the full projection-store search API, each independently converted for in-memory and Postgres execution via a shared `TypeRegistryConverter` dispatch pattern. This is the single most reusable architectural idea in the codebase.
- **Checkpoints as events**: consumer progress is persisted as ordinary `"state-changed"` events in a dedicated stream, reusing the event store's own optimistic-concurrency machinery rather than inventing a separate storage mechanism — an elegant "eat your own dog food" design choice worth preserving.
- **Decouple compute-the-plan from execute-the-plan**: in the distributed broker, exactly one node (the leader) computes the global rebalance plan, but *every* node independently observes and applies only the parts of that plan relevant to its own locally-registered subscribers — a clean separation that avoids the leader needing direct RPC access to other nodes.
- **Immutable builder pattern used twice, independently**: both the Postgres SQL-builder AST (`persistence/postgres/query.py`) and the test-data builders (`testing/builders.py`) use the same "every mutator returns a new cloned instance" style — consistent with the frozen-dataclass-everywhere design throughout the codebase.
- **Protocol + fallback dispatch, not a closed typeclass hierarchy**: because Python lacks real typeclasses, the JSON/string conversion framework had to invent a runtime "protocol check → pass-through → fallback callback" 3-tier dispatch. A PureScript port gets to replace this with real typeclasses for the common case, but should deliberately decide how (or whether) to preserve the fallback escape hatch for values with no static instance.
- **Guarantees are explicit, opt-in trade-offs, not hidden defaults**: `EventSerialisationGuarantee` (Log/Category/Stream) makes the ordering-vs-concurrency trade-off a first-class, adapter-constructor-time choice rather than a fixed behaviour — worth preserving as an explicit parameter in the port rather than hardcoding one guarantee level.

## Open Questions

- Should the PureScript port preserve the *exact* naming-convention-based `Projector` handler dispatch (kebab-case event name → snake/camelCase method name via reflection), or switch to an explicit `Map EventName Handler`/pattern-matched sum-type dispatch, which fits PureScript's static, non-reflective style far better?
- Is the `Function` (e.g. `Similarity`) extensibility point (arbitrary user-defined functions usable in sort clauses) a hard requirement, or can the port start with a closed sum type and add extensibility later if needed? This materially affects whether the query DSL can be a plain closed ADT or needs an open/typeclass-based extension mechanism.
- Does the port need the full distributed broker (leader election, multi-node rebalancing) from day one, or can Phase 9 be deferred/scoped down to the Singleton strategy initially, given the majority of the value (append-only store, query DSL, projections) is usable without it?
- Should known Python-side bugs (list-mutation-during-iteration in subscriber-state purge; sub-second-only lock timeout conversion; unimplemented Postgres `EventSubscriptionStateStore.get()`) be treated as spec (port as-is for behavioural parity) or fixed opportunistically during the port?
- Is there an existing PureScript library in `/Users/john/Projects/johncowie/proto/lib/purescript-johncowie-postgres` or `purescript-johncowie-events` that already covers some of this ground and should be reused/extended rather than rebuilt from scratch? (Noted during setup but not investigated in this research pass.)

## Related Research

None found — this is the first research document in this repository (`meta/research/codebase` did not exist prior to this session).
