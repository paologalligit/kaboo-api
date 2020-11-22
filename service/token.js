const jwt = require('jsonwebtoken')

module.exports = {
    createAccessToken: (user) => {
        return jwt.sign(user, process.env.SALT)
    },
    verifyAccessToken: (token) => {
        let result
        jwt.verify(token, process.env.SALT, (err, decoded) => {
            if (!err) {
                result = decoded
            } else {
                result = null
            }
        })

        return { verified: result !== null }
    }
}