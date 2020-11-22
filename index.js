const express = require('express')
require('dotenv').config()
const morgan = require('morgan')
const bodyParser = require('body-parser')
const cors = require('cors')

const mongo = require('./db/mongo')
const tokenService = require('./service/token')
const {
    getRoomId,
    userJoin,
    getRoomUsers,
    userLeave,
    getUsersInRoom,
    splitTeams,
    setTeams,
    roomPlayersAllReady,
    userJoinWithTeam,
    createTurns,
    isUserRequestingTheGuesser,
    getRoleInTurn,
    incrementPointer
} = require('./utils/room')

const {
    WORDS_IN_DB,
    getGuesserWord,
    getGuesserForbidden
} = require('./utils/words')

const app = express()

const PORT = process.env.PORT

app.use(morgan())
app.use(cors('*'))
app.use(bodyParser.json())


app.post('/api/auth/login', async (req, res, next) => {
    const { userName, password } = req.body
    const db = await mongo.getDb()
    const result = await db.user.findOne({ userName, password })
    if (result) {
        res.json({ user: 'ok', userName: userName, accessToken: tokenService.createAccessToken({ userName, password }) })
    } else {
        res.status(404).json({ error: 'user does not exist' })
    }
})

app.post('/api/auth/verifyToken', (req, res, next) => {
    const { token } = req.body
    const result = tokenService.verifyAccessToken(token)
    res.json(result)
})

app.post('/sign', (req, res, next) => {

})

app.get('/api/room/:roomId', async (req, res, next) => {
    const { roomId } = req.params
    if (!roomId) {
        res.status(400).json({ error: 'Specify a room id' })
        return
    }
    console.log(roomId)
    const db = await mongo.getDb()
    const result = await db.room.findOne({ roomId })

    console.log(result)
    if (result) {
        res.status(200).json({ found: true, room: { roomId } })
    } else {
        res.status(404).json({ found: false })
    }
})

app.post('/api/room', async (req, res, next) => {
    const { name, owner } = req.body
    if (!name) {
        res.status(400).json({ error: 'A room name must be specified!' })
        return
    }

    const db = await mongo.getDb()
    const roomId = getRoomId()
    const query = { name, roomId, owner }
    const result = await db.room.update(query, { $setOnInsert: query }, { upsert: true })

    if (result) {
        res.status(200).json({ created: true, room: { name, id: roomId } })
    } else {
        res.status(500).json({ created: false, error: result })
    }
})

app.get('/api/room/owner/:roomId', async (req, res, next) => {
    const { roomId } = req.params
    const db = await mongo.getDb()
    const query = { roomId }
    const result = await db.room.findOne(query)

    if (result) {
        res.status(200).json({ status: true, owner: result.owner })
    } else {
        res.status(500).json({ status: false, error: result })
    }
})

app.post('/api/room/start', async (req, res, next) => {
    const { roomId } = req.body
    const users = getUsersInRoom(roomId)
    const [teamOne, teamTwo] = splitTeams(users)

    const db = await mongo.getDb()
    const query = { roomId }
    await db.room.update(query, { $set: { teamOne, teamTwo } })

    res.json({
        teamOne, teamTwo
    })
})

var server = require('http').createServer(app)
const options = {
    cors: true,
    origins: ["http://localhost:3000"]
}

const io = require('socket.io')(server, options)

io.on('connection', socket => {
    console.log('connection...')
    socket.on('joinWaitingRoom', ({ name, room }) => {
        userJoin(socket.id, name, room)
        socket.join(room)

        io.to(room).emit('roomUsers', getRoomUsers(room))
    })

    socket.on('joinRoom', ({ name, roomId, totPlayers, team }) => {
        console.log('joiningn ', name)
        userJoinWithTeam(socket.id, name, roomId, team)
        socket.join(roomId)

        if (roomPlayersAllReady(roomId, totPlayers)) {
            io.to(roomId).emit('startCountdown', { time: 5 })
        }
    })
    socket.on('setTurns', ({ roomId }) => {
        const turns = createTurns(roomId)

        // io.to(roomId).emit('turns', { turns })
    })

    //TODO: this call is probably useles, socket is gonna disconnect and rooms reset
    socket.on('setTeams', ({ teamOne, teamTwo, roomId }) => {
        const newTeams = setTeams(teamOne, teamTwo, roomId)

        io.to(roomId).emit('startGame', newTeams)
    })

    socket.on('getRoles', ({ requestingUser, roomId, team }) => {
        const hide = isUserRequestingTheGuesser(requestingUser, roomId)
        socket.emit('roles', { role: getRoleInTurn(hide, team, roomId) })
    })

    socket.on('getWord', async ({ requestingUser, roomId, seed }) => {
        console.log('the seed: ', seed)
        const id = seed % WORDS_IN_DB
        console.log('the id: ', id)
        const db = await mongo.getDb()
        const query = { id: id.toString() }
        const word = await db.words.findOne(query)

        const hide = isUserRequestingTheGuesser(requestingUser, roomId)
        console.log('user ', requestingUser, ' is guesser? ', hide)
        socket.emit('word', {
            word: hide ? getGuesserWord(word.guess.length) : word.guess,
            forbidden: hide ? getGuesserForbidden(word.forbidden) : word.forbidden
        })
    })

    socket.on('point', ({ team, roomId, point }) => {
        io.to(roomId).emit('point', { team, point })
    })

    socket.on('newTurn', ({ roomId }) => {    
        incrementPointer(roomId)  
        io.to(roomId).emit('startCountdown', { time: 5 })
    })

    socket.on('ask4word', ({ roomId }) => {
        io.to(roomId).emit('ask4word')
    })

    socket.on('disconnect', () => {
        const user = userLeave(socket.id)
        if (user) {
            console.log(`user ${user.name} disconnected`)
            io.to(user.room).emit('roomUsers', getRoomUsers(user.room))
        }
    })
});

server.listen(PORT, () => console.log(`server running on port ${PORT}`));