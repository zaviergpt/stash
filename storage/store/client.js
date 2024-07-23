
const fs = require("fs")

const { v4: uuidv4 } = require("uuid")
const { WebSocket } = require("ws")

const readline = require("readline")

const input = readline.createInterface({
    input: process.stdin, output: process.stdout
})

const config = (function(){
    if (!fs.existsSync("./config.json")) {
        fs.writeFileSync("./config.json", JSON.stringify({
            id: uuidv4().split("-").pop(),
            email: "STASH_CLIENT_EMAIL",
            domain: "STASH_SERVER_DOMAIN",
            server: "STASH_SERVER_ID"
        }))
    } else {
        required = [{ email: "STASH_CLIENT_EMAIL", domain: "STASH_SERVER_DOMAIN", server: "STASH_SERVER_ID" }, JSON.parse(fs.readFileSync("./config.json"))]
        for (var item in required[1]) {
            if (required[0][item]) {
                if (required[0][item] === required[1][item]) return undefined
            }
        }
        return required[1]
    }
})()

const API = (function(){
    const _authorize = async () => {
        console.clear()
        if (config.token) {
            request = await (await fetch(`http://${config.domain}/accounts/authorize`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": btoa(JSON.stringify({
                        token: config.token
                    }))
                }
            })).json()
            if (request.token) {
                API.connect()
            }
        } else {
            request = await (await fetch(`http://${config.domain}/accounts/authorize`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": btoa(JSON.stringify({
                        code: btoa(JSON.stringify({
                            email: config.email
                        }))
                    }))
                }
            })).json()
            console.log(request.id)
            if (request.id) {
                input.question("2-FA Code > ", async (answer) => {
                    account = await (await fetch(`http://${config.domain}/accounts/authorize`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": btoa(JSON.stringify({
                                code: btoa(JSON.stringify({
                                    passcode: answer,
                                    id: request.id
                                }))
                            }))
                        }
                    })).json()
                    if (account.token) {
                        config.token = account.token
                        fs.writeFileSync("./config.json", JSON.stringify(config))
                        API.connect()
                    }
                })
            }
        }
    }
    const _connect = () => {
        console.clear()
        token = (function(){
            data = [JSON.stringify([config.token]), []]
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
            console.log(`Successfully connected to ${config.domain} [${config.server}]\nand ready to send packets.`)
            API.run()
        })
    }
    return {
        authorize() {
            return _authorize()
        },
        connect() {
            return _connect()
        },
        run(command) {
            working = false
            if (command && command.length > 0) {
                console.log("")
                item = command.split(" ")
                if (["send"].includes(item[0])) {
                    if (item.length === 3) {
                        if (item[0] === "send") {
                            if (fs.existsSync(item[1])) {
                                count = 0
                                filename = item[1].split("/").pop().split("\\").pop()
                                fs.createReadStream(item[1], { highWaterMark: 1024 ** 2 })
                                    .on("data", (chunk) => {
                                        count += 1
                                        process.stdout.cursorTo(0)
                                        process.stdout.write(`Sending ${filename} to ${item[2]} ... ${count}`)
                                        metadata = JSON.stringify([count, filename, item[2]])
                                        bufferLength = Buffer.alloc(4)
                                        bufferLength.writeUInt32BE(metadata.length, 0)
                                        socket.send(Buffer.concat([bufferLength, Buffer.from(metadata), chunk]))
                                        working = true
                                    })
                                    .on("end", () => {
                                        metadata = JSON.stringify([-1, filename, item[2]])
                                        bufferLength = Buffer.alloc(4)
                                        bufferLength.writeUInt32BE(metadata.length, 0)
                                        socket.send(Buffer.concat([bufferLength, Buffer.from(metadata), Buffer.from(metadata)]))
                                        process.stdout.cursorTo(0)
                                        process.stdout.write(`Sending ${filename} to ${item[2]} ... OK\n`)
                                        working = false
                                    })
                            } else console.log("File does not exist.")
                        }
                    }
                } else {
                    console.log("Command does not exist.")
                }
            }
            id = setInterval(function(){
                if (!working) {
                    input.question("\n  >  ", (answer) => API.run(answer))
                    clearInterval(id)
                }
            }, 1000)
        }
    }
})()

if (config) API.authorize()