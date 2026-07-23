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
