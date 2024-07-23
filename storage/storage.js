
const fs = require("fs")

const { v4: uuidv4 } = require("uuid")
const { WebSocket } = require("ws")

const config = (function(){
    if (!fs.existsSync("./config.json")) {
        fs.writeFileSync("./config.json", JSON.stringify({
            id: uuidv4().split("-").pop(),
            name: "STASH_CLIENT_NAME",
            server: "STASH_SERVER_ID",
            domain: "STASH_SERVER_DOMAIN",
            isPublic: [true, null]
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
    if (!fs.existsSync("./store")) fs.mkdirSync("./store")
    token = (function(){
        data = [JSON.stringify([config.id, config.name, config.isPublic, "192.168.0.101"]), []]
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
    streams = {}
    socket = new WebSocket(`ws://${config.domain}/${token}`)
    socket.on("open", () => {
        console.clear()
        console.log(`\nSuccessfully connected to ${config.domain} [${config.server}]\nas ${config.name} [${config.id}].\n`)
        socket.on("ping", () => socket.pong())
        socket.on("message", (chunk, isBinary) => {
            if (isBinary) {
                combinedBuffer = new Uint8Array(chunk)
                jsonLength = new DataView(combinedBuffer.buffer).getUint32(0)
                metadata = JSON.parse(new TextDecoder().decode(combinedBuffer.slice(4, 4 + jsonLength)))
                chunk = chunk.slice(4 + jsonLength)
                if (!streams[metadata[1]]) streams[metadata[1]] = [0, fs.createWriteStream("./store/" + metadata[1])]
                if (metadata[0] > streams[metadata[1]][0]) {
                    streams[metadata[1]][0] = metadata[0]
                    streams[metadata[1]][1].write(chunk)
                    process.stdout.cursorTo(0)
                    process.stdout.write(`Writing ${metadata[1]} ... ${metadata[0]}`)
                } else {
                    streams[metadata[1]][1].close()
                    process.stdout.cursorTo(0)
                    process.stdout.write(`Writing ${metadata[1]} ... OK\n`)
                }
            } else {
                packet = JSON.parse(chunk)
                console.log(packet)
            }
        })
        socket.on("close", (event) => {
            console.log("Disconnected. Attempting to reconnect.")
            setTimeout(start, 5000)
        })
    })
    socket.on("error", () => console.log("Failed to connect.\n"))
}

if (config) start()