import { useEffect, useState } from 'react';

/** Heure actuelle, rafraîchie à intervalle régulier (horloges, comptes à rebours). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
