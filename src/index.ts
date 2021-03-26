import {Telegraf, Context, Markup} from 'telegraf'

import * as dotenv from "dotenv";
import TelegrafStatelessQuestion from "telegraf-stateless-question";
import {ReplyToMessageContext} from "telegraf-stateless-question/dist/source/identifier";
import {SonarrClient, SonarSearchResult} from "./sonarr";
import {generateUpdateMiddleware} from "telegraf-middleware-console-time";
import {TrashBot} from "./trashbot";
import * as fs from "fs";

dotenv.config();

console.log(process.env)
const token = process.env.TRASH_BOT_TOKEN || '';
const sonarToken = process.env.SONAR_API_KEY;


let tbot = new TrashBot(token, {
    defaultMemes: false, sonarApiKey: '', radarApiKey: ''
});

tbot.bot.on('message', (ctx: Context) => {
    let message = ctx.message;
    if (message !== undefined) {
        let chatid = message.chat.id;

        if (chatid !== undefined && tbot.myDb[chatid] !== undefined ) {
            if (tbot.myDb[chatid].opts.readOnlyUsers.indexOf(message.from.id) > -1) {
                ctx.deleteMessage(message.message_id);
                return;
            }
        }

        if (tbot.myDb[chatid] !== undefined && tbot.myDb[chatid].words.length > 0) {
            if ('text' in message) {
                let msgText = message.text;
                if (msgText.startsWith("/")) {
                    return;
                }
                for (let i = 0; i < tbot.myDb[chatid].words.length; i++) {
                    let r = new RegExp(tbot.myDb[chatid].words[i]);
                    if (r.test(msgText.toLowerCase())) {
                        if (tbot.myDb[chatid].opts.memes) {
                            tbot.sendMeme(ctx, chatid, message.message_id);
                        } else {
                            ctx.reply("Trash!", {reply_to_message_id: message.message_id});
                        }
                        return;
                    }
                }
            }
        }
    }
});

process.on('SIGTERM', () => {
    console.log("Storing output");
    fs.writeFileSync('db/db.json', JSON.stringify(tbot.myDb));
});

process.on('SIGINT', () => {
    console.log("Storing output");
    let converted = {};
    fs.writeFileSync('db/db.json', JSON.stringify(tbot.myDb));
    process.exit();
});

tbot.run()
