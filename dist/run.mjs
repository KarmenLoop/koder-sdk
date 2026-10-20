// Generated from src/run.ts by scripts/build.mjs. Edit the .ts source.




// One agent turn. Iterate it for live events, or await it for the final result.
// The event log is kept for the whole turn, so late or multiple readers see every event.
export class Run                                                                     {
  #events               = [];
  #done = false;
  #error          = null;
  #failed = false;
  #wake = new Set            ();
  #promise            ;
  #cancel                            ;

  constructor(start                            , { cancel }                                          = {}) {
    this.#cancel = cancel || (() => {});
    const push       = (event) => {
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

  #notify()       {
    for (const wake of this.#wake) wake();
    this.#wake.clear();
  }

  result()             {
    return this.#promise;
  }

  then                  (onFulfilled                                            , onRejected                                                   )                 {
    return this.#promise.then(onFulfilled, onRejected);
  }

  catch           (onRejected                                                   )                 {
    return this.#promise.catch(onRejected);
  }

  finally(onFinally                      )             {
    return this.#promise.finally(onFinally);
  }

  async cancel()                {
    await this.#cancel();
  }

  async *[Symbol.asyncIterator]()                            {
    let index = 0;
    for (;;) {
      while (index < this.#events.length) yield this.#events[index++];
      if (this.#done) {
        if (this.#failed) throw this.#error;
        return;
      }
      await new Promise      ((resolve) => this.#wake.add(resolve));
    }
  }
}
