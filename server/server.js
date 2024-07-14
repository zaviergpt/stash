
const fs = require("fs")

const http = require("http")
const cors = require("cors")
const axios = require("axios")
const multer = require("multer")
const express = require("express")

const { WebSocketServer } = require("ws")
const { v4: uuidv4 } = require("uuid")

const app = express()
const server = http.createServer(app)
const io = new WebSocketServer({ noServer: true })

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

io.on("connection", (socket, info) => {
    socket.on("pong", () => devices[info.id][0].response[1] = Date.now() - devices[info.id][0].response[0])
    devices[info.id] = [{ response: [Date.now(), -1] }, socket]
    console.log(`${info.name} [${info.id}] has connected.`)
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
        if (config.storages.filter((storage) => (storage.id === info[0])).length > 0) {
            io.handleUpgrade(request, socket, head, (socket, request) => {
                socket.info = info
                io.emit("connection", socket, config.storages.filter((storage) => (storage.id === info[0])).pop())
            })
        } else socket.destroy()
    } else socket.destroy()
})

if (config) server.listen(5000, () => {
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
})