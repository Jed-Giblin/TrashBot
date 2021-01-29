import {Telegraf, Context} from 'telegraf'
import {ParseMode} from "telegraf/typings/telegram-types";
import * as fs from "fs";
import {openSync} from "fs";

const token = process.env.TRASH_BOT_TOKEN || '';
const bot = new Telegraf(token);
interface ClientOpts {
    words: string[],
    opts: {
        memes: boolean
    }
}
interface Db {
    [key: number]: ClientOpts
}

var myDb: Db;

if ( fs.existsSync('db/db.json') ) {
    myDb = JSON.parse(fs.readFileSync('db/db.json').toString());
} else {
    myDb = {};
}


bot.command('newword', (ctx: Context) => {
   let message = ctx.message;
   if ( message !== undefined ) {
       let word = message.text;
       if ( word !== undefined ) {
           let realWords = word.split(" ");
           realWords.splice(0, 1);
           let realWord = realWords.join(" ");
           let chatid = message.chat.id;
           if ( myDb[chatid] === undefined ) {
               myDb[chatid] = { words: [], opts: { memes: false }};
               myDb[chatid].words.push(`.*${realWord.toLowerCase()}.*`);
               ctx.reply(`Added a new trigger word: ${realWord}`);
           } else {
               myDb[chatid].words.push(`.*${realWord.toLowerCase()}.*`);
               ctx.reply(`Added a new trigger word: ${realWord}`);
           }
       } else {
           ctx.reply("No word found");
       }
   } else {
       ctx.reply("No word found");
   }
});

bot.command('/meme', (ctx: Context) => {
    let message = ctx.message;
    if ( message !== undefined ) {
        let chatId = message.chat.id;
        if ( myDb[chatId] === undefined ) {
            myDb[chatId] = { words: [], opts: { memes: true }};
        } else {
            myDb[chatId].opts.memes = !myDb[chatId].opts.memes;
        }

        ctx.reply("Memes have been enabled for your chat room");
    }
});

bot.on('message', (ctx: Context) => {
    let message = ctx.message;
    if ( message !== undefined ) {
        let chatid = message.chat.id;
        if ( chatid !== undefined && myDb[chatid] !== undefined && myDb[chatid].words.length > 0 ) {
            let msgText = message.text;
            if ( msgText !== undefined ) {
                if ( msgText.startsWith("/") ) {
                    return;
                }
                for ( let i = 0; i < myDb[chatid].words.length; i++ ) {
                    let r = new RegExp(myDb[chatid].words[i]);
                    if ( r.test(msgText.toLowerCase()) ) {
                        if ( myDb[chatid].opts.memes ) {
                            sendMeme(ctx, chatid, message.message_id);
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

function sendMeme(ctx: Context, chatId: Number, replyId: number) {
    let memes = fs.readdirSync('media');
    let meme_fn = memes[Math.floor(Math.random() * memes.length)];
    ctx.replyWithPhoto({source: `media/${meme_fn}`}, {reply_to_message_id: replyId});
}

process.on('SIGTERM', () => {
   console.log("Storing output");
   fs.writeFileSync('db/db.json', JSON.stringify(myDb));
});

process.on('SIGINT', () => {
    console.log("Storing output");
    let converted = {};
    fs.writeFileSync('db/db.json', JSON.stringify(myDb));
    process.exit();
});

bot.launch();
