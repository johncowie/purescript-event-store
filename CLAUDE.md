# event-store

A PureScript event-sourcing library — an append-only event log with
log/category/stream scoping, pluggable storage adapters (in-memory +
Postgres), a projection/read-model layer, and a distributed processing layer
for always-on event consumers. It's a PureScript port of the Python
`logicblocks.event.store` library (see `meta/research/codebase/` for the
full feature catalog this project is being built against).

## Status

Pre-implementation. `meta/` contains the research, roadmap, and work items;
no PureScript code has been written yet. See `meta/roadmap/` for the
phased build order and `meta/work/` for individual work items.

## Cross-language goal: PureScript core, first-class TypeScript/JavaScript usage

**This is a standing design constraint, not just a nice-to-have.** The
library's core is written in PureScript, but TypeScript and JavaScript
consumers must be able to use it as a normal npm dependency — not as a
"PureScript library that happens to also compile to JS," but as something
that feels native from a TS/JS call site (typed function signatures, plain
data shapes, no requirement to understand PureScript's runtime
representations to use it correctly).

Concretely, this means:

- **The PureScript core's typeclass-based extensibility is non-negotiable
  and must never be redesigned, restricted, or watered down for TS
  ergonomics.** A PureScript consumer must always be able to write new
  instances of this library's typeclasses (`Clock` today, others later)
  exactly as they would for any other PureScript library. TS/JS ergonomics
  are achieved by adding a wrapper/bindings layer on top of the untouched
  core, never by changing the core API itself. If a work item's only way to
  make something easier for TS callers is to weaken or remove typeclass
  polymorphism from the core, that is the wrong move — reach for an additive
  wrapper instead, or flag the tension explicitly rather than making the
  trade silently.
- **Public API surface should be interop-friendly by construction** — but
  only at the boundary layer described above, not by compromising the core.
  Prefer plain records/data over deeply nested typeclass-polymorphic
  signatures in wrapper/bindings modules meant for external consumption —
  PureScript's compiled JS output represents records as plain JS objects,
  which is the easy case; typeclass dictionaries, `newtype` wrappers, and
  curried multi-argument functions are the friction points for a TS caller
  and should be smoothed over by the wrapper rather than left for consumers
  to work around, and rather than eliminated from the core.
- **TypeScript type declarations are a first-class deliverable**, not an
  afterthought bolted on later. Every public module intended for external
  consumption should have accompanying `.d.ts` declarations that accurately
  describe its compiled-JS shape. There's no mature automatic
  PureScript→TypeScript declaration generator in the ecosystem as of this
  writing — expect these to be hand-authored/hand-maintained wrapper
  modules or declaration files, and treat keeping them in sync with the
  PureScript source as an explicit review concern, not something that just
  falls out of the build.
- **A dedicated bindings/packaging boundary is expected eventually** — likely
  a thin wrapper package (or a wrapper module within this package) exposing
  a curated, TS-ergonomic subset/reshaping of the full PureScript API, distinct
  from the "raw" compiled output. This wrapper is strictly additive — it
  never removes typeclass polymorphism from the core, it hides the
  typeclass-dictionary mechanism from TS callers while the core keeps using
  it. Don't design this speculatively ahead of need, but when a work item
  starts asking "how does a TS user call this," default to *reshaping at a
  boundary* over *asking TS users to learn PureScript idioms* — and see the
  npm packaging / bindings-boundary spike (once drafted) for the concrete
  investigation.
- When a work item's API design has a choice between "more idiomatic
  PureScript" and "meaningfully harder to consume from TypeScript," raise it
  explicitly rather than silently picking the PureScript-idiomatic option —
  this tension is expected to recur throughout the roadmap (e.g. the
  `Clock` typeclass, the query DSL's ADTs, the JSON conversion framework's
  typeclass dispatch are all boundary-relevant design points called out in
  the research/roadmap docs).

### Proving the TS experience: `types/` and `test/ts/`

Every public module gets a hand-authored declaration file in `types/`
(`types/EventStore.Clock.d.ts`, `types/EventStore.Event.d.ts`, ...) and a
corresponding TypeScript test in `test/ts/` that imports the *compiled*
PureScript output directly (`output/EventStore.Clock/index.js`, not a
wrapper) and exercises it the way a real TS caller would have to today. This
is deliberately a warts-and-all suite, not an aspirational one — it should
describe the raw compiled-JS shape (typeclass dictionaries, curried
functions, `Maybe` instead of `| undefined`) exactly as it is, so it fails
loudly if the compiled output's shape drifts from its `.d.ts`, and so the
friction it documents stays visible and concrete rather than living only as
prose in this file. `mise run test-ts` copies `types/*.d.ts` next to their
compiled module (`mise run copy-types`), type-checks `test/ts/` with `tsc
--noEmit`, and runs the suite with `vitest`; `mise run test-all` runs both
this and the PureScript spec suite, and is what CI runs.

When a work item adds or changes a public module, update both its `.d.ts`
and its `test/ts/` coverage as part of that work, the same way the
PureScript spec suite is expected to track Acceptance Criteria one-to-one.
This suite is the first rung of the bindings/packaging boundary mentioned
above, not a substitute for it — see `meta/work/` for the packaging
work item once one exists.

## Toolchain

Node's version and all task definitions live in [`mise`](https://mise.jdx.dev)
(`mise.toml`) rather than a Makefile. The PureScript toolchain itself
(`purescript`, `spago`, `purs-tidy`) is installed as npm `devDependencies` in
`package.json`, not via mise's npm backend — that backend was tried first but
turned out to skip the `purescript` npm package's `postinstall` step (which
downloads the real compiled `purs` binary) in CI, silently leaving a
placeholder stub; plain `npm install` runs postinstall scripts normally and
doesn't have this problem. `package.json` also carries `uuid`, the npm
package `purescript-uuid`'s FFI imports at runtime.

- `mise install` — provisions Node.
- `mise run build` — installs npm deps then compiles the project (`npx spago build`).
- `mise run test` — runs the PureScript test suite (`npx spago test`).
- `mise run test-ts` — copies `types/*.d.ts` next to their compiled module, type-checks and runs the TypeScript consumer-experience suite (`test/ts/`) — see below.
- `mise run test-all` — both of the above; this is what CI runs.
- `mise run format` / `mise run format-check` — `purs-tidy` formatting (`npx purs-tidy`).

PureScript project config is `spago.yaml` (current registry-based Spago,
not the deprecated Dhall/package-sets toolchain).

## Module & project conventions

- Module namespace: `EventStore.*` (not `JohnCowie.*` — this project
  deliberately diverges from the author's other PureScript libraries' naming
  convention since it isn't a dependency of them; see work item 0001's
  Drafting Notes).
- Test framework: [`purescript-spec`](https://github.com/purescript-spec/purescript-spec),
  `describe`/`it` blocks structured to mirror each work item's Given/When/Then
  Acceptance Criteria one-to-one, so a reviewer can trace test → criterion
  directly.
- `NewEvent` (unsent) vs `StoredEvent` (persisted, fully specified, produced
  only by the store) is a deliberate, load-bearing distinction carried over
  from the Python original — don't collapse these into one type.

## Working with this repo's planning docs

This repo uses the Accelerator plugin's `meta/` conventions:

- `meta/research/codebase/` — codebase research (the feature-catalog
  document this whole port is based on).
- `meta/roadmap/` — phase-grouped work-item candidates (informal planning
  docs, not formal work items themselves).
- `meta/work/` — formal work items (`/create-work-item`, `/refine-work-item`).
- `meta/plans/` — implementation plans (`/create-plan`, `/implement-plan`).

When starting a new roadmap item, use `/create-work-item` referencing the
relevant roadmap entry, then `/create-plan @meta/work/NNNN-....md` once the
work item is drafted.
