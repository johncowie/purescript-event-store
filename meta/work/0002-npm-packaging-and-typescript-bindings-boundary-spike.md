---
type: work-item
id: "0002"
title: "npm Packaging and TypeScript Bindings Boundary Spike"
date: "2026-07-24T08:50:36+00:00"
author: John Cowie Del Corral
producer: create-work-item
status: draft
kind: spike
priority: medium
tags: [event-store, purescript-port, cross-language, packaging, typescript, spike]
last_updated: "2026-07-24T08:50:36+00:00"
last_updated_by: John Cowie Del Corral
schema_version: 1
---

# 0002: npm Packaging and TypeScript Bindings Boundary Spike

**Kind**: Spike
**Status**: Draft
**Priority**: Medium
**Author**: John Cowie Del Corral

## Summary

Investigate and prototype how this PureScript library gets packaged and
published to npm such that TypeScript/JavaScript consumers get a
TS-ergonomic experience, without compromising the PureScript core's
typeclass-based extensibility. This is the standing cross-language design
constraint from `CLAUDE.md` becoming concrete work: work item 0001 already
surfaced the friction (typeclass dictionaries, curried functions, `Maybe`
instead of `undefined`) via a hand-authored `.d.ts`/`test/ts/` suite: this
spike decides and proves the boundary that resolves it.

## Context

`CLAUDE.md` establishes a non-negotiable principle: the PureScript core's
typeclass-based extensibility (the `Clock` typeclass today, others later)
must never be redesigned, restricted, or watered down for TS ergonomics — a
PureScript consumer must always be able to write new typeclass instances
exactly as before. TS/JS ergonomics are to be achieved via an *additive*
wrapper/bindings layer on top of the untouched core, never by changing the
core API itself.

Work item 0001 implemented `EventStore.Clock` and `EventStore.Event` and, in
the course of proving the TS experience, added `types/*.d.ts` and
`test/ts/*.test.ts` that exercise the *raw* compiled output directly. Those
tests are deliberately awkward — they document real friction:

- `now`/`newEvent`/`newEvent'` take a typeclass dictionary (e.g.
  `clockStaticClock`) as an explicit first argument, not a method call.
- Every function is curried into single-argument calls rather than taking
  one options object; because generic type parameters (`Name`, `Payload`,
  `Metadata`) only appear in nested return positions, TypeScript cannot
  infer them from a fully-applied call chain the way it would for an
  uncurried function — callers need explicit type arguments.
- `newEvent'`'s optional timestamps are `Maybe Instant`, not
  `Instant | undefined` — a TS caller has to reach into PureScript's own
  `Nothing`/`Just` runtime representation to call it.

Prior-art research (see References) confirms this isn't a solved problem
elsewhere either: ReScript's `genType` — the most mature comparable
tool — still falls back to a runtime currying shim for curried functions;
Elm ports sidestep the problem by restricting interop to JSON messages
entirely; Scala.js and `purescript-ts-bridge` both use manual, per-member/
per-type opt-in annotations rather than automatic whole-module translation.
No ecosystem has fully automated away the typeclass-dictionary/currying
problem — the consistent, load-bearing pattern everywhere is a deliberate,
hand-maintained reshaping boundary. `CLAUDE.md`'s existing hand-authored-
wrapper stance is in line with this, not an overly cautious guess.

## Requirements

- Prototype [`purescript-ts-bridge`](https://github.com/m-bock/purescript-ts-bridge)
  against `EventStore.Clock`'s and `EventStore.Event`'s public types; produce
  a documented adopt/defer/reject decision with concrete reasoning (e.g.
  annotation overhead vs. the hand-written `.d.ts` approach already in
  place).
- Compare `spago bundle` (esbuild-wrapped, opinionated) against raw
  [`esbuild-plugin-purescript`](https://www.npmjs.com/package/esbuild-plugin-purescript)
  for turning the compiler's `output/` directory into an npm-publishable
  artifact. Record findings on ESM/CJS dual-output support, tree-shaking
  behaviour, and bundle size for the current modules.
- Decide single-package-with-curated-exports vs. a separate wrapper package
  (e.g. `event-store` vs. `@event-store/ts`), weighing versioning/publishing
  overhead against discoverability.
- Design and build a wrapper/bindings layer prototype covering
  `EventStore.Clock` and `EventStore.Event` that:
  - Is strictly additive: `src/EventStore/Clock.purs` and
    `src/EventStore/Event.purs` are unchanged; the `Clock` typeclass remains
    fully definable/extensible by PureScript consumers exactly as before.
  - Hides the typeclass-dictionary mechanism from TS callers — e.g.
    exposing `systemClock()`/`staticClock(instant)` constructor functions
    and a pre-applied `now`, rather than requiring `clockSystemClock`/
    `clockStaticClock` dictionaries at the call site.
  - Replaces curried multi-argument functions and `Maybe`-typed optional
    parameters with a single options-object signature using
    `T | undefined` at the wrapper boundary for `newEvent`/`newEvent'`.
- Prove the prototype via a real external-consumer simulation: `npm pack`
  the prototype package and install it into a *separate* scratch TS
  project (not a workspace symlink within this repo), then write a TS test
  there that constructs a `NewEvent` and calls the `StoredEvent` summarise
  operation using only plain TS types at the call site.
- Write up the outcome as a decision record (this repo uses `/create-adr`
  for architecture decisions) covering the bundler choice, the
  ts-bridge decision, the package-structure decision, and the wrapper's
  design, so future work items building on `EventStore`/adapters/
  projections inherit a settled answer instead of re-litigating it.

## Acceptance Criteria

- Given the wrapper/bindings prototype, when `src/EventStore/Clock.purs`
  and `src/EventStore/Event.purs` are inspected after the spike, then they
  are byte-for-byte unchanged from their pre-spike state — no new
  constraints or restrictions have been introduced on PureScript-side
  typeclass extensibility for the sake of the wrapper.
- Given the wrapper prototype package built via the chosen bundling
  approach, when `npm pack`-ed and installed into a fresh scratch TS
  project, then a TS test in that scratch project constructs a `NewEvent`
  and calls the `StoredEvent` summarise operation using plain TS types only
  at the call site — no typeclass dictionary argument, no `Data.Maybe`
  construction, no more than one level of currying to supply per logical
  argument.
- Given `purescript-ts-bridge` prototyped against the current two modules,
  when evaluated, then a documented adopt/defer/reject decision with
  concrete reasoning exists.
- Given `spago bundle` and `esbuild-plugin-purescript` each tried against
  the current `output/` directory, when compared, then a documented
  comparison of ESM/CJS support, tree-shaking behaviour, and bundle size
  exists.
- Given the single-package-vs-separate-package question, when weighed, then
  a documented decision with rationale exists.
- Given the spike's outcome, when written up, then an ADR exists capturing
  the bundler choice, the ts-bridge decision, the package-structure
  decision, and the wrapper's design.

## Open Questions

- Does the eventual package need CJS support, or is ESM-only acceptable
  given this is a new library with no existing CJS consumers to support?

## Dependencies

- Blocked by: none — the two modules it prototypes against (`EventStore.Clock`,
  `EventStore.Event`) already exist (work item 0001).
- Blocks: none formally yet, but its outcome should inform the API design of
  every subsequent public-module work item (event source identifiers, the
  JSON conversion framework, the `EventStore`/adapter API surface) — those
  work items should reference the resulting ADR rather than re-deciding the
  packaging boundary independently.

## Assumptions

- "Proves the TS experience works" means an `npm pack` + fresh-install
  simulation of a real external consumer, not just importing from
  `node_modules` inside this monorepo — the closest proxy available short
  of an actual registry publish.
- Scoped to today's two modules (`EventStore.Clock`, `EventStore.Event`);
  the recommendation should generalize to future modules, but validation is
  only against what exists now.
- Full production npm publish/release process (versioning strategy, CI
  publish workflow, actual registry publish) is out of scope — this spike
  proves the shape works technically, it doesn't ship a release.

## Technical Notes

- The `Clock` typeclass's compiled JS shape (dictionary-passing, e.g.
  `now(clockStaticClock)(clock)()`) and `NewEvent`/`StoredEvent`'s
  curried/`Maybe`-based signatures are documented in detail in
  `types/EventStore.Clock.d.ts`, `types/EventStore.Event.d.ts`,
  `types/Data.Maybe.d.ts`, and exercised in `test/ts/Clock.test.ts` /
  `test/ts/Event.test.ts` — read these first, they're the concrete
  starting point for the wrapper's design.
- `spago bundle` wraps esbuild and is the current de facto standard for
  PureScript projects (README-documented, `--bundle-type app|module`,
  `--platform browser|node`); `esbuild-plugin-purescript` operates directly
  on `output/` for cases needing more control than spago's defaults offer.
  Rollup did not appear as a live alternative in current PureScript
  community material.
- `purescript-ts-bridge` works via typeclass instances you write per exposed
  type, then a generated CLI emits `.d.ts` — real and actively maintained,
  but opt-in per type rather than a zero-effort whole-project generator.

## Drafting Notes

- **Core-API-first principle**: the wrapper/bindings layer is additive
  only — it must never constrain or restrict the PureScript-facing
  typeclass API. This was an explicit call from the work item's author
  during drafting and has been promoted into `CLAUDE.md`'s
  cross-language-compatibility section as a standing, repo-wide principle,
  not just a constraint scoped to this one spike.
- Kind chosen as `spike` (over a concrete implementation story) because
  only two modules exist today (per work item 0001) and the packaging
  approach needs to generalize across modules that don't exist yet —
  committing to a specific wrapper-package shape now risks needing rework
  once more of the library lands.
- Treating "prove it" as requiring an actual `npm pack` + separate-project
  install (not a symlinked/workspace import) — this is a meaningfully
  higher bar than "it type-checks in this repo" and was chosen because
  that's exactly the gap the existing `test/ts/` suite (which imports
  `output/` directly, not a packaged artifact) cannot itself close.
- No package-structure preference was expressed up front — left as a
  requirement of the spike itself, to be decided from the bundler/
  packaging investigation rather than assumed.

## References

- Related: 0001 (implements the `EventStore.Clock`/`EventStore.Event`
  modules this spike prototypes against, and the `types/`/`test/ts/`
  suite this spike's outcome builds on or supersedes)
- `purescript-ts-bridge`: https://github.com/m-bock/purescript-ts-bridge
- `esbuild-plugin-purescript`: https://www.npmjs.com/package/esbuild-plugin-purescript
- ReScript `genType` (currying limitations as precedent):
  https://v11.rescript-lang.org/docs/manual/v11.0.0/typescript-integration
- Elm ports (JSON-message-only interop as the opposite end of the
  spectrum): https://guide.elm-lang.org/interop/ports.html
- Scala.js JS export annotations (manual per-member opt-in precedent):
  https://www.scala-js.org/doc/interoperability/export-to-javascript.html
