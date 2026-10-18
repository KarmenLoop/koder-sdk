import type { KoderEvent, RunResult } from "../index.d.ts";

type Push = (event: KoderEvent) => void;

// One agent turn. Iterate it for live events, or await it for the final result.
// The event log is kept for the whole turn, so late or multiple readers see every event.
export class Run<T = RunResult> implements AsyncIterable<KoderEvent>, PromiseLike<T> {
  #events: KoderEvent[] = [];
  #done = false;
  #error: unknown = null;
  #failed = false;
  #wake = new Set<() => void>();
  #promise: Promise<T>;
  #cancel: () => Promise<void> | void;

  constructor(start: (push: Push) => Promise<T>, { cancel }: { cancel?: () => Promise<void> | void } = {}) {
    this.#cancel = cancel || (() => {});
    const push: Push = (event) => {
      this.#events.push(event);
      this.#notify();
    };
    this.#promise = Promise.resolve()
      .then(() => start(push))
      .then(
        (result) => {
          this.#done = true;
          this.#notify();
          return result;
        },
        (error) => {
          this.#done = true;
          this.#failed = true;
          this.#error = error;
          this.#notify();
          throw error;
        },
      );
    // Callers that only iterate must not crash the process with an unhandled rejection.
    this.#promise.catch(() => {});
  }

  #notify(): void {
    for (const wake of this.#wake) wake();
    this.#wake.clear();
  }

  result(): Promise<T> {
    return this.#promise;
  }

  then<A = T, B = never>(onFulfilled?: ((value: T) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return this.#promise.then(onFulfilled, onRejected);
  }

  catch<B = never>(onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<T | B> {
    return this.#promise.catch(onRejected);
  }

  finally(onFinally?: (() => void) | null): Promise<T> {
    return this.#promise.finally(onFinally);
  }

  async cancel(): Promise<void> {
    await this.#cancel();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<KoderEvent> {
    let index = 0;
    for (;;) {
      while (index < this.#events.length) yield this.#events[index++];
      if (this.#done) {
        if (this.#failed) throw this.#error;
        return;
      }
      await new Promise<void>((resolve) => this.#wake.add(resolve));
    }
  }
}
