module Test.EventStore.Event (spec) where

import Prelude

import Data.DateTime.Instant (Instant, instant)
import Data.Maybe (Maybe(..))
import Data.Time.Duration (Milliseconds(..))
import Data.UUID (UUID, parseUUID)
import Effect.Class (liftEffect)
import Partial.Unsafe (unsafeCrashWith)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

import EventStore.Clock (StaticClock(..))
import EventStore.Event (StoredEvent, newEvent, newEvent', summariseStored)

fixedInstant :: Instant
fixedInstant = mkInstant 1690000000000.0

otherInstant :: Instant
otherInstant = mkInstant 1700000000000.0

mkInstant :: Number -> Instant
mkInstant ms = case instant (Milliseconds ms) of
  Just i -> i
  Nothing -> unsafeCrashWith "invalid fixed instant"

fixedId :: UUID
fixedId = case parseUUID "e5f8c9d0-1234-4abc-8def-0123456789ab" of
  Just u -> u
  Nothing -> unsafeCrashWith "invalid fixed UUID"

mkStoredEvent :: StoredEvent String String String
mkStoredEvent =
  { id: fixedId
  , name: "event-name"
  , payload: "payload"
  , metadata: "metadata"
  , stream: "stream-a"
  , category: "category-a"
  , position: 0
  , sequenceNumber: 0
  , observedAt: fixedInstant
  , occurredAt: fixedInstant
  }

spec :: Spec Unit
spec = do
  newEventSpec
  storedEventSpec

newEventSpec :: Spec Unit
newEventSpec = describe "NewEvent" do
  it "defaults both timestamps to the Clock's current time when neither is supplied" do
    let clock = StaticClock fixedInstant
    event <- liftEffect $ newEvent clock "event-name" "payload" "metadata"
    event.observedAt `shouldEqual` fixedInstant
    event.occurredAt `shouldEqual` fixedInstant

  it "defaults observedAt to occurredAt when only occurredAt is supplied" do
    let clock = StaticClock fixedInstant
    event <- liftEffect $ newEvent' clock "event-name" "payload" "metadata" Nothing (Just otherInstant)
    event.occurredAt `shouldEqual` otherInstant
    event.observedAt `shouldEqual` otherInstant

  it "uses both timestamps as given when both are supplied explicitly" do
    let clock = StaticClock fixedInstant
    event <- liftEffect $ newEvent' clock "event-name" "payload" "metadata" (Just fixedInstant) (Just otherInstant)
    event.observedAt `shouldEqual` fixedInstant
    event.occurredAt `shouldEqual` otherInstant

  it "produces deterministic, assertable timestamps under a StaticClock" do
    let clock = StaticClock fixedInstant
    event1 <- liftEffect $ newEvent clock "event-name" "payload" "metadata"
    event2 <- liftEffect $ newEvent clock "event-name" "payload" "metadata"
    event1 `shouldEqual` event2

  it "considers two events with identical fields equal, and events differing in a field unequal" do
    let clock = StaticClock fixedInstant
    eventA <- liftEffect $ newEvent clock "event-name" "payload" "metadata"
    eventB <- liftEffect $ newEvent clock "event-name" "payload" "metadata"
    eventC <- liftEffect $ newEvent clock "other-name" "payload" "metadata"
    eventA `shouldEqual` eventB
    (eventA == eventC) `shouldEqual` false

storedEventSpec :: Spec Unit
storedEventSpec = describe "StoredEvent" do
  it "summarise excludes payload/metadata but retains all other fields" do
    let event = mkStoredEvent
    let summary = summariseStored event
    summary.id `shouldEqual` event.id
    summary.stream `shouldEqual` event.stream
    summary.category `shouldEqual` event.category
    summary.position `shouldEqual` event.position
    summary.sequenceNumber `shouldEqual` event.sequenceNumber
    summary.observedAt `shouldEqual` event.observedAt
    summary.occurredAt `shouldEqual` event.occurredAt

  it "considers two StoredEvents with identical fields equal, and events differing in a field unequal" do
    let eventA = mkStoredEvent
    let eventB = mkStoredEvent
    let eventC = mkStoredEvent { position = 1 }
    eventA `shouldEqual` eventB
    (eventA == eventC) `shouldEqual` false

  it "has an id field that is a purescript-uuid UUID value, not a bare string" do
    let event = mkStoredEvent
    event.id `shouldEqual` fixedId
