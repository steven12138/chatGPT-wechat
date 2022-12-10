import {WechatyBuilder} from 'wechaty'
import qrcodeTerminal from 'qrcode-terminal'
import {ChatGPTAPI} from "chatgpt";
import {oraPromise} from "ora";

// change from https://github.com/AutumnWhj/ChatGPT-wechat-bot

let token = ''

let api = new ChatGPTAPI({
    sessionToken: token,
})
await api.ensureAuth();

let conv = api.getConversation();

let last = new Date().getTime();

let fetching = false
let first_scan = true


async function onMessage(msg) {
    const contact = msg.talker();
    const mentionSelf = await msg.mentionSelf();
    const content = msg.text();
    const room = msg.room();
    const alias = await contact.alias() || contact.name();
    const isText = msg.type() === bot.Message.Type.Text;

    if (room && isText && mentionSelf) {
        const topic = await room.topic();
        let current = new Date().getTime()
        if (current - last < 30000) {
            room.say(`\n太快了，请慢一点\n请${(30000 - current + last) / 1000}s 后重试`, contact);
            return;
        }
        if (fetching) {
            room.say(`\n我还在思考上一个问题，等一等`, contact);
            return;
        }
        last = new Date().getTime()
        room.say('\n先别急，让我想一想', contact)
        const [groupContent] = content.split(`@hty`).filter(item => item.trim())
        try {
            fetching = true
            let sent = ""
            let n = 0
            let current;
            await oraPromise(conv.sendMessage(groupContent.trim(), {
                    onProgress: (part) => {
                        process.stdout.write(".");
                        current = part
                        n++
                        if (n % 200 === 0 && part) {
                            room.say("\n" + part.replace(sent, ""));
                            sent = part;
                        }
                    },
                    timeoutMs: 3 * 60 * 1000,
                }).then(async () => {
                    let remain = current.replace(sent, "")
                    if (remain && remain !== "") {
                        await room.say("\n" + remain + "\n--end--")
                    } else room.say('--end--')
                }).catch((e) => {
                    room.say("\n出错了\n" + e, contact);
                    fetching = false
                }),
                {
                    text: `${topic} ${alias} is asking for: ${groupContent.trim()}`,
                    color: 'green',
                }
            );
        } catch (e) {
            room.say("\n出错了\n" + e, contact);
            last = 0;
        } finally {
            fetching = false
        }
    } else if (!room && isText && alias === "老师好我是何同学") {
        if (content === '/change') {
            await oraPromise(async () => {
                token = ""
                await contact.say("token cache removed")
            }, {
                text: "token cache removed",
            })
            return
        }
        if (content === '/ping') {
            await oraPromise(async () => {
                token = ""
                await contact.say("pong")
            }, {
                text: "Send heart beat",
            })
            return
        }
        if (content.split(' ')[0] === '/add') {
            await oraPromise(async () => {
                token += content.split(' ')[1]
                await contact.say("add frame success")
            }, {
                text: "add frame success",
            })
            return
        }
        if (content === "/apply") {
            await oraPromise(new Promise(async (resolve, reject) => {
                    try {
                        api = new ChatGPTAPI({
                            sessionToken: token,
                        })
                        await api.ensureAuth();
                        conv = api.getConversation();
                        await contact.say("Applied for new token")
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                }).catch(async e => {
                    await contact.say("Token Applied Failed\n" + e)
                }), {
                    text: "Applying for new token",
                }
            )
        }
    }
}

function onScan(qrCode) {
    if (!first_scan) return;
    first_scan = false
    console.log("Qr Code: ")
    qrcodeTerminal.generate(qrCode, {small: true});
}

const bot = WechatyBuilder.build({
    name: 'WechatEveryDay',
    puppet: 'wechaty-puppet-wechat', // 如果有token，记得更换对应的puppet
    puppetOptions: {
        uos: true
    }
})

bot.on("scan", onScan);
bot.on("login", (user) => {
    console.log(`Log in as ${user} !`);
})

bot.on("logout", (user) => {
    console.log(`${user} Log out`);
})

bot.on("message", onMessage);

bot
    .start()
    .then(() => console.log('Start to log in wechat...'))
