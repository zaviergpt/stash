
const fs = require("fs")

const http = require("http")
const cors = require("cors")
const axios = require("axios")
const multer = require("multer")
const express = require("express")

const speakeasy = require("speakeasy")
const qrcode = require("qrcode")

const { WebSocketServer } = require("ws")
const { v4: uuidv4 } = require("uuid")
const { setUncaughtExceptionCaptureCallback } = require("process")

const app = express()
const server = http.createServer(app)
const io = new WebSocketServer({ noServer: true })

const router = {
    media: express.Router(),
    accounts: express.Router()
}

const config = (function(){
    if (!fs.existsSync("./config.json")) {
        fs.writeFileSync("./config.json", JSON.stringify({
            name: "STASH_SERVER_NAME",
            id: uuidv4().split("-").pop(),
            storages: []
        }))
    } else {
        defaults = [{ name: "STASH_SERVER_NAME" }, JSON.parse(fs.readFileSync("./config.json"))]
        for (var item in defaults[1]) {
            if (defaults[0][item]) {
                if (defaults[0][item] === defaults[1][item]) {
                    return undefined
                }
            }
        }
        return defaults[1]
    }
})()

let devices = {}
let accounts = [[], {}]

app.use(cors())
app.use(express.json())
app.use(express.urlencoded())

app.use("/media", router.media)
app.use("/accounts", router.accounts)

app.use("*", (request, response, next) => {
    if (request.method === "GET") {
        next()
    } else if (request.method === "POST") {
        if (["/accounts/authorize"].includes(request.url)) next()
        if (request.headers["authorization"]) {
            authorization = JSON.parse(atob(request.headers["authorization"]))
            if (authorization.token && accounts[0].filter((account) => (account[3] === authorization.token)).length > 0) {
                next()
            }
        }
    }
})

app.use("/", (request, response) => {
    if (request.method === "GET") {
        response.sendFile(__dirname + "/index.html")
    } else if (request.method === "POST") {
        if (request.body.action) {
            if (request.body.action === "vaults") {
                authorization = JSON.parse(atob(request.headers["authorization"]))
                account = accounts[0].filter((account) => (account[3] === authorization.token)).pop()
                response.json(config.storages.filter((vault) => (vault.owner && vault.owner === account[0])).map((vault) => ({
                    id: vault.id,
                    name: devices[vault.id][1].info[1],
                    isPublic: vault.isPublic,
                    owner: vault.owner,
                    isOnline: devices[vault.id] ? true : false,
                    ip: devices[vault.id][1].info[3]
                })))
            }
        }
    }
})

router.accounts.post("/authorize", (request, response) => {
    if (request.headers["authorization"]) {
        data = JSON.parse(atob(request.headers["authorization"]))
        if (data.token) {
            found = null
            accounts[0].forEach((account) => {
                if (account[3] === data.token) {
                    found = data.token
                }
            })
            response.json({ token: found })
        } else if (data.code) {
            code = JSON.parse(atob(data.code))
            if (code.passcode && code.id) {
                found = null
                if (accounts[1][code.id]) {
                    account = accounts[1][code.id]
                    if (speakeasy.totp.verify({ secret: account[1], encoding: "base32", token: code.passcode })) {
                        accounts[0].push([code.id, account[0], account[1], uuidv4()])
                        found = accounts[0][accounts[0].length-1][3]
                        fs.writeFileSync("./accounts.json", JSON.stringify(accounts[0]))
                    }
                } else if (accounts[0].filter((account) => (account[0] === code.id)).length > 0) {
                    accounts[0].forEach((account) => {
                        if (account[0] === code.id) {
                            if (speakeasy.totp.verify({ secret: account[2], encoding: "base32", token: code.passcode })) {
                                account[3] = uuidv4()
                                found = account[3]
                                fs.writeFileSync("./accounts.json", JSON.stringify(accounts[0]))
                            }
                        }
                    })
                }
                response.json({ token: found })
            } else if (code.email) {
                if (accounts[0].filter((account) => (account[1] === code.email)).length > 0) {
                    account = accounts[0].filter((account) => (account[1] === code.email)).pop()
                    response.json({ id: account[0] })
                } else {
                    id = uuidv4().split("-").pop()
                    secret = speakeasy.generateSecret({ length: 20 })
                    accounts[1][id] = [code.email, secret.base32]
                    qrcode.toDataURL(secret.otpauth_url, (error, url) => {
                        if (!error) response.json({
                            id: id,
                            dataURL: url,
                            secret: accounts[1][id][1]
                        })
                    })
                }
            }
        }
    }
})

io.on("connection", (socket, info) => {
    socket.on("message", (chunk, isBinary) => {
        if (isBinary) {
            if (socket.info[0].length > 12) {
                combinedBuffer = new Uint8Array(chunk);
                jsonLength = new DataView(combinedBuffer.buffer).getUint32(0);
                metadata = JSON.parse(new TextDecoder().decode(combinedBuffer.slice(4, 4 + jsonLength)))
                if (devices[metadata[2]]) {
                    devices[metadata[2]][1].send(chunk)
                }
            }
        } else {
            packet = JSON.parse(chunk.toString())
            console.log(packet)
        }
    })
    socket.on("pong", () => devices[socket.info[0]][0].response[1] = Date.now() - devices[socket.info[0]][0].response[0])
    devices[socket.info[0]] = [{ response: [Date.now(), -1] }, socket]
    if (socket.info[1]) console.log(`${socket.info[1]} [${socket.info[0]}] has connected.`)
})

server.on("upgrade", (request, socket, head) => {
    if (request.url.split("/").pop().length > 0) {
        info = (function(token){
            data = [decodeURIComponent(token), [], [config.id, btoa(config.id)]]
            while (data[0].length > data[2][0].length) {
                data[2] = [data[2][0].concat(data[2][0]), data[2][1].concat(data[2][1])]
            }
            for (var character in data[0]) {
                character = [data[0][character].charCodeAt(0)-data[2][1].length, data[2][0][character].charCodeAt(0), data[2][1][character].charCodeAt(0)]
                data[1].push(String.fromCharCode(character[0] ^ character[1] ^ character[2]))
            }
            return JSON.parse(data[1].join(""))
        })(request.url.split("/").pop())
        if (info.length > 2) {
            if (!info[2][0] && accounts[0].filter((account) => (account[0] === info[2][1])).length > 0) {
                if (config.storages.filter((storage) => (storage.id === info[0])).length < 1) {
                    config.storages.push({ id: info[0], isPublic: info[2][0], owner: info[2][1] })
                    fs.writeFileSync("./config.json", JSON.stringify(config))
                }
            }
            if (config.storages.filter((storage) => (storage.id === info[0])).length > 0) {
                io.handleUpgrade(request, socket, head, (socket, request) => {
                    socket.info = info
                    io.emit("connection", socket)
                })
            } else socket.destroy()
        } else {
            if (accounts[0].filter((account) => (account[3] === info[0])).length > 0) {
                io.handleUpgrade(request, socket, head, (socket, request) => {
                    socket.info = info
                    io.emit("connection", socket)
                })
            }
        }
    } else socket.destroy()
})

if (config) server.listen(5000, () => {
    if (!fs.existsSync("./accounts.json")) fs.writeFileSync("./accounts.json", JSON.stringify([]))
    console.clear()
    console.log(`\n${config.name} [${config.id}]\nis online and ready to receive packets.\n`)
    setInterval(function(){
        for (var device in devices) {
            if (devices[device][1]) {
                devices[device][0].response[0] = Date.now()
                devices[device][1].ping()
            } 
        }
    }, 15000)
    accounts = [JSON.parse(fs.readFileSync("./accounts.json")), {}]
})