module Test.Main where

import Prelude

import Effect (Effect)
import Test.Spec (describe)
import Test.Spec.Reporter (consoleReporter)
import Test.Spec.Runner.Node (runSpecAndExitProcess)

import Test.EventStore.Clock as EventStoreClock
import Test.EventStore.Event as EventStoreEvent

main :: Effect Unit
main = runSpecAndExitProcess [ consoleReporter ] do
  describe "EventStore" do
    EventStoreClock.spec
    EventStoreEvent.spec
