class ReadyGate {
  #waiting
  #ready
  constructor() {
    this.#waiting = new Set()
    this.#ready = false
  }

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

function isEmptyObject(obj) {
  for (const _key in obj) {
    return false
  }
  return true
}

module.exports = { ReadyGate, isEmptyObject }
