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
function compareMsgHashes(a, b) {
  return a.localeCompare(b)
}

class Tangle {
  /**
   * @type {string}
   */
  #rootHash

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
   * @param {string} rootHash
   */
  constructor(rootHash) {
    this.#rootHash = rootHash
    this.#maxDepth = 0
  }

  /**
   * @param {string} msgHash
   * @param {Msg} msg
   */
  add(msgHash, msg) {
    if (msgHash === this.#rootHash && !this.#rootMsg) {
      this.#tips.add(msgHash)
      this.#perDepth.set(0, [msgHash])
      this.#depth.set(msgHash, 0)
      this.#rootMsg = msg
      return
    }

    const tangles = msg.metadata.tangles
    if (msgHash !== this.#rootHash && tangles[this.#rootHash]) {
      if (this.#depth.has(msgHash)) return
      this.#tips.add(msgHash)
      const prev = tangles[this.#rootHash].prev
      for (const p of prev) {
        this.#tips.delete(p)
      }
      this.#prev.set(msgHash, prev)
      const depth = tangles[this.#rootHash].depth
      if (depth > this.#maxDepth) this.#maxDepth = depth
      this.#depth.set(msgHash, depth)
      const atDepth = this.#perDepth.get(depth) ?? []
      atDepth.push(msgHash)
      atDepth.sort(compareMsgHashes)
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
      for (const msgHash of atDepth) {
        sorted.push(msgHash)
      }
    }
    return sorted
  }

  /**
   * @returns {Set<string>}
   */
  getTips() {
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
   * @param {string} msgHash
   * @returns {boolean}
   */
  has(msgHash) {
    return this.#depth.has(msgHash)
  }

  /**
   * @param {string} msgHash
   * @returns {number}
   */
  getDepth(msgHash) {
    return this.#depth.get(msgHash) ?? -1
  }

  isFeed() {
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return false
    }
    if (this.#rootMsg.data) return false
    const metadata = this.#rootMsg.metadata
    if (metadata.dataSize > 0) return false
    if (metadata.dataHash !== null) return false
    if (metadata.identityTips !== null) return false
    return true
  }

  getFeed() {
    if (!this.isFeed()) return null
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return null
    }
    const { identity, domain } = this.#rootMsg.metadata
    return { identity, domain }
  }

  /**
   * @param {string} msgHash
   */
  shortestPathToRoot(msgHash) {
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return []
    }
    const path = []
    let current = msgHash
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
        } else if (d === minDepth && compareMsgHashes(p, min) < 0) {
          min = p
        }
      }
      path.push(min)
      current = min
    }
    return path
  }

  /**
   * @param {string} msgHashA
   * @param {string} msgHashB
   */
  precedes(msgHashA, msgHashB) {
    if (!this.#rootMsg) {
      console.trace('Tangle is missing root message')
      return false
    }
    if (msgHashA === msgHashB) return false
    if (msgHashB === this.#rootHash) return false
    let toCheck = [msgHashB]
    while (toCheck.length > 0) {
      const prev = this.#prev.get(/** @type {string} */ (toCheck.shift()))
      if (!prev) continue
      if (prev.includes(msgHashA)) return true
      toCheck.push(...prev)
    }
    return false
  }

  size() {
    return this.#depth.size
  }

  getMaxDepth() {
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
