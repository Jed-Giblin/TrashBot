import {TelegramBaseCommandImp, TelegramCommand} from "./base_cmd"
import {Context} from "telegraf";
import {Datastore,ClientOpts} from "../datastore";

export class NewWordCommand extends TelegramBaseCommandImp {
    name: string = "NewWordCommand";
    commandString: string = "/newword"
    handler: (arg0: Context) => void = async (ctx: Context) => {
        let message = ctx.message;
        if (message !== undefined) {
            if ('text' in message) {
                let word = message.text;
                let realWords = word.split(" ");
                realWords.splice(0, 1);
                let realWord = realWords.join(" ");
                let chatid = message.chat.id;
                if (this.datastore.getChat(chatid) === undefined) {
                    this.datastore.createChat(chatid);
                }
                this.datastore.getChat(chatid)?.words.push(`${realWord.toLowerCase()}`);
                await ctx.reply(`Added a new trigger word: ${realWord}`);
            } else {
                await ctx.reply("No word found");
            }
        } else {
            await ctx.reply("No word found");
        }
    }
}