import { useState } from "react";

/**
 * The value, or while it's null the last value it had: what a tooltip that fades out keeps showing
 * after the pointer has left.
 */
export function useLastValue<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
