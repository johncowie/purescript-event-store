// Hand-authored declaration for the compiled output of src/EventStore/Clock.purs.
//
// This describes the RAW compiled-JS shape, not a TS-ergonomic API — see
// CLAUDE.md's cross-language-compatibility section. `Clock` is a PureScript
// typeclass; at the JS boundary that becomes an explicit "dictionary" object
// (`ClockDict`) that every caller must thread through by hand, and `now`
// itself is a two-argument curried function (dictionary, then instance)
// rather than a method on the instance. A TS caller can use this today, but
// it is exactly the kind of typeclass-shaped friction point CLAUDE.md expects
// a future bindings/wrapper module to smooth over.

/** PureScript's `Instant` is a newtype over `Milliseconds` over `Number` — at
 * runtime it IS a plain number (milliseconds since the Unix epoch). */
export type Instant = number;

/** PureScript's `Effect a` compiles to a thunk: call it to run the effect. */
export type Effect<A> = () => A;

/** The compiled form of the `Clock` typeclass's dictionary. */
export interface ClockDict<C> {
  now: (c: C) => Effect<Instant>;
}

/** `class Clock c where now :: c -> Effect Instant`, as a curried plain
 * function: `now(dict)(clockValue)()`. */
export declare function now<C>(dict: ClockDict<C>): (c: C) => Effect<Instant>;

/** `data SystemClock = SystemClock` — a nullary constructor, compiled to a
 * singleton class instance reachable via `SystemClock.value`. */
export declare class SystemClock {
  private constructor();
  static readonly value: SystemClock;
}

/** `newtype StaticClock = StaticClock Instant` — newtypes compile to the
 * identity function, so `StaticClock(instant)` just returns `instant`, and a
 * `StaticClock` value IS an `Instant` at runtime. */
export type StaticClock = Instant;
export declare function StaticClock(instant: Instant): StaticClock;

/** The `Clock SystemClock` instance dictionary — pass this as `now`'s first
 * argument to use a `SystemClock`. */
export declare const clockSystemClock: ClockDict<SystemClock>;

/** The `Clock StaticClock` instance dictionary — pass this as `now`'s first
 * argument to use a `StaticClock`. */
export declare const clockStaticClock: ClockDict<StaticClock>;
