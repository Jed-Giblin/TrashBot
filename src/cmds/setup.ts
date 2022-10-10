import {errorPrivateOnly, TelegramBaseCommandImp, TelegramCommand} from "./base_cmd"
import {Context, Markup, Telegraf} from "telegraf";
import {Datastore, ClientOpts, sonarrConfig} from "../datastore";
import TelegrafStatelessQuestion from "telegraf-stateless-question";
import {LruCache} from "../cache";

export class SetupCommand extends TelegramBaseCommandImp {
    name: string = "Setup";
    commandString: string = "/setup"
    setupWizardCache: LruCache<sonarrConfig> = new LruCache<sonarrConfig>();
    sonarrAddressQuery: TelegrafStatelessQuestion<Context>;
    sonarrApiKeyQuery: TelegrafStatelessQuestion<Context>;
    sonarrNameQuery: TelegrafStatelessQuestion<Context>;
    sonarrJoinQuery: TelegrafStatelessQuestion<Context>;

    handler: (arg0: Context) => void = async (ctx: Context) => {
        if (ctx.chat?.type !== 'private') {
            await errorPrivateOnly(ctx);
        } else {
            await ctx.replyWithMarkdown(
                "What would you like to do?",
                Markup.inlineKeyboard([
                    Markup.button.callback('Add a Sonarr (shows) server', 'add_sonarr'),
                    Markup.button.callback('Join a Sonarr (shows) server', 'join_sonarr')
                ])
            );
        }
    }

    async addSonarrServer(ctx: Context) {
        await this.sonarrAddressQuery.replyWithMarkdown(ctx, "Ok. Whats the public FQDN of your server.");
        await ctx.answerCbQuery();
    }

    async joinSonarrServer(ctx: Context) {
        await this.sonarrJoinQuery.replyWithMarkdown(ctx, "Ok. Please provide the join code. The server owner can provide this to you.")
        await ctx.answerCbQuery();
    }

    async addSonarrAddrCallback(ctx: Context) {
        let message = ctx.message;
        if (message && 'text' in message) {
            let userId = message.from.id;
            let config: sonarrConfig = {addr: message.text, key: "", name: "", share: -1};
            this.setupWizardCache.put(userId, config);
            console.log(`Adding ${userId} to the cache. Starting with ${config}`)
            await this.sonarrApiKeyQuery.replyWithMarkdown(ctx, "Ok. And whats the API key I can use?");
        }
    }

    async addSonarrApiCallback(ctx: Context) {
        let message = ctx.message;
        if (message && 'text' in message) {
            let userId = message.from.id;
            if (this.setupWizardCache.get(userId)) {
                let config = this.setupWizardCache.get(userId);
                if (config) {
                    config.key = message.text;
                    this.setupWizardCache.put(userId, config)
                    await this.sonarrNameQuery.replyWithMarkdown(ctx, "Last Question. What should we call this?");
                }
            } else {
                console.log(`No record found for ${userId}`)
                await ctx.reply("Hm. I seem to have lost your first answer. Please start again")
            }
        } else {
            await ctx.reply("Hm. I seem to have lost your first answer. Please start again")
        }
    }

    async addSonarrNameCallback(ctx: Context) {
        let message = ctx.message;
        if (message && 'text' in message) {
            let userId = message.from.id;
            if (this.setupWizardCache.get(userId)) {
                let config = this.setupWizardCache.get(userId);
                if (config) {
                    let server: sonarrConfig = {
                        ...config,
                        name: message.text,
                        share: this.datastore.generateShareCode(config.addr, message.text)
                    }
                    this.datastore.addSonarrServer(userId, server);
                    await ctx.reply("Your server has been added. If you want others to join, please provide them with the following:")
                    await ctx.reply("Hi! Join my sonarr server by running the /setup command, and selecting Join a Sonarr(shows) server and use the following code")
                    await ctx.reply(server.share.toString());
                    return
                }
            }
        }
        await ctx.reply("I seem to have lost your previous answers. Sorry, please try again");
    }

    async joinSonarrCodeCallback(ctx: Context) {
        let message = ctx.message;
        if (message && 'text' in message) {
            let server = this.datastore.getSonarr({code: Number(message.text)})
            if (typeof (server) != "undefined") {
                let userId = message.from.id;
                this.datastore.addUserToServer(userId, server.share.toString());
                await ctx.reply("Alright! Your download requests will now use this server if its your only one, or prompt you otherwise.")
            } else {
                await ctx.reply("Hm. I couldn't find any servers with that code. Are you sure you entered it correctly?");
            }
        }
    }

    constructor(db: Datastore, bot: Telegraf<Context>) {
        super(db, bot);
        this.bot.action("add_sonarr", this.addSonarrServer.bind(this));
        this.bot.action("join_sonarr", this.joinSonarrServer.bind(this));
        this.sonarrAddressQuery = new TelegrafStatelessQuestion<Context>('add_sonar_addr', this.addSonarrAddrCallback.bind(this));
        this.sonarrApiKeyQuery = new TelegrafStatelessQuestion<Context>('add_sonar_key', this.addSonarrApiCallback.bind(this));
        this.sonarrNameQuery = new TelegrafStatelessQuestion<Context>('add_sonar_name', this.addSonarrNameCallback.bind(this));
        this.sonarrJoinQuery = new TelegrafStatelessQuestion<Context>('join_sonarr_code', this.joinSonarrCodeCallback.bind(this));
        this.bot.use(this.sonarrAddressQuery.middleware());
        this.bot.use(this.sonarrApiKeyQuery.middleware());
        this.bot.use(this.sonarrNameQuery.middleware());
        this.bot.use(this.sonarrJoinQuery.middleware());
    }
}