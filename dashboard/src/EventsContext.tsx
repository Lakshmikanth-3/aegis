import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { subscribeFeed, type PaymentEvent } from "./api";

const EventsContext = createContext<PaymentEvent[]>([]);

/**
 * Subscribes to the orchestrator's SSE feed exactly once, at the app root,
 * so the full event history for this browser session survives navigating
 * between screens. Previously each screen (e.g. LiveSealedFeed) subscribed
 * independently and lost everything on unmount -- which meant an agent
 * detail drawer opened from the Treasury Console had no way to show
 * "recent activity" unless the user had also been sitting on the Live Feed
 * tab the whole time.
 */
export function EventsProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<PaymentEvent[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeFeed((event) => {
      setEvents((prev) => [...prev, event]);
    });
    return unsubscribe;
  }, []);

  return <EventsContext.Provider value={events}>{children}</EventsContext.Provider>;
}

export function useEvents(): PaymentEvent[] {
  return useContext(EventsContext);
}
