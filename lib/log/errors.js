class ErrorWithCode extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

/**
 * @param {number} offset
 */
function nanOffsetErr(offset) {
  return new ErrorWithCode(`Offset ${offset} is not a number`, 'INVALID_OFFSET')
}

/**
 * @param {number} offset
 */
function negativeOffsetErr(offset) {
  return new ErrorWithCode(`Offset ${offset} is negative`, 'INVALID_OFFSET')
}

/**
 * @param {number} offset
 * @param {number} logSize
 */
function outOfBoundsOffsetErr(offset, logSize) {
  return new ErrorWithCode(
    `Offset ${offset} is beyond log size ${logSize}`,
    'OFFSET_OUT_OF_BOUNDS'
  )
}

function deletedRecordErr() {
  return new ErrorWithCode('Record has been deleted', 'DELETED_RECORD')
}

function delDuringCompactErr() {
  return new Error('Cannot delete while compaction is in progress')
}

function compactWithMaxLiveStreamErr() {
  // prettier-ignore
  return new Error('Compaction cannot run if there are live streams configured with opts.lt or opts.lte')
}

function overwriteLargerThanOld() {
  // prettier-ignore
  return new Error('Data to be overwritten should not be larger than existing data')
}

function appendLargerThanBlockErr() {
  return new Error('Data to be appended is larger than block size')
}

module.exports = {
  ErrorWithCode,
  nanOffsetErr,
  negativeOffsetErr,
  outOfBoundsOffsetErr,
  deletedRecordErr,
  delDuringCompactErr,
  compactWithMaxLiveStreamErr,
  overwriteLargerThanOld,
  appendLargerThanBlockErr,
}
