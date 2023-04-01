const path = require('path')
const push = require('push-stream')
const AAOL = require('async-append-only-log')
const promisify = require('promisify-4loc')
const Obz = require('obz')
const { ReadyGate } = require('./utils')
const { decrypt, reEncrypt } = require('./encryption')

exports.name = 'db'

exports.init = function initMemDB(ssb, config) {
  const hmacKey = null
  const msgs = []
  const feedFormats = new Map()
  const encryptionFormats = new Map()
  const onMsgAdded = Obz()

  const latestMsgPerFeed = {
    _map: new Map(), // feedId => nativeMsg
    preupdateFromKVT(kvtf, i) {
      const feedId = kvtf.feed ?? kvtf.value.author
      this._map.set(feedId, i)
    },
    commitAllPreupdates() {
      for (const i of this._map.values()) {
        if (typeof i === 'number') {
          this.updateFromKVT(msgs[i])
        }
      }
    },
    updateFromKVT(kvtf) {
      const feedId = kvtf.feed ?? kvtf.value.author
      const feedFormat = findFeedFormatForAuthor(feedId)
      if (!feedFormat) {
        console.warn('No feed format installed understands ' + feedId)
        return
      }
      const msg = reEncrypt(kvtf)
      const nativeMsg = feedFormat.toNativeMsg(msg.value, 'js')
      this._map.set(feedId, nativeMsg)
    },
    update(feedId, nativeMsg) {
      this._map.set(feedId, nativeMsg)
    },
    get(feedId) {
      return this._map.get(feedId) ?? null
    },
    has(feedId) {
      return this._map.has(feedId)
    },
    getAsKV(feedId, feedFormat) {
      const nativeMsg = this._map.get(feedId)
      if (!nativeMsg) return null
      const feedFormat2 = feedFormat ?? findFeedFormatForAuthor(feedId)
      if (!feedFormat2) {
        throw new Error('No feed format installed understands ' + feedId)
      }
      const key = feedFormat2.getMsgId(nativeMsg, 'js')
      const value = feedFormat2.fromNativeMsg(nativeMsg, 'js')
      return { key, value }
    },
    deleteKVT(kvtf) {
      const feedId = kvtf.feed ?? kvtf.value.author
      const nativeMsg = this._map.get(feedId)
      if (!nativeMsg) return
      const feedFormat = findFeedFormatForAuthor(feedId)
      if (!feedFormat) {
        console.warn('No feed format installed understands ' + feedId)
        return
      }
      const msgId = feedFormat.getMsgId(nativeMsg, 'js')
      if (msgId === kvtf.key) this._map.delete(feedId)
    },
    delete(feedId) {
      this._map.delete(feedId)
    },
  }

  const log = AAOL(path.join(config.path, 'memdb-log.bin'), {
    cacheSize: 1,
    blockSize: 64 * 1024,
    codec: {
      encode(msg) {
        return Buffer.from(JSON.stringify(msg), 'utf8')
      },
      decode(buf) {
        return JSON.parse(buf.toString('utf8'))
      },
    },
    validateRecord(buf) {
      try {
        JSON.parse(buf.toString('utf8'))
        return true
      } catch {
        return false
      }
    },
  })

  ssb.close.hook(function (fn, args) {
    log.close(() => {
      fn.apply(this, args)
    })
  })

  const scannedLog = new ReadyGate()
  // setTimeout to let ssb.db.* secret-stack become available
  setTimeout(() => {
    let i = -1
    log.stream({ offsets: true, values: true, sizes: true }).pipe(
      push.drain(
        function drainEach({ offset, value, size }) {
          i += 1
          if (!value) {
            // deleted record
            msgs.push(null)
            return
          }
          // TODO: for performance, dont decrypt on startup, instead decrypt on
          // demand, or decrypt in the background. Or then store the log with
          // decrypted msgs and only encrypt when moving it to the network.
          const msg = decrypt(value, ssb, config)
          msg.meta ??= {}
          msg.meta.offset = offset
          msg.meta.size = size
          msg.meta.seq = i
          msgs.push(msg)

          latestMsgPerFeed.preupdateFromKVT(msg, i)
        },
        function drainEnd(err) {
          // prettier-ignore
          if (err) throw new Error('Failed to initially scan the log', { cause: err });
          latestMsgPerFeed.commitAllPreupdates()
          scannedLog.setReady()
        }
      )
    )
  })

  function logAppend(key, value, feedId, isOOO, cb) {
    const kvt = {
      key,
      value,
      timestamp: Date.now(),
    }
    if (feedId !== value.author) kvt.feed = feedId
    if (isOOO) kvt.ooo = isOOO
    log.append(kvt, (err, newOffset) => {
      if (err) return cb(new Error('logAppend failed', { cause: err }))
      const offset = newOffset // latestOffset
      const size = Buffer.from(JSON.stringify(kvt), 'utf8').length
      const seq = msgs.length
      const kvtExposed = decrypt(kvt, ssb, config)
      kvt.meta = kvtExposed.meta = { offset, size, seq }
      msgs.push(kvtExposed)
      cb(null, kvt)
    })
  }

  function installFeedFormat(feedFormat) {
    if (!feedFormat.encodings.includes('js')) {
      // prettier-ignore
      throw new Error(`Failed to install feed format "${feedFormat.name}" because it must support JS encoding`)
    }
    feedFormats.set(feedFormat.name, feedFormat)
  }

  function installEncryptionFormat(encryptionFormat) {
    if (encryptionFormat.setup) {
      const loaded = new ReadyGate()
      encryptionFormat.setup(config, (err) => {
        // prettier-ignore
        if (err) throw new Error(`Failed to install encryption format "${encryptionFormat.name}"`, {cause: err});
        loaded.setReady()
      })
      encryptionFormat.onReady = loaded.onReady.bind(loaded)
    }
    encryptionFormats.set(encryptionFormat.name, encryptionFormat)
  }

  function findFeedFormatForAuthor(author) {
    for (const feedFormat of feedFormats.values()) {
      if (feedFormat.isAuthor(author)) return feedFormat
    }
    return null
  }

  function findFeedFormatForNativeMsg(nativeMsg) {
    for (const feedFormat of feedFormats.values()) {
      if (feedFormat.isNativeMsg(nativeMsg)) return feedFormat
    }
    return null
  }

  function findEncryptionFormatFor(ciphertextJS) {
    if (!ciphertextJS) return null
    if (typeof ciphertextJS !== 'string') return null
    const suffix = ciphertextJS.split('.').pop()
    const encryptionFormat = encryptionFormats.get(suffix) ?? null
    return encryptionFormat
  }

  function add(nativeMsg, cb) {
    const feedFormat = findFeedFormatForNativeMsg(nativeMsg)
    if (!feedFormat) {
      // prettier-ignore
      return cb(new Error('add() failed because no installed feed format understands the native message'))
    }
    const feedId = feedFormat.getFeedId(nativeMsg)
    const prevNativeMsg = latestMsgPerFeed.get(feedId)

    if (prevNativeMsg) {
      feedFormat.validate(nativeMsg, prevNativeMsg, hmacKey, validationCB)
    } else {
      feedFormat.validateOOO(nativeMsg, hmacKey, validationCB)
    }

    function validationCB(err) {
      // prettier-ignore
      if (err) return cb(new Error('add() failed validation for feed format ' + feedFormat.name, {cause: err}))
      const msgId = feedFormat.getMsgId(nativeMsg)
      const msgVal = feedFormat.fromNativeMsg(nativeMsg)
      latestMsgPerFeed.update(feedId, nativeMsg)

      logAppend(msgId, msgVal, feedId, false, (err, kvt) => {
        if (err) return cb(new Error('add() failed in the log', { cause: err }))

        onMsgAdded.set({
          kvt,
          nativeMsg,
          feedFormat: feedFormat.name,
        })
        cb(null, kvt)
      })
    }
  }

  function create(opts, cb) {
    const keys = opts.keys ?? config.keys

    const feedFormat = feedFormats.get(opts.feedFormat)
    const encryptionFormat = encryptionFormats.get(opts.encryptionFormat)
    // prettier-ignore
    if (!feedFormat) return cb(new Error(`create() does not support feed format "${opts.feedFormat}"`))
    // prettier-ignore
    if (!feedFormat.isAuthor(keys.id)) return cb(new Error(`create() failed because keys.id ${keys.id} is not a valid author for feed format "${feedFormat.name}"`))
    // prettier-ignore
    if (opts.content.recps) {
      if (!encryptionFormat) {
        return cb(new Error(`create() does not support encryption format "${opts.encryptionFormat}"`))
      }
    }
    if (!opts.content) return cb(new Error('create() requires a `content`'))

    // Create full opts:
    let provisionalNativeMsg
    try {
      provisionalNativeMsg = feedFormat.newNativeMsg({
        timestamp: Date.now(),
        ...opts,
        previous: null,
        keys,
      })
    } catch (err) {
      return cb(new Error('create() failed', { cause: err }))
    }
    const feedId = feedFormat.getFeedId(provisionalNativeMsg)
    const previous = latestMsgPerFeed.getAsKV(feedId, feedFormat)
    const fullOpts = {
      timestamp: Date.now(),
      ...opts,
      previous,
      keys,
      hmacKey,
    }

    // If opts ask for encryption, encrypt and put ciphertext in opts.content
    const recps = fullOpts.content.recps
    if (Array.isArray(recps) && recps.length > 0) {
      const plaintext = feedFormat.toPlaintextBuffer(fullOpts)
      const encryptOpts = {
        ...fullOpts,
        keys,
        recps,
        previous: previous ? previous.key : null,
      }
      let ciphertextBuf
      try {
        ciphertextBuf = encryptionFormat.encrypt(plaintext, encryptOpts)
      } catch (err) {
        // prettier-ignore
        return cb(new Error('create() failed to encrypt content', {cause: err}));
      }
      if (!ciphertextBuf) {
        // prettier-ignore
        return cb(new Error('create() failed to encrypt with ' + encryptionFormat.name))
      }
      const ciphertextBase64 = ciphertextBuf.toString('base64')
      fullOpts.content = ciphertextBase64 + '.' + encryptionFormat.name
    }

    // Create the native message:
    let nativeMsg
    try {
      nativeMsg = feedFormat.newNativeMsg(fullOpts)
    } catch (err) {
      return cb(new Error('create() failed', { cause: err }))
    }
    const msgId = feedFormat.getMsgId(nativeMsg)
    const msgVal = feedFormat.fromNativeMsg(nativeMsg, 'js')
    latestMsgPerFeed.update(feedId, nativeMsg)

    // Encode the native message and append it to the log:
    logAppend(msgId, msgVal, feedId, false, (err, kvt) => {
      // prettier-ignore
      if (err) return cb(new Error('create() failed to append the log', { cause: err }))
      onMsgAdded.set({
        kvt,
        nativeMsg,
        feedFormat: feedFormat.name,
      })
      cb(null, kvt)
    })
  }

  function del(msgId, cb) {
    const kvt = getKVT(msgId)
    latestMsgPerFeed.deleteKVT(kvt)
    msgs[kvt.meta.seq] = null
    log.onDrain(() => {
      log.del(kvt.meta.offset, cb)
    })
  }

  function filterAsPullStream(fn) {
    let i = 0
    return function source(end, cb) {
      if (end) return cb(end)
      if (i >= msgs.length) return cb(true)
      for (; i < msgs.length; i++) {
        const msg = msgs[i]
        if (msg && fn(msg, i, msgs)) {
          i += 1
          return cb(null, msg)
        }
      }
      return cb(true)
    }
  }

  function* filterAsIterator(fn) {
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      if (msg && fn(msg, i, msgs)) yield msg
    }
  }

  function filterAsArray(fn) {
    return msgs.filter(fn)
  }

  function forEach(fn) {
    for (let i = 0; i < msgs.length; i++) if (msgs[i]) fn(msgs[i], i, msgs)
  }

  function getKVT(msgKey) {
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      if (msg && msg.key === msgKey) return msg
    }
    return null
  }

  function get(msgKey) {
    return getKVT(msgKey)?.value
  }

  function loaded(cb) {
    if (cb === void 0) return promisify(loaded)()
    scannedLog.onReady(cb)
  }

  return {
    // public
    installFeedFormat,
    installEncryptionFormat,
    loaded,
    add,
    create,
    del,
    onMsgAdded,
    filterAsPullStream,
    filterAsIterator,
    filterAsArray,
    forEach,
    getKVT,
    get,

    // internal
    findEncryptionFormatFor,
    findFeedFormatForAuthor,
  }
}
