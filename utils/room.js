const mongo = require('../db/mongo')

const rooms = {}
const turns = {}
const times = {}

const getRoomId = () => {
    let text = ''
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

    for (let i = 0; i < 5; ++i) {
        text += letters.charAt(Math.floor(Math.random() * letters.length))
    }

    return text
}

const userJoin = (id, name, room) => {
    const user = { id, name }

    if (room in rooms) {
        if (rooms[room].findIndex(user => user.name === name) < 0) {
            rooms[room].push(user)
        }
    } else {
        rooms[room] = [user]
    }

    return user
}

const userJoinWithTeam = (id, name, room, team) => {
    const user = userJoin(id, name, room)
    user.team = team
    //console.log('useds joined room ', room, ': ', rooms[room])
    return user
}

const teamJoin = (id, teams, room) => {
    if (!(room in rooms))
        rooms[room] = teams
}

const getRoomUsers = room => {
    if (rooms[room]) {
        return rooms[room].map(user => user.name)
    }

    return []
}

const userLeaveRoom = id => {
    let user

    for (const room of Object.keys(rooms)) {
        console.log('room before: ', rooms[room])
        const result = rooms[room].filter(user => user.id === id)
        if (result.length > 0) {
            user = {
                name: result[0].name,
                room
            }

            rooms[room] = rooms[room].filter(user => user.id !== id)

            break
        }
    }

    return user
}

const userLeaveGame = id => {
    let user

    for (const room of Object.keys(turns)) {
        const result = turns[room].speakers.filter(user => user.id === id)
        if (result.length > 0) {
            user = {
                name: result[0].name,
                room
            }

            removeUserFromTurn(room, user.name)

            break
        }
    }

    return user
}

const getUsersInRoom = roomId => {
    if (rooms[roomId])
        return rooms[roomId]
    else
        throw Error(`No room with ${roomId} id`)
}

const splitTeams = users => {
    const len = users.length
    const newArray = shuffle(users.slice())
    return [newArray.splice(0, len / 2), newArray]
}

const setTeams = (teamOne, teamTwo, id) => {
    rooms[id] = rooms[id].map(user => {
        return {
            ...user,
            team: teamOne.filter(u => u.name === user.name).length > 0 ? 0 : 1
        }
    })

    return rooms[id]
}

const shuffle = array => {
    let currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

const setOnePlayerReady = roomId => {
    const roomEnv = rooms[roomId]

    if (roomEnv.playersReady) {
        roomEnv.playersReady++
    } else {
        roomEnv.playersReady = 1
    }
}

const roomPlayersAllReady = (roomId, tot) => {
    const len = rooms[roomId].length

    return len === tot
}

const createTurns = roomId => {
    if (turns[roomId] && turns[roomId].speakers) {
        // turns already created
        //console.log('turns already created ', turns[roomId])
        const { speakers } = turns[roomId]
        return speakers
    } else {
        const users = rooms[roomId]
        const one = users.filter(u => u.team === 0)
        const two = users.filter(u => u.team === 1)

        const currentTurns = interleave(one, two)

        turns[roomId] = {
            speakers: currentTurns,
            pointer: 0,
            len: currentTurns.length,
            readyForWord: []
        }
        //console.log(turns[roomId])
        return currentTurns
    }
}

const incrementPointer = roomId => {
    const { pointer, len } = turns[roomId]
    //console.log('incrementing pointer from ', pointer, ' to ', (pointer + 1) % len, ' with len : ', len)
    turns[roomId].pointer = (pointer + 1) % len
}

const interleave = ([x, ...xs], ys = []) =>
    x === undefined
        ? ys
        : [x, ...interleave(ys, xs)]

const getWordForRoom = roomId => turns[roomId].words

const setWordForRoom = (word, roomId) => {
    turns[roomId].words = word
}

const getSpeakerForRoom = roomId => {
    const { speakers, pointer, len } = turns[roomId]
    return speakers[pointer % len]
}

const isUserRequestingTheSpeaker = (user, roomId) => {
    //console.log('is user the guesser: ', user, getGuesserForRoom(roomId).name)
    return getSpeakerForRoom(roomId).name === user
}

const getRoleInTurn = (isSpeaker, team, roomId) => {
    if (isSpeaker) return 'Speaker'
    const user = getSpeakerForRoom(roomId)

    if (user.team === team) return 'Guesser'

    return 'Checker'
}

const removeUserFromTurn = (roomId, user) => {
    //console.log('BEFORE turns: ', turns[roomId])
    const { speakers, len } = turns[roomId]
    turns[roomId].speakers = speakers.filter(u => u.name !== user)
    turns[roomId].len = len - 1

    //console.log('AFTER turns: ', turns[roomId])

    if (turns[roomId].len <= 0) {
        cleanTurns(roomId)
        //console.log('after removing: ', turns[roomId])
    }
}

const cleanTurns = roomId => {
    delete turns[roomId]
}

const cleanRoom = roomId => {
    delete rooms[roomId]
}

const getUsersInTurn = (roomId, user) => {
    const usersInRoom = getUsersInRoom(roomId)
    return usersInRoom.filter(u => u.name !== user)
}

const isUserRequestingTheGuesser = (name, team, roomId) => {
    const speaker = getSpeakerForRoom(roomId)
    //console.log('the speaker: ', speaker)
    return speaker.team === team && speaker.name !== name
}

const setUserReadyToGetWord = (roomId, socket, role) => {
    turns[roomId].readyForWord.push({ playerSocket: socket, role })
}

const allUsersReadyToGetWord = roomId => {
    const { readyForWord, len } = turns[roomId]
    const allReady = len === readyForWord.length

    if (allReady) {
        turns[roomId].readyForWord = []
    }

    return [allReady, readyForWord]
}

const newPressedAfterTurn = (roomId) => {
    if (times[roomId] && times[roomId].startNewTurnTimestamp) {
        const { startNewTurnTimestamp } = times[roomId]
        const now = new Date()
        if (now.getTime() - startNewTurnTimestamp.getTime() >= 60000) {
            times[roomId].startNewTurnTimestamp = new Date()
            return true
        } else {
            return false
        }
    } else {
        if (times[roomId]) {
            times[roomId].startNewTurnTimestamp = new Date()
        } else {
            times[roomId] = { startNewTurnTimestamp: new Date() }
        }
        return true
    }
}

module.exports = {
    getRoomId,
    userJoin,
    getRoomUsers,
    userLeaveRoom,
    userLeaveGame,
    getUsersInRoom,
    splitTeams,
    setTeams,
    setOnePlayerReady,
    roomPlayersAllReady,
    teamJoin,
    createTurns,
    userJoinWithTeam,
    getWordForRoom,
    setWordForRoom,
    isUserRequestingTheSpeaker,
    getRoleInTurn,
    incrementPointer,
    removeUserFromTurn,
    getUsersInTurn,
    isUserRequestingTheGuesser,
    cleanTurns,
    cleanRoom,
    setUserReadyToGetWord,
    allUsersReadyToGetWord,
    newPressedAfterTurn
}