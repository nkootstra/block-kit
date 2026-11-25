import { expect } from "vitest";

/** CPU time used by this thread so far, in milliseconds (the whole process before Node 23.9). */
function cpuNow(): number {
  const { user, system } = process.threadCpuUsage?.() ?? process.cpuUsage();
  return (user + system) / 1000;
}

/**
 * How much CPU time `run` takes, in milliseconds. Unlike the time on the clock, it doesn't count
 * the time the machine spends on other work: on a busy machine a run can wait tens of
 * milliseconds for a turn, more than the run itself takes.
 */
export function cpuTime(run: () => void): number {
  const start = cpuNow();
  run();
  return cpuNow() - start;
}

/**
 * How long `run(size)` takes against `run(size / 4)`, in CPU time: the fastest of three runs of
 * each, taken in turns.
 *
 * Timing tests guard against hostile input that makes the work grow faster than the input. A
 * fixed bound in milliseconds can't tell that from a slow or busy machine, so these compare the
 * work at two sizes instead, which holds however fast the machine runs.
 */
export function growth(
  run: (size: number) => void,
  size: number,
): { small: number; large: number } {
  let small = Infinity;
  let large = Infinity;
  for (let turn = 0; turn < 3; turn++) {
    small = Math.min(
      small,
      cpuTime(() => run(Math.floor(size / 4))),
    );
    large = Math.min(
      large,
      cpuTime(() => run(size)),
    );
  }
  return { small, large };
}

/**
 * Fails when `run` grows faster than linearly from `size / 4` to `size`. Linear work takes about 4
 * times as long at 4 times the size and quadratic work about 16 times, so the bound is 8 times,
 * plus a few milliseconds for work too small to time.
 */
export function expectLinearTime(run: (size: number) => void, size: number): void {
  const { small, large } = growth(run, size);
  expect(
    large,
    `${large.toFixed(1)} ms at ${size}, ${small.toFixed(1)} ms at a quarter`,
  ).toBeLessThan(8 * small + 20);
}

/**
 * Fails when `run` takes time that grows with `size`, for work that should stop at a cap: at 4
 * times the size, linear work takes about 4 times as long, so the bound is twice as long, plus a
 * few milliseconds.
 */
export function expectCappedTime(run: (size: number) => void, size: number): void {
  const { small, large } = growth(run, size);
  expect(
    large,
    `${large.toFixed(1)} ms at ${size}, ${small.toFixed(1)} ms at a quarter`,
  ).toBeLessThan(2 * small + 20);
}
