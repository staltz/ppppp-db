const isMoot = require('./is-moot')

/**
 * @typedef {import("./index").Msg} Msg
 */

/**
 * @param {number} n
 */
function lipmaa(n) {
  let m = 1
  let po3 = 3
  let u = n

  // find k such that (3^k - 1)/2 >= n
  while (m < n) {
    po3 *= 3
    m = (po3 - 1) / 2
  }

  // find longest possible backjump
  po3 /= 3
  if (m !== n) {
    while (u !== 0) {
      m = (po3 - 1) / 2
      po3 /= 3
      u %= m
    }

    if (m !== po3) {
      po3 = m
    }
  }

  return n - po3
}

/**
 * @param {string} a
 * @param {string} b
 * @returns number
 */
function compareMsgIDs(a, b) {
  return a.localeCompare(b)
}

class Tangle {
  /**
   * @type {string}
   */
  #rootID

  /**
   * @type {Msg | undefined}
   */
  #rootMsg

  /**
   * @type {Set<string>}
   */
  #tips = new Set()

  /**
   * @type {Map<string, Array<string>>}
   */
  #prev = new Map()

  /**
   * @type {Map<string, number>}
   */
  #depth = new Map()

  /**
   * @type {Map<number, Array<string>>}
   */
  #perDepth = new Map()

  /**
   * @type {number}
   */
  #maxDepth

  /**
   * @param {string} rootID
   */
  constructor(rootID) {
    this.#rootID = rootID
    this.#maxDepth = 0
  }

  /**
   * @param {string} msgID
   * @param {Msg} msg
   */
  add(msgID, msg) {
    if (msgID === this.#rootID && !this.#rootMsg) {
      this.#tips.add(msgID)
      this.#perDepth.set(0, [msgID])
      this.#depth.set(msgID, 0)
      this.#rootMsg = msg
      return
    }

    const tangles = msg.metadata.tangles
    if (msgID !== this.#rootID && tangles[this.#rootID]) {
      if (this.#depth.has(msgID)) return
      this.#tips.add(msgID)
      const prev = tangles[this.#rootID].prev
      for (const p of prev) {
        this.#tips.delete(p)
      }
      this.#prev.set(msgID, prev)
      const depth = tangles[this.#rootID].depth
      if (depth > this.#maxDepth) this.#maxDepth = depth
      this.#depth.set(msgID, depth)
      const atDepth = this.#perDepth.get(depth) ?? []
      atDepth.push(msgID)
      atDepth.sort(compareMsgIDs)
      this.#perDepth.set(depth, atDepth)
      return
    }
  }

  /**
   * @param {number} depth
   * @returns {Array<string>}
   */
  #getAllAtDepth(depth) {
    return this.#perDepth.get(depth) ?? []
  }

  /**
   * @returns {Array<string>}
   */
  topoSort() {
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return []
    }
    const sorted = []
    const max = this.#maxDepth
    for (let i = 0; i <= max; i++) {
      const atDepth = this.#getAllAtDepth(i)
      for (const msgID of atDepth) {
        sorted.push(msgID)
      }
    }
    return sorted
  }

  /**
   * @returns {Set<string>}
   */
  get tips() {
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return new Set()
    }
    return this.#tips
  }

  /**
   * @param {number} depth
   * @returns {Set<string>}
   */
  getLipmaaSet(depth) {
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return new Set()
    }
    const lipmaaDepth = lipmaa(depth + 1) - 1
    return new Set(this.#getAllAtDepth(lipmaaDepth))
  }

  /**
   * @param {string} msgID
   * @returns {boolean}
   */
  has(msgID) {
    return this.#depth.has(msgID)
  }

  /**
   * @param {string} msgID
   * @returns {number}
   */
  getDepth(msgID) {
    return this.#depth.get(msgID) ?? -1
  }

  isFeed() {
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return false
    }
    return isMoot(this.#rootMsg)
  }

  get mootDetails() {
    if (!this.isFeed()) return null
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return null
    }
    const { account, domain } = this.#rootMsg.metadata
    return { account, domain, id: this.#rootID }
  }

  /**
   * @param {string} msgID
   */
  shortestPathToRoot(msgID) {
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return []
    }
    const path = []
    let current = msgID
    while (true) {
      const prev = this.#prev.get(current)
      if (!prev) break
      let minDepth = /** @type {number} */ (this.#depth.get(current))
      let min = current
      for (const p of prev) {
        const d = /** @type {number} */ (this.#depth.get(p))
        if (d < minDepth) {
          minDepth = d
          min = p
        } else if (d === minDepth && compareMsgIDs(p, min) < 0) {
          min = p
        }
      }
      path.push(min)
      current = min
    }
    return path
  }

  /**
   * @param {string} msgAID
   * @param {string} msgBID
   */
  precedes(msgAID, msgBID) {
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return false
    }
    if (msgAID === msgBID) return false
    if (msgBID === this.#rootID) return false
    let toCheck = [msgBID]
    while (toCheck.length > 0) {
      const prev = this.#prev.get(/** @type {string} */ (toCheck.shift()))
      if (!prev) continue
      if (prev.includes(msgAID)) return true
      toCheck.push(...prev)
    }
    return false
  }

  get size() {
    return this.#depth.size
  }

  get maxDepth() {
    return this.#maxDepth
  }

  debug() {
    let str = ''
    const max = this.#maxDepth
    for (let i = 0; i <= max; i++) {
      const atDepth = this.#getAllAtDepth(i)
      str += `Depth ${i}: ${atDepth.join(', ')}\n`
    }
    return str
  }
}

module.exports = Tangle
