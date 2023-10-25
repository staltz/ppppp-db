const FS = require('fs')
const Path = require('path')
// @ts-ignore
const atomic = require('atomic-file-rw')
// @ts-ignore
const multicb = require('multicb')

// TODO: fs is only supported in node.js. We should support browser by replacing
// fs.readdir with a browser "file" that just lists all ghost files.

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

  get isReady() {
    return this.#ready
  }
}

class GhostDB {
  /** @type {string} */
  #basePath

  /** @type {ReadyGate} */
  #loaded

  /** @type {Map<string, Map<string, number>>} */
  #maps

  static encodingOpts = { encoding: 'utf-8' }

  /**
   * @param {string} basePath
   */
  constructor(basePath) {
    this.#basePath = basePath
    this.#maps = new Map()
    this.#loaded = new ReadyGate()

    // Load all ghosts files into Maps in memory
    // TODO this is opening up ALL the files at once, perhaps we should allow a
    // specific max concurrent number of reads? i.e. not fully sequential
    // neither fully parallel
    if (FS.existsSync(basePath)) {
      const done = multicb({ pluck: 1 })
      FS.readdirSync(basePath).forEach((tangleID) => {
        const cb = done()
        this.#read(tangleID, (err, map) => {
          // prettier-ignore
          if (err) return cb(new Error('GhostDB failed to read ghost file', { cause: err }))
          this.#maps.set(tangleID, map)
          cb()
        })
      })
      done((/** @type {any} */ err) => {
        // prettier-ignore
        if (err) throw new Error('GhostDB failed to load', { cause: err })
        this.#loaded.setReady()
      })
    } else {
      this.#loaded.setReady()
    }
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
   * @param {CB<Map<string, number>>} cb
   */
  #read(tangleID, cb) {
    atomic.readFile(
      this.#path(tangleID),
      GhostDB.encodingOpts,
      (/** @type {any} */ err, /** @type {any} */ str) => {
        // Load Map
        /** @type {Map<string, number>} */
        let map
        if (err && err.code === 'ENOENT') map = new Map()
        // prettier-ignore
        else if (err) return cb(new Error('GhostDB.read() failed to read ghost file', { cause: err }))
        else map = this.#deserialize(str)

        cb(null, map)
      }
    )
  }

  /**
   * @param {() => void} cb
   */
  onReady(cb) {
    this.#loaded.onReady(cb)
  }

  /**
   * @param {string} tangleID
   * @param {string} msgID
   * @param {number} depth
   * @param {number} max
   * @param {CB<void>} cb
   */
  save(tangleID, msgID, depth, max, cb) {
    this.#loaded.onReady(() => {
      if (!this.#maps.has(tangleID)) this.#maps.set(tangleID, new Map())
      const map = /** @type {Map<string, number>} */ (this.#maps.get(tangleID))
      const newMap = new Map(map)
      newMap.set(msgID, depth)

      // Garbage collect any ghost smaller than largestDepth - max
      let largestDepth = -1
      for (const depth of newMap.values()) {
        if (depth > largestDepth) largestDepth = depth
      }
      for (const [x, depth] of newMap.entries()) {
        if (depth <= largestDepth - max) newMap.delete(x)
      }

      atomic.writeFile(
        this.#path(tangleID),
        this.#serialize(newMap),
        GhostDB.encodingOpts,
        (/** @type {any} */ err) => {
          // prettier-ignore
          if (err) return cb(new Error('GhostDB.save() failed to write ghost file', { cause: err }))
          this.#maps.set(tangleID, newMap)
          cb()
        }
      )
    })
  }

  /**
   * @param {string} tangleID
   * @returns {Map<string, number>}
   */
  read(tangleID) {
    if (!this.#loaded.isReady) {
      throw new Error('GhostDB.read() called before loaded')
    }
    return this.#maps.get(tangleID) ?? new Map()
  }
}

module.exports = { ReadyGate, GhostDB }
