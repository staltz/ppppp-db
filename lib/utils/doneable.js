/**
 * @template T
 * @typedef {import('../index').CB<T>} CB
 */

/**
 * @template T
 * @typedef {[] | [Error] | [null, T]} Args
 */

/**
 * @template T
 */
class Doneable {
  #waiting
  #done
  /** @type {Args<T> | null} */
  #args
  constructor() {
    this.#waiting = new Set()
    this.#done = false
    this.#args = null
  }

  /**
   * @param {CB<T>} cb
   */
  onDone(cb) {
    // @ts-ignore
    if (this.#done) cb(...this.#args)
    else this.#waiting.add(cb)
  }

  /**
   * @param {Args<T>=} args
   */
  done(args) {
    this.#done = true
    this.#args = args ?? []
    for (const cb of this.#waiting) cb(...this.#args)
    this.#waiting.clear()
  }

  get isDone() {
    return this.#done
  }
}

module.exports = Doneable
