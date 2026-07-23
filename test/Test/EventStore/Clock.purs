module Test.EventStore.Clock (spec) where

import Prelude

import Data.DateTime.Instant (Instant, instant)
import Data.Maybe (Maybe(..))
import Data.Time.Duration (Milliseconds(..))
import Effect.Class (liftEffect)
import Partial.Unsafe (unsafeCrashWith)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

import EventStore.Clock (StaticClock(..), now)

fixedInstant :: Instant
fixedInstant = case instant (Milliseconds 1690000000000.0) of
  Just i -> i
  Nothing -> unsafeCrashWith "invalid fixed instant"

spec :: Spec Unit
spec = describe "Clock" do
  describe "StaticClock" do
    it "always returns the fixed instant it was constructed with" do
      let clock = StaticClock fixedInstant
      result1 <- liftEffect $ now clock
      result2 <- liftEffect $ now clock
      result1 `shouldEqual` fixedInstant
      result2 `shouldEqual` fixedInstant
