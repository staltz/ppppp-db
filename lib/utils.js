// @ts-ignore
const atomic = require('atomic-file-rw')
const Path = require('path')

/**
 * @template T
 * @typedef {T extends void ?
 *   (...args: [Error] | []) => void :
 *   (...args: [Error] | [null, T]) => void
 * } CB
 */

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

class GhostDB {
  /** @type {string} */
  #basePath

  static encodingOpts = { encoding: 'utf-8' }

  /**
   * @param {string} basePath
   */
  constructor(basePath) {
    this.#basePath = basePath
  }

  /**
   * @param {string} tangleID
   */
  #path(tangleID) {
    return Path.join(this.#basePath, tangleID)
  }

  /**
   * @param {Map<string, number>} map
   * @returns {string}
   */
  #serialize(map) {
    return JSON.stringify([...map])
  }

  /**
   * @param {string} str
   * @returns {Map<string, number>}
   */
  #deserialize(str) {
    return new Map(JSON.parse(str))
  }

  /**
   * @param {string} tangleID
   * @param {string} msgID
   * @param {number} depth
   * @param {number} max
   * @param {CB<void>} cb
   */
  save(tangleID, msgID, depth, max, cb) {
    atomic.readFile(
      this.#path(tangleID),
      GhostDB.encodingOpts,
      (/** @type {any} */ err, /** @type {any} */ str) => {
        // Load Map
        /** @type {Map<string, number>} */
        let map;
        if (err && err.code === 'ENOENT') map = new Map()
        // prettier-ignore
        else if (err) return cb(new Error('GhostDB.save() failed to read ghost file', { cause: err }))
        else map = this.#deserialize(str)

        map.set(msgID, depth)

        // Garbage collect any ghost smaller than largestDepth - max
        let largestDepth = -1
        for (const depth of map.values()) {
          if (depth > largestDepth) largestDepth = depth
        }
        for (const [x, depth] of map.entries()) {
          if (depth <= largestDepth - max) map.delete(x)
        }

        atomic.writeFile(
          this.#path(tangleID),
          this.#serialize(map),
          GhostDB.encodingOpts,
          (/** @type {any} */ err) => {
            // prettier-ignore
            if (err) return cb(new Error('GhostDB.save() failed to write ghost file', { cause: err }))
            else cb()
          }
        )
      }
    )
  }

  /**
   * @param {string} tangleID
   * @param {CB<Map<string, number>>} cb
   */
  read(tangleID, cb) {
    atomic.readFile(
      this.#path(tangleID),
      GhostDB.encodingOpts,
      (/** @type {any} */ err, /** @type {any} */ str) => {
        // prettier-ignore
        if (err) return cb(new Error('GhostDB.read() failed to read ghost file', { cause: err }))
        const map = this.#deserialize(str)

        cb(null, map)
      }
    )
  }
}

module.exports = { ReadyGate, GhostDB }
