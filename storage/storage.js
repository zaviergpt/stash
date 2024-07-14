
const e = require("cors")
const fs = require("fs")

const { v4: uuidv4 } = require("uuid")
const { WebSocket } = require("ws")

const config = (function(){
    if (!fs.existsSync("./config.json")) {
        fs.writeFileSync("./config.json", JSON.stringify({
            id: uuidv4().split("-").pop(),
            name: "STASH_CLIENT_NAME",
            server: "STASH_SERVER_ID",
            domain: "STASH_SERVER_DOMAIN"
        }))
    } else {
        defaults = [{ name: "STASH_CLIENT_NAME", server: "STASH_SERVER_ID", domain: "STASH_SERVER_DOMAIN" }, JSON.parse(fs.readFileSync("./config.json"))]
        for (var item in defaults[1]) {
            if (defaults[0][item]) {
                if (defaults[1][item] === defaults[0][item]) {
                    return undefined
                }
            }
        }
        return defaults[1]
    }
})()

function start() {
    token = (function(){
        data = [JSON.stringify([config.id, config.name]), []]
        config.temporary = [config.server, btoa(config.server)]
        while (data[0].length > config.temporary[0].length) {
            config.temporary = [
                config.temporary[0].concat(config.temporary[0]),
                config.temporary[1].concat(config.temporary[1]),
            ]
        }
        for (var character in data[0]) {
            character = [
                data[0][character].charCodeAt(0), config.temporary[0][character].charCodeAt(0),
                config.temporary[1][character].charCodeAt(0)
            ]
            data[1].push(String.fromCharCode((character[0] ^ character[1] ^ character[2]) + config.temporary[1].length))
        }
        return encodeURIComponent(data[1].join(""))
    })()
    socket = new WebSocket(`ws://${config.domain}/${token}`)
    socket.on("open", () => {
        console.clear()
        console.log(`\nSuccessfully connected to ${config.domain} [${config.server}]\nas ${config.name} [${config.id}].\n`)
        socket.on("ping", () => socket.pong())
        socket.on("close", (event) => {
            console.log("Disconnected. Attempting to reconnect.")
            setTimeout(start, 5000)
        })
    })
    socket.on("error", () => console.log("Failed to connect.\n"))
}

if (config) start()