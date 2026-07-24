module EventStore.Event
  ( NewEvent
  , newEvent
  , newEvent'
  , serialise
  , summarise
  , StoredEvent
  , serialiseStored
  , summariseStored
  ) where

import Prelude
import Data.Maybe (Maybe(..), fromMaybe)
import Data.DateTime.Instant (Instant)
import Data.UUID (UUID)
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
-- | When observedAt is omitted, it defaults to the given occurredAt (if any),
-- | otherwise to the Clock's current time. occurredAt defaults to the
-- | (possibly just-defaulted) observedAt when omitted.
newEvent'
  :: forall c name payload metadata
   . Clock c
  => c
  -> name
  -> payload
  -> metadata
  -> Maybe Instant
  -> Maybe Instant
  -> Effect (NewEvent name payload metadata)
newEvent' clock name payload metadata maybeObservedAt maybeOccurredAt = do
  observedAt <- case maybeObservedAt, maybeOccurredAt of
    Just t, _ -> pure t
    Nothing, Just occurredAt -> pure occurredAt
    Nothing, Nothing -> now clock
  let occurredAt = fromMaybe observedAt maybeOccurredAt
  pure { name, payload, metadata, observedAt, occurredAt }

serialise :: forall name payload metadata. NewEvent name payload metadata -> NewEvent name payload metadata
serialise = identity

summarise
  :: forall name payload metadata
   . NewEvent name payload metadata
  -> { name :: name, observedAt :: Instant, occurredAt :: Instant }
summarise e = { name: e.name, observedAt: e.observedAt, occurredAt: e.occurredAt }

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
