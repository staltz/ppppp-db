/**
 * @typedef {import("./index").Msg} Msg
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
   * @type {Msg}
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
   * @param {Iterable<Msg>} msgsIter
   */
  constructor(rootHash) {
    this.#rootHash = rootHash
    this.#maxDepth = 0
  }

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
      console.warn('Tangle is missing root message')
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
      console.warn('Tangle is missing root message')
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
      console.warn('Tangle is missing root message')
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
      console.warn('Tangle is missing root message')
      return false
    }
    if (this.#rootMsg.content) return false
    const metadata = this.#rootMsg.metadata
    return metadata.size === 0 && metadata.hash === null
  }

  getFeed() {
    if (!this.isFeed()) return null
    const { type, who } = this.#rootMsg.metadata
    return { type, who }
  }

  shortestPathToRoot(msgHash) {
    if (!this.#rootMsg) {
      console.warn('Tangle is missing root message')
      return []
    }
    const path = []
    let current = msgHash
    while (true) {
      const prev = this.#prev.get(current)
      if (!prev) break
      let minDepth = this.#depth.get(current)
      let min = current
      for (const p of prev) {
        const d = this.#depth.get(p)
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

  precedes(a, b) {
    if (!this.#rootMsg) {
      console.warn('Tangle is missing root message')
      return false
    }
    if (a === b) return false
    if (b === this.#rootHash) return false
    let toCheck = [b]
    while (toCheck.length > 0) {
      const prev = this.#prev.get(toCheck.shift())
      if (!prev) continue
      if (prev.includes(a)) return true
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
