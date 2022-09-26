import {TelegramBaseCommandImp, TelegramCommand} from "./base_cmd"
import {Context} from "telegraf";
import {Datastore, ClientOpts} from "../datastore";

export class EnableMemesCommand extends TelegramBaseCommandImp {
    name: string = "EnableMemesCommand";
    commandString: string = "/pto"
    handler: (arg0: Context) => void = async (ctx: Context) => {
        let message = ctx.message;
        if (message !== undefined) {
            let chatId = message.chat.id;
            if (this.datastore.getChat(chatId) === undefined) {
                this.datastore.createChat(chatId)
            }
            let groupChat = this.datastore.getChat(chatId);
            if ( groupChat ) {
                groupChat.opts.memes = !groupChat.opts.memes
            }
            await ctx.reply("Memes have been enabled for your chat room");
        }
    }
}