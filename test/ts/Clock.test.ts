// Exercises EventStore.Clock the way a real TypeScript consumer would have
// to: importing the compiled output directly and following the hand-authored
// declarations in types/EventStore.Clock.d.ts. This is a living check on the
// TS *consumer experience*, not just a port of the PureScript spec — see
// CLAUDE.md's cross-language-compatibility section.
import { describe, expect, it } from "vitest";

import {
  clockStaticClock,
  now,
  StaticClock,
} from "../../output/EventStore.Clock/index.js";

describe("EventStore.Clock (TypeScript consumer)", () => {
  it("returns a StaticClock's fixed instant, threading the Clock dictionary by hand", () => {
    const fixedInstant = 1690000000000;
    const clock = StaticClock(fixedInstant);

    // Note the shape a TS caller is stuck with today: `now` takes the
    // typeclass dictionary first, then the clock value, then `()` to run
    // the resulting Effect thunk. There is no `clock.now()` method call.
    const result = now(clockStaticClock)(clock)();

    expect(result).toBe(fixedInstant);
  });
});
