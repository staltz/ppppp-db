const FS = require('fs')
const Path = require('path')
const atomic = require('atomic-file-rw')
const multicb = require('multicb')
const mutexify = require('mutexify')
const Doneable = require('./utils/doneable')

// TODO: fs is only supported in node.js. We should support browser by replacing
// fs.readdir with a browser "file" that just lists all ghost files.

/**
 * @typedef {import('./index').MsgID} MsgID
 */

/**
 * @template T
 * @typedef {import('mutexify').Mutexify<T>} Mutexify
 */

/**
 * @template T
 * @typedef {T extends void ?
 *   (...args: [Error] | []) => void :
 *   (...args: [Error] | [null, T]) => void
 * } CB
 */

class Ghosts {
  /** @type {string} */
  #basePath
  /** @type {Doneable<void>} */
  #loaded
  /** @type {Map<MsgID, Map<string, number>>} */
  #maps
  /** @type {Mutexify<void>} */
  #writeLock

  static encodingOpts = { encoding: 'utf-8' }

  /**
   * @param {string} basePath
   */
  constructor(basePath) {
    this.#basePath = basePath
    this.#maps = new Map()
    this.#loaded = new Doneable()
    this.#writeLock = mutexify()

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
      done((err, _) => {
        // prettier-ignore
        if (err) throw new Error('GhostDB failed to load', { cause: err })
        this.#loaded.done()
      })
    } else {
      this.#loaded.done()
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
    atomic.readFile(this.#path(tangleID), Ghosts.encodingOpts, (err, str) => {
      // Load Map
      /** @type {Map<string, number>} */
      let map
      if (err && err.code === 'ENOENT') map = new Map()
        // prettier-ignore
        else if (err) return cb(new Error('GhostDB.read() failed to read ghost file', { cause: err }))
        else map = this.#deserialize(str)

      cb(null, map)
    })
  }

  /**
   * @param {() => void} cb
   */
  onReady(cb) {
    this.#loaded.onDone(cb)
  }

  /**
   * @param {string} tangleID
   * @param {string} msgID
   * @param {number} depth
   * @param {number} span
   * @param {CB<void>} cb
   */
  save(tangleID, msgID, depth, span, cb) {
    this.#writeLock((unlock) => {
      this.#loaded.onDone(() => {
        if (!this.#maps.has(tangleID)) this.#maps.set(tangleID, new Map())
        const map = this.#maps.get(tangleID)
        const newMap = new Map(/** @type {Map<string, number>} */ (map))
        newMap.set(msgID, depth)

        // Garbage collect any ghost smaller than largestDepth - span
        let largestDepth = -1
        for (const depth of newMap.values()) {
          if (depth > largestDepth) largestDepth = depth
        }
        for (const [x, depth] of newMap.entries()) {
          if (depth <= largestDepth - span) newMap.delete(x)
        }

        atomic.writeFile(
          this.#path(tangleID),
          this.#serialize(newMap),
          Ghosts.encodingOpts,
          (err, _) => {
            // prettier-ignore
            if (err) return unlock(cb, new Error('GhostDB.save() failed to write ghost file', { cause: err }))
            this.#maps.set(tangleID, newMap)
            unlock(cb, null, void 0)
          }
        )
      })
    })
  }

  /**
   * @param {string} tangleID
   * @param {string} msgID
   * @param {CB<void>} cb
   */
  remove(tangleID, msgID, cb) {
    this.#writeLock((unlock) => {
      this.#loaded.onDone(() => {
        if (!this.#maps.has(tangleID)) return unlock(cb, null, void 0)

        const map = /** @type {Map<string, number>} */ (
          this.#maps.get(tangleID)
        )
        if (!map.has(msgID)) return unlock(cb, null, void 0)

        const newMap = new Map(map)
        newMap.delete(msgID)

        atomic.writeFile(
          this.#path(tangleID),
          this.#serialize(newMap),
          Ghosts.encodingOpts,
          (err, _) => {
            // prettier-ignore
            if (err) return unlock(cb,new Error('GhostDB.save() failed to write ghost file', { cause: err }))
            this.#maps.set(tangleID, newMap)
            unlock(cb, null, void 0)
          }
        )
      })
    })
  }

  /**
   * @param {string} tangleID
   * @returns {Map<string, number>}
   */
  read(tangleID) {
    if (!this.#loaded.isDone) {
      throw new Error('GhostDB.read() called before loaded')
    }
    return this.#maps.get(tangleID) ?? new Map()
  }
}

module.exports = Ghosts
