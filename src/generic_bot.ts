import {TestCommand} from "./cmds/test"
import {PtoCommand} from "./cmds/pto"
import {CommandList, TelegramCommand} from "./cmds/base_cmd"
import {Context, Telegraf} from "telegraf";
import * as fs from "fs";
import {Db} from "./datastore";
import {Datastore} from "./datastore";
import {NewWordCommand} from "./cmds/add_word";
import {SonarrShowManagerCommand} from "./cmds/sonarr_show_manager";
import {SetupCommand} from "./cmds/setup";


abstract class TelegramBot {
    bot: Telegraf<Context>;
    commandModules: CommandList;
    dataStore: Datastore;

    protected constructor(bot: Telegraf<Context>, commandModules: CommandList) {
        this.bot = bot;
        this.commandModules = commandModules;
        if (fs.existsSync('db/db.json')) {
            if (fs.existsSync("db/db.json.lock")) {
                throw new Error("Database is locked by another process");
            }
            this.lockDb();
            this.setupShutdownHandlers();
            this.dataStore = new Datastore(JSON.parse(fs.readFileSync('db/db.json').toString()));
            this.dataStore.migrate()
        } else {
            this.dataStore = new Datastore({servers: {}, all_servers: {}});
        }
        this.addCommands();
    }

    setupShutdownHandlers() {
        process.on('SIGTERM', () => {
            this.shutdownHandler();
        });
        process.on('SIGINT', () => {
            this.shutdownHandler();
        });
    }

    shutdownHandler() {
        console.log("Releasing DB lock");
        this.unlockDb();
        process.exit();
    }

    lockDb() {
        fs.closeSync(fs.openSync('db/db.json.lock', 'w'));
    }

    unlockDb() {
        fs.writeFileSync("db/db.json", JSON.stringify(this.dataStore.myDb));
        fs.rmSync("db/db.json.lock",);
    }

    run() {
        this.bot.launch();
    }

    addCommands() {
        this.commandModules.forEach((cmd) => {
            let commandExecutor = new cmd(this.dataStore, this.bot);
            this.bot.command(commandExecutor.commandString, commandExecutor.handler.bind(this));
        });
    }
}


export class TrashBot extends TelegramBot {
    static commandModules = [
        TestCommand, PtoCommand, NewWordCommand, SonarrShowManagerCommand, SetupCommand
    ]

    constructor(bot: Telegraf<Context>) {
        super(bot, TrashBot.commandModules);
        this.bot.on('message', this.checkForTrash.bind(this));
    }

    async sendMeme(ctx: Context, chatId: number, messageId: number) {
        let memes = fs.readdirSync('media');
        let meme_fn = memes[Math.floor(Math.random() * memes.length)];
        await ctx.replyWithPhoto({source: `media/${meme_fn}`}, {reply_to_message_id: messageId});
    }

    async checkForTrash(ctx: Context) {
        let message = ctx.message;
        if (message !== undefined) {
            let chatid = message.chat.id;
            let groupChat = this.dataStore.getChat(chatid);
            if (chatid && groupChat) {
                if (groupChat.opts.readOnlyUsers.indexOf(message.from.id) > -1) {
                    ctx.deleteMessage(message.message_id);
                    return;
                }
            }

            if (groupChat !== undefined && groupChat.words.length > 0) {
                if ('text' in message) {
                    let msgText = message.text;
                    if (msgText.startsWith("/")) {
                        return;
                    }
                    for (let i = 0; i < groupChat.words.length; i++) {
                        let r = new RegExp(`\\b${groupChat.words[i]}\\b`);
                        if (r.test(msgText.toLowerCase())) {
                            if (groupChat.opts.memes) {
                                await this.sendMeme(ctx, chatid, message.message_id);
                            } else {
                                await ctx.reply("Trash!", {reply_to_message_id: message.message_id});
                            }
                            return;
                        }
                    }
                }
            }
        }
    }
}