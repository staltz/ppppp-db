class ReadyGate {
  #waiting
  #ready
  constructor() {
    this.#waiting = new Set()
    this.#ready = false
  }

  /**
   * @param {() => void} cb
   */
  onReady(cb) {
    if (this.#ready) cb()
    else this.#waiting.add(cb)
  }

  setReady() {
    this.#ready = true
    for (const cb of this.#waiting) cb()
    this.#waiting.clear()
  }
}

module.exports = { ReadyGate }
