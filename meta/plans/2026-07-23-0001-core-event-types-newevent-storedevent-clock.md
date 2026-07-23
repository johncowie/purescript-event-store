---
type: plan
id: "2026-07-23-0001-core-event-types-newevent-storedevent-clock"
title: "Core Event Types: NewEvent, StoredEvent, and Injectable Clock Implementation Plan"
date: "2026-07-23T21:23:26+00:00"
author: John Cowie Del Corral
producer: create-plan
status: draft
work_item_id: "work-item:0001"
parent: "work-item:0001"
revision: "4e2470dca6ad8b3284373f1493ae4e68c667a0bc"
repository: "event-store"
last_updated: "2026-07-23T21:23:26+00:00"
last_updated_by: John Cowie Del Corral
schema_version: 1
---

# Core Event Types: NewEvent, StoredEvent, and Injectable Clock Implementation Plan

## Overview

Bootstrap the `event-store` PureScript project from an empty repository (currently only `meta/` documentation exists) and implement the foundational event value types from work item `0001`: an unsent `NewEvent`, a persisted `StoredEvent`, and the injectable `Clock` typeclass that governs `NewEvent`'s bi-temporal timestamp defaulting.

## Current State Analysis

The repository contains no PureScript scaffolding whatsoever — no `spago.yaml`/`spago.dhall`, no `src/`, no `test/`, no toolchain configuration. This plan starts from nothing.

Two sibling libraries by the same author (`/Users/john/Projects/johncowie/proto/lib/purescript-johncowie-events`, `purescript-johncowie-postgres`) were surveyed for conventions but use the legacy Dhall-based Spago toolchain (`spago.dhall`, package set `psc-0.15.4-20221026`, PureScript `^0.15.13`) and a `JohnCowie.*` module namespace. Per discussion, this project deliberately diverges from both: it adopts the current registry-based Spago toolchain rather than matching the older sibling toolchain, and uses an `EventStore.*` module namespace rather than `JohnCowie.*`, since neither sibling library is a dependency of this project (`purescript-johncowie-events` was investigated and rejected as a base in work item 0001's Context section — it's a 63-line skeleton with no reusable code).

### Key Discoveries:

- Current PureScript/Spago toolchain versions (verified July 2026): `purs` 0.15.16, Spago 1.0.4 (Rust-based, registry-driven, `spago.yaml` config — the old Haskell/Dhall Spago is deprecated, moved to `purescript/spago-legacy`).
- `purescript-spec` 8.1.2 and `purescript-uuid` 9.0.0 are both current registry packages compatible with `purs` 0.15.0–0.15.16.
- `mise`'s npm backend (`mise.jdx.dev/dev-tools/backends/npm.html`) can pin npm-published tools (`purescript`, `spago`, `purs-tidy`) directly in `mise.toml`'s `[tools]` section without a separate `package.json` — avoids two sources of truth for tool versions. Node itself is a mise core tool.
- `mise`'s `[tasks]` TOML syntax (`mise.jdx.dev/tasks/toml-tasks.html`) supports a `run` command and a `depends` list of prerequisite tasks, functionally replacing a Makefile.

## Desired End State

A working PureScript project where:
- `mise install` provisions Node, `purs`, `spago`, and `purs-tidy` at pinned versions.
- `mise run build` compiles the project; `mise run test` runs the test suite; `mise run format` formats source with `purs-tidy`.
- `EventStore.Clock` exposes a `Clock` typeclass with `SystemClock` and `StaticClock` instances.
- `EventStore.Event` exposes `NewEvent`/`StoredEvent` records matching the work item's Requirements, with `serialise`/`summarise` functions and derived `Eq`.
- A `purescript-spec` test suite covers every Acceptance Criterion in work item 0001, structured as `describe`/`it` blocks whose Given/When/Then phrasing mirrors the work item directly.
- CI (GitHub Actions) runs `mise install` then `mise run build` and `mise run test` on every push/PR.

Verification: `mise run test` exits 0 and its output shows one passing spec example per Acceptance Criterion bullet in the work item.

### Key Discoveries:

- No existing code to reconcile with — this is a from-scratch bootstrap, so "current implementation" constraints don't apply; the main risk is toolchain/config correctness (spago.yaml schema, mise npm-backend syntax) rather than integration with existing code.

## What We're NOT Doing

- Event source identifiers (`LogIdentifier`/`CategoryIdentifier`/`StreamIdentifier`) — separate roadmap item (Phase 1, item 2). `StoredEvent.stream`/`category` remain plain `String` values in this plan.
- The JSON conversion typeclass framework (`ToJson`/`FromJson`) — separate roadmap item. `serialise`/`summarise` return plain PureScript records in this plan, not JSON values.
- Any event store, adapter, or publish/read behaviour — this plan is data types + Clock only.
- Retiring/archiving the `purescript-johncowie-events` skeleton spike — noted in the work item as out of scope, a separate housekeeping action.
- A `package.json`/npm-based toolchain — superseded by `mise.toml`'s npm backend per this plan's tooling decision.

## Implementation Approach

Four phases, each independently buildable and testable: bootstrap the project and toolchain first (nothing else can proceed without it), then `Clock` (a dependency of `NewEvent`'s defaulting behaviour), then `NewEvent`, then `StoredEvent`. Each of the three code phases ends with `purescript-spec` tests directly traceable to the work item's Acceptance Criteria.

---

## Phase 1: Project Bootstrap

### Overview

Stand up the PureScript project and its toolchain from scratch: `mise` for tool version management and task running, `spago.yaml` for the PureScript package/build config, directory scaffolding, and CI.

### Changes Required:

#### 1. `mise.toml`

**File**: `mise.toml` (repo root)
**Changes**: New file. Pins Node (mise core tool) and PureScript toolchain binaries via mise's npm backend, and defines `install`, `build`, `test`, `format`, `clean` tasks.

```toml
[tools]
node = "22"
"npm:purescript" = "0.15.16"
"npm:spago" = "1.0.4"
"npm:purs-tidy" = "latest"

[tasks.build]
description = "Compile the project"
run = "spago build"

[tasks.test]
description = "Run the test suite"
depends = ["build"]
run = "spago test"

[tasks.format]
description = "Format all PureScript sources"
run = "purs-tidy format-in-place 'src/**/*.purs' 'test/**/*.purs'"

[tasks.format-check]
description = "Check formatting without writing changes"
run = "purs-tidy check 'src/**/*.purs' 'test/**/*.purs'"

[tasks.clean]
description = "Remove build output"
run = "rm -rf output .spago"
```

#### 2. `spago.yaml`

**File**: `spago.yaml` (repo root)
**Changes**: New file. Registry-based Spago config, package name `event-store`, main dependencies (`prelude`, `effect`, `console`, `maybe`, `uuid`), test dependencies add `spec`.

```yaml
package:
  name: event-store
  dependencies:
    - prelude
    - effect
    - console
    - maybe
    - uuid
  test:
    main: Test.Main
    dependencies:
      - spec
workspace:
  packageSet:
    registry: latest
  extraPackages: {}
```

(`spago init` / `spago build` will resolve `registry: latest` to a concrete pinned version in the generated lockfile on first run — commit the resulting lockfile.)

#### 3. Directory scaffolding

**Files**:
- `src/EventStore/Clock.purs` — placeholder module (`module EventStore.Clock where`) until Phase 2 fills it in.
- `test/Test/Main.purs` — `purescript-spec` runner entry point:

```purescript
module Test.Main where

import Prelude

import Effect (Effect)
import Effect.Aff (launchAff_)
import Test.Spec.Reporter (consoleReporter)
import Test.Spec.Runner (runSpec)

main :: Effect Unit
main = launchAff_ $ runSpec [ consoleReporter ] do
  pure unit
```

(The `do` block's spec groups are added incrementally in Phases 2–4; `pure unit` is a placeholder removed once the first `describe` block lands.)

#### 4. `.gitignore` additions

**File**: `.gitignore`
**Changes**: Append PureScript/mise-specific ignores to the existing single-line file.

```
.spago/
output/
.mise/
```

#### 5. CI workflow

**File**: `.github/workflows/ci.yml`
**Changes**: New file. Installs mise, then runs the build and test tasks on push/PR.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jdx/mise-action@v2
      - run: mise run build
      - run: mise run test
```

### Success Criteria:

#### Automated Verification:

- [x] `mise install` completes successfully and provisions `node`, `purs`, `spago`, `purs-tidy`
- [x] `mise run build` compiles the (placeholder) project with no errors
- [x] `mise run test` runs the placeholder test suite and exits 0
- [x] `mise run format-check` passes on the scaffolded files

#### Manual Verification:

- [x] `spago.yaml` and the generated lockfile are committed and reproducible on a clean checkout (`git clone` + `mise install` + `mise run build` from scratch)
- [ ] CI workflow runs successfully on GitHub Actions once pushed (not verifiable until this branch is pushed)

#### Deviations from plan (Phase 1):

- `node = "22"` did not work: `spago` 1.0.4 uses `node:sqlite`, which on Node 22.12.0 requires the `--experimental-sqlite` flag (throws `ERR_UNKNOWN_BUILTIN_MODULE` without it). Node 24.12.0 exposes it without the flag. Bumped `mise.toml` to `node = "24"`.
- `workspace.packageSet.registry: latest` is not a valid value — Spago needs a concrete package-set version. Ran `spago init` to resolve the current one (`78.0.0`) and used that.
- Added `now` and `datetime` to `spago.yaml`'s main dependencies (not listed in the plan's dependency list) — required for `Effect.Now` and `Data.DateTime.Instant`, both used by Phase 2's `Clock` module.
- Added `spec-node` as a test dependency and switched `test/Test/Main.purs` from `Test.Spec.Runner.runSpec` to `Test.Spec.Runner.Node.runSpecAndExitProcess` — the plan's `runSpec` + `launchAff_` combination is deprecated in `spec` 8.1.2 (`runSpec` now warns to use `spec-node`'s runner, which also gives correct process exit codes for CI).
- Added `.purs-repl` and `.spec-results/` to `.gitignore` (spago/spec-node scratch output not covered by the plan's `.gitignore` list).

---

## Phase 2: `Clock` Typeclass

### Overview

Implement the injectable `Clock` typeclass with `SystemClock` and `StaticClock`, per work item 0001's Requirements and Technical Notes (typeclass-based, not an explicit threaded value or effect row).

### Changes Required:

#### 1. `EventStore.Clock` module

**File**: `src/EventStore/Clock.purs`
**Changes**: Replace placeholder with the typeclass and two instances.

```purescript
module EventStore.Clock
  ( class Clock
  , now
  , SystemClock(..)
  , StaticClock(..)
  ) where

import Prelude
import Effect (Effect)
import Effect.Now as Now
import Data.DateTime.Instant (Instant)

class Clock c where
  now :: c -> Effect Instant

data SystemClock = SystemClock

instance Clock SystemClock where
  now SystemClock = Now.now

newtype StaticClock = StaticClock Instant

instance Clock StaticClock where
  now (StaticClock instant) = pure instant
```

Add `now` (core, for `SystemClock`) as a `spago.yaml` dependency if not already transitively available; confirm via `spago build` during implementation.

#### 2. Tests

**File**: `test/Test/EventStore/Clock.purs`
**Changes**: New file, `purescript-spec` spec covering Clock determinism.

```purescript
module Test.EventStore.Clock (spec) where

import Prelude
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)
import EventStore.Clock (class Clock, now, StaticClock(..))
-- construct a fixed Instant for the fixture

spec :: Spec Unit
spec = describe "Clock" do
  describe "StaticClock" do
    it "always returns the fixed instant it was constructed with" do
      -- given a StaticClock fixed to a known instant
      -- when `now` is called (possibly more than once)
      -- then it returns that same instant every time
      pure unit -- replaced with real assertion during implementation
```

Wire `Test.EventStore.Clock.spec` into `test/Test/Main.purs`'s `runSpec` block (`describe "EventStore" do EventStoreClock.spec`, or similar composition), replacing the `pure unit` placeholder from Phase 1.

### Success Criteria:

#### Automated Verification:

- [x] `mise run build` compiles `EventStore.Clock` with no errors
- [x] `mise run test` passes, including the new `Clock` spec examples
- [x] `mise run format-check` passes

#### Manual Verification:

- [ ] Confirm `StaticClock`'s fixed-instant behaviour is usable ergonomically from a test that also constructs a `NewEvent` (spot-checked once Phase 3 lands, not blocking Phase 2 completion)

#### Deviations from plan (Phase 2):

- Test fixture builds the fixed `Instant` via `case instant ms of Just i -> i; Nothing -> unsafeCrashWith ...` rather than `fromMaybe (unsafeCrashWith ...) (instant ms)` — PureScript's compiled JS evaluates function arguments eagerly, so `unsafeCrashWith` as a `fromMaybe` default argument crashes unconditionally, even on the `Just` branch. The `case` form only evaluates it on `Nothing`.

---

## Phase 3: `NewEvent`

### Overview

Implement `NewEvent`, generic over name/payload/metadata, with `Clock`-based timestamp defaulting, `Eq`, and `serialise`/`summarise`.

### Changes Required:

#### 1. `EventStore.Event` module

**File**: `src/EventStore/Event.purs`
**Changes**: New file.

```purescript
module EventStore.Event
  ( NewEvent
  , newEvent
  , newEvent'
  ) where

import Prelude
import Data.Maybe (Maybe(..), fromMaybe)
import Data.DateTime.Instant (Instant)
import Effect (Effect)
import EventStore.Clock (class Clock, now)

type NewEvent name payload metadata =
  { name :: name
  , payload :: payload
  , metadata :: metadata
  , observedAt :: Instant
  , occurredAt :: Instant
  }

-- | Construct a NewEvent, defaulting both timestamps from the given Clock.
newEvent
  :: forall c name payload metadata
   . Clock c
  => c
  -> name
  -> payload
  -> metadata
  -> Effect (NewEvent name payload metadata)
newEvent clock name payload metadata = newEvent' clock name payload metadata Nothing Nothing

-- | Construct a NewEvent with optional explicit timestamps.
-- | occurredAt defaults to observedAt when omitted; observedAt defaults to
-- | the Clock's current time when omitted.
newEvent'
  :: forall c name payload metadata
   . Clock c
  => c
  -> name
  -> payload
  -> metadata
  -> Maybe Instant -- ^ explicit observedAt
  -> Maybe Instant -- ^ explicit occurredAt
  -> Effect (NewEvent name payload metadata)
newEvent' clock name payload metadata maybeObservedAt maybeOccurredAt = do
  observedAt <- case maybeObservedAt of
    Just t -> pure t
    Nothing -> now clock
  let occurredAt = fromMaybe observedAt maybeOccurredAt
  pure { name, payload, metadata, observedAt, occurredAt }
```

(`Eq` on `NewEvent` falls out of the underlying record's field types deriving `Eq` — no explicit instance needed since `NewEvent` is a type alias over a record, not a `newtype`; if a `newtype` wrapper is introduced instead during implementation for stronger type identity, add `derive newtype instance Eq` or `derive instance Eq` accordingly.)

`summarise`/`serialise` for `NewEvent` are deferred to a plain-record identity function and a payload/metadata-dropping projection respectively — confirm during implementation whether these need their own named functions here or whether `StoredEvent`'s equivalents (Phase 4) are the only ones the work item actually requires (the work item's Requirements describe `serialise`/`summarise` for "both types" — implement both here and in Phase 4).

```purescript
serialise :: forall name payload metadata. NewEvent name payload metadata -> NewEvent name payload metadata
serialise = identity

summarise :: forall name payload metadata. NewEvent name payload metadata -> { name :: name, observedAt :: Instant, occurredAt :: Instant }
summarise e = { name: e.name, observedAt: e.observedAt, occurredAt: e.occurredAt }
```

#### 2. Tests

**File**: `test/Test/EventStore/Event.purs`
**Changes**: New file (extended further in Phase 4), one `describe "NewEvent"` block with one `it` per Acceptance Criterion bullet relevant to `NewEvent`:

- no timestamps supplied → both equal Clock's current time
- explicit `occurredAt`, no `observedAt` → `observedAt` defaults to `occurredAt`
- both supplied explicitly → both used as given, no defaulting
- `StaticClock` fixed instant → deterministic, assertable timestamps
- two `NewEvent` values with identical fields → equal; differing field → not equal

Wire into `test/Test/Main.purs`.

### Success Criteria:

#### Automated Verification:

- [x] `mise run build` compiles `EventStore.Event` (NewEvent portion) with no errors
- [x] `mise run test` passes, including all `NewEvent`-related spec examples
- [x] `mise run format-check` passes

#### Manual Verification:

- [ ] Manually construct a `NewEvent` with a domain-specific payload type (not just a primitive) in a scratch REPL session to confirm the generic type parameters behave as expected

#### Deviations from plan (Phase 3):

- **Resolved a Requirements/Acceptance-Criteria conflict in work item 0001** (flagged to and resolved by the user): the Requirements section says `observedAt` always defaults from the `Clock` when omitted, and `occurredAt` defaults from `observedAt`. Acceptance Criteria bullet 2 says that when `occurredAt` is given but `observedAt` is not, `observedAt` defaults to the given `occurredAt` — the opposite direction. User chose the Acceptance Criteria's behavior. `newEvent'`'s defaulting logic (`src/EventStore/Event.purs`) now back-fills `observedAt` from `occurredAt` when `observedAt` is omitted and `occurredAt` is given, falling back to `Clock`'s current time only when *both* are omitted; this differs from the plan's original code sample, which only ever consulted the Clock when `observedAt` was omitted.

---

## Phase 4: `StoredEvent`

### Overview

Implement `StoredEvent`, extending the same name/payload/metadata generality with `id` (UUID), `stream`, `category`, `position`, `sequenceNumber`, plus `Eq` and `serialise`/`summarise`.

### Changes Required:

#### 1. Extend `EventStore.Event` module

**File**: `src/EventStore/Event.purs`
**Changes**: Add `StoredEvent` type and its `serialise`/`summarise`.

```purescript
import Data.UUID (UUID)

type StoredEvent name payload metadata =
  { id :: UUID
  , name :: name
  , payload :: payload
  , metadata :: metadata
  , stream :: String
  , category :: String
  , position :: Int
  , sequenceNumber :: Int
  , observedAt :: Instant
  , occurredAt :: Instant
  }

serialiseStored :: forall name payload metadata. StoredEvent name payload metadata -> StoredEvent name payload metadata
serialiseStored = identity

summariseStored
  :: forall name payload metadata
   . StoredEvent name payload metadata
  -> { id :: UUID, name :: name, stream :: String, category :: String, position :: Int, sequenceNumber :: Int, observedAt :: Instant, occurredAt :: Instant }
summariseStored e =
  { id: e.id
  , name: e.name
  , stream: e.stream
  , category: e.category
  , position: e.position
  , sequenceNumber: e.sequenceNumber
  , observedAt: e.observedAt
  , occurredAt: e.occurredAt
  }
```

(No default-filling constructor per the work item — `StoredEvent` values are built by directly constructing the record literal; confirm during implementation whether a plain constructor function is still useful for ergonomics even without defaulting, or whether direct record construction is preferred/idiomatic enough to skip one.)

Function naming (`serialise`/`serialiseStored`, `summarise`/`summariseStored`) is a placeholder to avoid a name clash between the `NewEvent` and `StoredEvent` versions in the same module — resolve to whatever the implementation actually needs (e.g. typeclass-based dispatch, or qualified imports) during coding; not a design decision this plan needs to pre-commit to given the JSON-framework work (which will likely subsume these anyway) hasn't landed yet.

#### 2. Tests

**File**: `test/Test/EventStore/Event.purs`
**Changes**: Extend with a `describe "StoredEvent"` block covering:

- `summarise` excludes `payload`/`metadata`, retains all other fields
- `Eq`: identical field values → equal; differing field → not equal
- `id` field is a `purescript-uuid` `UUID` value

### Success Criteria:

#### Automated Verification:

- [x] `mise run build` compiles the full `EventStore.Event` module with no errors
- [x] `mise run test` passes, including all `StoredEvent`-related spec examples — every Acceptance Criterion bullet in work item 0001 now has a corresponding passing test
- [x] `mise run format-check` passes

#### Manual Verification:

- [x] Read through the full test suite output once and confirm each Acceptance Criterion bullet from work item 0001 is traceable to exactly one spec example (no gaps, no criterion silently dropped) — 9/9 tests pass, one per AC bullet (see Deviations note on the two `NewEvent`-timestamp-related bullets sharing the resolved defaulting logic)

#### Deviations from plan (Phase 4):

- **`purescript-uuid`'s FFI requires the npm `uuid` package at runtime** (`import { v4 } from "uuid"` in its compiled `foreign.js`), which the plan's no-`package.json` toolchain decision didn't account for (that decision was about *tool-version management*, not runtime FFI dependencies). Flagged to and resolved by the user: added a minimal `package.json` (`{"name": "event-store", "private": true, "dependencies": {"uuid": "^9.0.0"}}`), committed the resulting `package-lock.json`, gitignored `node_modules/`, and added a `mise.toml` `npm-install` task that `build` now depends on. Verified with a full clean rebuild (`rm -rf output .spago node_modules && mise run test`) that this reproduces from scratch.
- Function naming resolved as `serialiseStored`/`summariseStored` (plain qualified names), per the plan's own note that this was left open for implementation.
- No separate default-filling constructor was added for `StoredEvent` (matches the plan/work-item's "no default-filling constructor" note) — record literals and record-update syntax (`mkStoredEvent { position = 1 }` in tests) are used directly.

---

## Testing Strategy

### Unit Tests:

- One `purescript-spec` `describe` block per type (`Clock`, `NewEvent`, `StoredEvent`), one `it` per Acceptance Criterion bullet from work item 0001.
- Edge cases: no timestamps given, only one of the two given, both given explicitly; equality on identical vs. differing records.

### Integration Tests:

- Not applicable at this phase — no store/adapter exists yet to integrate against. Deferred to later roadmap items.

### Manual Testing Steps:

1. Clone the repo fresh, run `mise install`, then `mise run build` and `mise run test` — confirm a first-time contributor can get a working environment with just those three commands.
2. In a scratch `spago repl` session, construct a `NewEvent` with a `StaticClock` and inspect the resulting record to sanity-check field shapes match the work item's Requirements.

## Performance Considerations

None — these are plain immutable records with no I/O beyond reading the system clock (`SystemClock`'s `now`).

## Migration Notes

Not applicable — greenfield project, no existing data or consumers.

## References

- Original work item: `meta/work/0001-core-event-types-newevent-storedevent-clock.md`
- Roadmap: `meta/roadmap/2026-07-23-event-store-purescript-port-roadmap.md` (Phase 1, item 1)
- Research: `meta/research/codebase/2026-07-23-event-store-feature-catalog.md`
