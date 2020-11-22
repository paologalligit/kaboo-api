const getGuesserWord = len => new Array(len + 1).join('F')

const getGuesserForbidden = array => {
    const result = []
    for (const forbidden of array) {
        result.push(getGuesserWord(forbidden.length))
    }
    return result
}

module.exports = {
    getGuesserWord,
    getGuesserForbidden,
    // TODO: this could be extracted from the db
    WORDS_IN_DB: 31
}