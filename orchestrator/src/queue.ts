/** Serializes async work onto a single FIFO queue. nargo/bb write to a
 * shared target/ directory per circuit, so concurrent proof generation for
 * the same circuit would clobber each other's witness/proof files -- every
 * real proving or chain call goes through one of these. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => {});
    return result;
  }
}
