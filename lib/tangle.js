/**
 * @typedef {import("./plugin").Rec} Rec
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
   *
   * @param {string} rootHash
   * @param {Iterable<Rec>} recordsIter
   */
  constructor(rootHash, recordsIter) {
    this.#maxDepth = 0
    for (const rec of recordsIter) {
      const msgHash = rec.hash
      const tangles = rec.msg.metadata.tangles
      if (msgHash === rootHash) {
        this.#tips.add(msgHash)
        this.#perDepth.set(0, [msgHash])
        this.#depth.set(msgHash, 0)
      } else if (tangles[rootHash]) {
        this.#tips.add(msgHash)
        const prev = tangles[rootHash].prev
        for (const p of prev) {
          this.#tips.delete(p)
        }
        this.#prev.set(msgHash, prev)
        const depth = tangles[rootHash].depth
        if (depth > this.#maxDepth) this.#maxDepth = depth
        this.#depth.set(msgHash, depth)
        const atDepth = this.#perDepth.get(depth) ?? []
        atDepth.push(msgHash)
        atDepth.sort(compareMsgHashes)
        this.#perDepth.set(depth, atDepth)
      }
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
    const sorted = []
    const max = this.#maxDepth
    for (let i = 0; i <= max; i++) {
      const atDepth = this.#getAllAtDepth(i)
      if (atDepth.length === 0) break
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
    return this.#tips
  }

  /**
   * @param {number} depth
   * @returns {Set<string>}
   */
  getLipmaaSet(depth) {
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

  #shortestPathToRoot(msgHash) {
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

  getDeletablesAndEmptyables(msgHash) {
    const emptyables = this.#shortestPathToRoot(msgHash)
    const sorted = this.topoSort()
    const index = sorted.indexOf(msgHash)
    const deletables = sorted.filter(
      (msgHash, i) => i < index && !emptyables.includes(msgHash)
    )
    return { deletables, emptyables }
  }

  getMaxDepth() {
    return this.#maxDepth
  }
}

module.exports = Tangle
