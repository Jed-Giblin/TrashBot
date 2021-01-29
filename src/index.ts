import {Telegraf, Context} from 'telegraf'
import {ParseMode} from "telegraf/typings/telegram-types";

const token = process.env.TRASH_BOT_TOKEN || '';
const bot = new Telegraf(token);
interface Db {
    [key: number]: RegExp[]
}

const myDb: Db = {};

// bot.start( (ctx: Context) => {
//     ctx.reply('Im online');
// });
//
// bot.hears("new game", (ctx: Context) => {
//    ctx.reply("Starting a new game");
// });
//
// bot.command('newgame', (ctx: Context) => {
//    ctx.reply("Started a new game");
// });
//
// bot.command('enter', (ctx: Context) => {
//     if ( ctx.message !== undefined ) {
//         if ( ctx.message.from !== undefined ) {
//             ctx.reply(`Got it [${ctx.message.from.first_name}](tg://user?id=${ctx.message.from.id})`, {  parse_mode: "Markdown"})
//         }
//
//     } else {
//         ctx.reply("Message was undefined")
//     }
// });
// let regexp: RegExp = /.*gulshan.*/;
// bot.hears(regexp, (ctx: Context) => {
//    let msg = ctx.message;
//    if ( msg !== undefined ) {
//
//
//    }
// });

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
               myDb[chatid] = [];
               let regex = new RegExp(`.*${realWord.toLowerCase()}.*`);
               myDb[chatid].push(regex);
               ctx.reply(`Added a new trigger word: ${realWord}`);
           } else {
               let regex = new RegExp(`.*${realWord.toLowerCase()}.*`);
               myDb[chatid].push(regex);
               ctx.reply(`Added a new trigger word: ${realWord}`);
           }
       } else {
           ctx.reply("No word found");
       }
   } else {
       ctx.reply("No word found");
   }
});

bot.on('message', (ctx: Context) => {
    let message = ctx.message;
    if ( message !== undefined ) {
        let chatid = message.chat.id;
        if ( chatid !== undefined && myDb[chatid] !== undefined && myDb[chatid].length > 0 ) {
            let msgText = message.text;
            if ( msgText !== undefined ) {
                if ( msgText.startsWith("/") ) {
                    return;
                }
                for ( let i = 0; i < myDb[chatid].length; i++ ) {
                    let r: RegExp = myDb[chatid][i];
                    if ( r.test(msgText.toLowerCase()) ) {
                        ctx.reply("Trash!", {reply_to_message_id: message.message_id});
                        return;
                    }
                }
            }
        }
    }
});

bot.launch();
