const { Random, MersenneTwister19937 } = require('random-js')

const RANDOM_GENERATOR = new Random(MersenneTwister19937.autoSeed())
const WORDS_IN_DB = 123

const getGuesserWord = len => new Array(len + 1).join('F')

const getGuesserForbidden = array => {
    const result = []
    for (const forbidden of array) {
        result.push(getGuesserWord(forbidden.length))
    }
    return result
}

const getRandomWordIndex = () => {
    return RANDOM_GENERATOR.integer(0, WORDS_IN_DB - 1)
}

module.exports = {
    getGuesserWord,
    getGuesserForbidden,
    getRandomWordIndex,
    // TODO: this could be extracted from the db
    WORDS_IN_DB
}
