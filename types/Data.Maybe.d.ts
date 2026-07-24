// Hand-authored declaration for the small slice of PureScript's `Data.Maybe`
// (from the `maybe` package) that this project's public API surfaces.
//
// This is itself a cross-language-compatibility finding, not just plumbing:
// `NewEvent`'s optional-timestamp parameters are typed as `Maybe Instant`,
// not `Instant | undefined`/`Instant | null`. A TS caller has to reach into
// PureScript's own `Maybe` runtime representation (a `Nothing` singleton or a
// `Just` instance with a `value0` field) to call `newEvent'` at all — there
// is no plain-TS-shaped escape hatch today. See the packaging/bindings-
// boundary work item this motivated.

export declare class Nothing {
  private constructor();
  static readonly value: Nothing;
}

export declare class Just<A> {
  private constructor();
  readonly value0: A;
  static create<A>(value0: A): Just<A>;
}

export type Maybe<A> = Nothing | Just<A>;
