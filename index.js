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
    userLeaveGame,
    userLeaveRoom,
    getUsersInRoom,
    splitTeams,
    setTeams,
    roomPlayersAllReady,
    userJoinWithTeam,
    createTurns,
    isUserRequestingTheSpeaker,
    getRoleInTurn,
    incrementPointer,
    removeUserFromTurn,
    getUsersInTurn,
    cleanTurns,
    setUserReadyToGetWord,
    allUsersReadyToGetWord,
    newPressedAfterTurn,
    getRoomUsersAndVideo
} = require('./utils/room')

const {
    getGuesserWord,
    getGuesserForbidden,
    getRandomWordIndex
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

app.post('/api/auth/signup', async (req, res, next) => {
    const { userName, password } = req.body
    const db = await mongo.getDb()
    try {
        const result = await db.user.insert({ userName, password })
        res.json(result)
    } catch (err) {
        const { code } = err
        let errorMessage
        switch (code) {
            case 11000:
                errorMessage = 'Error: duplicate user'
                break;

            default:
                errorMessage = `Error while inserting user ${userName}`
                break;
        }
        res.json({
            error: true,
            errorMessage
        })
    }
})

app.get('/api/room/:roomId', async (req, res, next) => {
    const { roomId } = req.params
    if (!roomId) {
        res.status(400).json({ error: 'Specify a room id' })
        return
    }

    const db = await mongo.getDb()
    const result = await db.room.findOne({ roomId })

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
    const createdAt = new Date()
    const query = { name, roomId, owner, createdAt }
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
    socket.on('joinWaitingRoom', ({ name, room, peerId }) => {
        console.log('1. peerId', peerId)
        userJoin(socket.id, name, room, peerId)
        socket.join(room)

        io.to(room).emit('roomUsers', getRoomUsersAndVideo(room))
    })

    socket.on('joinRoom', ({ name, roomId, totPlayers, team }) => {
        userJoinWithTeam(socket.id, name, roomId, team)
        socket.join(roomId)

        if (roomPlayersAllReady(roomId, totPlayers)) {
            newPressedAfterTurn(roomId)
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
        const speaker = isUserRequestingTheSpeaker(requestingUser, roomId)
        socket.emit('roles', { role: getRoleInTurn(speaker, team, roomId) })
    })

    socket.on('getWord', async ({ requestingUser, roomId, team, seed, role }) => {
        setUserReadyToGetWord(roomId, socket, role)
        const [allReady, usersList] = allUsersReadyToGetWord(roomId)

        if (allReady) {
            const id = getRandomWordIndex()
            const db = await mongo.getDb()
            const query = { id: id.toString() }
            const word = await db.words.findOne(query)

            usersList.forEach(({ playerSocket, role }) => {
                playerSocket.emit('word', {
                    word: role === 'Guesser' ? getGuesserWord(word.guess.length) : word.guess,
                    forbidden: role === 'Guesser' ? getGuesserForbidden(word.forbidden) : word.forbidden
                })
            })
        }
    })

    socket.on('point', ({ team, roomId, point }) => {
        io.to(roomId).emit('point', { team, point })
    })

    socket.on('newTurn', ({ roomId }) => {
        if (newPressedAfterTurn(roomId)) {
            incrementPointer(roomId)
            io.to(roomId).emit('startCountdown', { time: 5 })
        }
    })

    socket.on('ask4word', ({ roomId }) => {
        io.to(roomId).emit('ask4word')
    })

    socket.on('leaveRoom', ({ user, roomId }) => {
        userLeaveRoom(user)
        socket.leave(roomId)
        const usersInRoom = getRoomUsers(roomId)
        io.to(roomId).emit('roomUsers', usersInRoom)
    })

    socket.on('leaveGame', ({ roomId, user }) => {
        removeUserFromTurn(roomId, user)
        socket.leave(roomId)

        const usersInTurn = getUsersInTurn(roomId, user)
        if (usersInTurn.length === 0) {
            cleanTurns(roomId)
        } else {
            //console.log('remaining: ', getUsersInTurn(roomId, user))
            io.to(roomId).emit('userLeft', { user, users: getUsersInTurn(roomId, user) })
        }
    })

    socket.on('disconnect', () => {
        // Removing from room
        const user = userLeaveRoom(socket.id)
        if (user) {
            console.log(`user ${user.name} disconnected, remaining `, getRoomUsers(user.room))
            io.to(user.room).emit('roomUsers', getRoomUsers(user.room))
        }

        const userGame = userLeaveGame(socket.id)
        if (userGame) {
            io.to(userGame.room).emit('userLeft', { user: userGame, users: getUsersInTurn(userGame.room, userGame.name) })
        }
    })
});

server.listen(PORT, () => console.log(`server running on port ${PORT}`));