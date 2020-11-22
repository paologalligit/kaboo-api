const MongoClient = require('mongodb').MongoClient

const mongoConfig = {
    url: process.env.MONGO_URI,
    db: process.env.MONGO_DB,
}

const collections = ['user', 'words', 'room']

let clientPromise = null

async function connect() {
    const client = await MongoClient.connect(mongoConfig.url, { useNewUrlParser: true })
        .catch(err => {
            console.error('Failed to connect to mongo')
            console.error(err)
            process.exit(-1)
        })

    const db = client.db(mongoConfig.db)
    collections.forEach(c => db[c] = db.collection(c))
    //db.agreementKeys.createIndex({ 'namespace': 1, 'agreement': 1, 'appId': 1, 'key': 1 })

    return client
}

async function getDb() {
    if (clientPromise == null) {
        clientPromise = connect()
    }

    const client = await clientPromise
    return client.db(mongoConfig.db)
}

module.exports = {
    collections,
    getDb,
    async close() {
        if (clientPromise == null) {
            return
        }

        const client = await clientPromise
        await client.close()
        clientPromise = null
    },
}