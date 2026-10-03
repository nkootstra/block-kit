import { useEffect, useLayoutEffect } from "react";

/**
 * `useLayoutEffect` in the browser and `useEffect` on the server, where neither runs. React 18
 * warns about every `useLayoutEffect` it meets while server rendering; React 19 doesn't.
 */
export const useClientLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
