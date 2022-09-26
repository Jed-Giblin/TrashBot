import {TelegramBaseCommandImp, TelegramCommand} from "./base_cmd"
import {Context} from "telegraf";
import {ClientOpts} from "../trashbot";
import {Datastore} from "../datastore";

export class PtoCommand extends TelegramBaseCommandImp {
    name: string = "PtoCommand";
    commandString: string = "/pto"
    handler: (arg0: Context) => void = async (ctx: Context) => {
        let message = ctx.message;
        if (message !== undefined) {
            let author = message.from.id;
            let chat = message.chat.id;
            if (ctx.chat?.type === 'private') {
                let ptoChats = 0;
                this.datastore.getAllChats().forEach( (chatGroup) => {
                   if ( chatGroup.opts.readOnlyUsers.indexOf( author ) > -1 ) {
                       ptoChats++;
                   }
                });
                await ctx.reply(`You are on PTO in ${ptoChats} groups`);
            } else {
                let chatModel: ClientOpts | undefined = this.datastore.getChat(chat);
                if (chatModel !== undefined) {
                    if (chatModel.opts.readOnlyUsers.indexOf(author) > -1) {
                        let index = chatModel.opts.readOnlyUsers.indexOf(author);
                        chatModel.opts.readOnlyUsers.splice(index, 1);
                    } else {
                        chatModel.opts.readOnlyUsers.push(author);
                    }
                }
            }

        }
    }
}