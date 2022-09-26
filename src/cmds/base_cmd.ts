import {Context, Telegraf} from "telegraf";
import {Datastore} from "../datastore";


export async function errorPrivateOnly(ctx: Context): Promise<void> {
    await ctx.reply("Sorry, this command is only available in a 1-1 message.");
}

export type CommandList = { new(arg0: Datastore, arg1: Telegraf<Context>): TelegramCommand }[];

export interface TelegramCommand {
    name: string;
    commandString: string;
    handler: (arg0: Context) => void;
}

export class TelegramBaseCommandImp implements TelegramCommand{
    name = "NYI";
    commandString = "";
    datastore: Datastore
    bot: Telegraf<Context>;

    handler(ctx0: Context) {
        throw new Error("Missing implementation for class");
    }

    constructor(db: Datastore, bot: Telegraf<Context>) {
        this.datastore = db;
        this.bot = bot;
    }
}