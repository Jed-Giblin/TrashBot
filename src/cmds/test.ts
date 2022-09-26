import {TelegramBaseCommandImp, TelegramCommand} from "./base_cmd"
import {Context} from "telegraf";

export class TestCommand extends TelegramBaseCommandImp {
    name: string = "TestCommand";
    commandString: string = "/test"
    handler: (arg0: Context) => void = async (ctx: Context) => {
        await ctx.setChatMenuButton({
            type: 'web_app',
            text: 'Open WebApp',
            web_app: {
                url: 'https://45a9ae24f8ce.ngrok.io/'
            },
        });
        await ctx.reply("Ok");
        await ctx.reply(JSON.stringify(this.datastore.myDb));
    }

}