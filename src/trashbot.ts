import * as fs from "fs";
import {Markup, Scenes, Telegraf, Context} from 'telegraf'
import {InlineKeyboardMarkup} from "telegraf/src/telegram-types";
import TelegrafStatelessQuestion from "telegraf-stateless-question";
import {ReplyToMessageContext} from "telegraf-stateless-question/dist/source/identifier";
import {AddShowResult, SonarrClient, SonarSearchResult} from "./sonarr";
import {LruCache} from "./cache";

const DEFAULT_OPTS = {defaultMemes: false, sonarApiKey: undefined, radarApiKey: undefined};

interface TrashbotOptions {
    defaultMemes: boolean
    sonarApiKey: string | undefined,
    radarApiKey: string | undefined
}

interface ClientOpts {
    words: string[],
    opts: {
        memes: boolean
    }
}

interface Db {
    [key: number]: ClientOpts
}

export class TrashBot {
    private opts: TrashbotOptions;
    myDb: Db;
    bot: Telegraf<Context>;
    showQueryQuestion: TelegrafStatelessQuestion<Context>;
    showCache: LruCache<SonarSearchResult> = new LruCache<SonarSearchResult>();
    sonarClient: SonarrClient;

    constructor(apiKey: string, opts?: TrashbotOptions) {
        if (opts == undefined) {
            this.opts = DEFAULT_OPTS
        } else {
            this.opts = opts;
        }

        this.sonarClient = new SonarrClient(process.env.SONARR_HOST || '',
            process.env.SONARR_API_KEY || '',
            process.env.SONARR_USERNAME,
            process.env.SONARR_PASSWORD)

        if (fs.existsSync('db/db.json')) {
            this.myDb = JSON.parse(fs.readFileSync('db/db.json').toString());
        } else {
            this.myDb = {};
        }
        this.showQueryQuestion = this.showQueryQuestionGen();
        this.bot = new Telegraf<Context>(apiKey);
        this.initCommands();
    }

    sendMeme(ctx: Context, chatId: Number, replyId: number) {
        let memes = fs.readdirSync('media');
        let meme_fn = memes[Math.floor(Math.random() * memes.length)];
        ctx.replyWithPhoto({source: `media/${meme_fn}`}, {reply_to_message_id: replyId});
    }

    /**
     * Initialize all the handlers
     */
    initCommands() {
        this.bot.command('newword', this.newWordCallback.bind(this));
        this.bot.command('/meme', this.memeCallback.bind(this));
        this.bot.command('/shows', async (ctx: Context) => {
            if (ctx.chat?.type !== 'private') {
                await TrashBot.errorPrivateOnly(ctx);
            } else {
                await ctx.replyWithMarkdown(
                    "What would you like to do?",
                    this.showManagerOptions()
                );
            }
        });

        /**
         * This handler runs when a user clicks a show name from the list of choices returned from a search
         */
        this.bot.action(/show_(.*)/, async (localCtx) => {
            if ('match' in localCtx) {
                let showId = localCtx.match[1].trim();
                console.log(`User selected ${showId}`);
                console.log(this.showCache.cachedIds());
                let show = this.showCache.get(Number(showId));
                if (show) {
                    if (show.remotePoster) {
                        await localCtx.replyWithPhoto(show.remotePoster);
                    }
                    let showDetails = `${show.title} (${show.year}) (${show.network})`;
                    await localCtx.replyWithMarkdown(showDetails, Markup.inlineKeyboard([
                        Markup.button.callback('Click here to add', `confirm_add_${show.tvdbId}`)
                    ]));
                    await localCtx.answerCbQuery();
                } else {
                    console.log(`Show ${showId} wasn't cached`);
                }
            }
        });

        /**
         * This handler runs when a user clicks the button
         */
        this.bot.action(/confirm_add_(.*)/, async (ctx) => {
            if ('match' in ctx) {
                let showId = ctx.match[1];
                let show = this.showCache.get(Number(showId));
                if (show) {
                    await ctx.answerCbQuery();
                    await ctx.reply("Adding show!");
                    this.sonarClient.addShow(show, async (err, data:AddShowResult) => {
                       if ( !err ) {
                           //await this.sonarClient.searchForEpisodes(data.id);
                           await ctx.reply("Trying to download the last season");
                       } else {
                           await ctx.reply(`Something went wrong: ${err}`);
                       }
                    });
                }
            }
        });

        /**
         * This handler runs when the user clicks the "Add Show" button in response to action choice prompt
         */
        this.bot.action('add_show', async (ctx: Context) => {
            await this.showQueryQuestion.replyWithMarkdown(ctx, "Oh you want to add a show? Please respond with your search.");
            await ctx.answerCbQuery();
        });

        this.bot.use(this.showQueryQuestion.middleware());
    }

    showManagerOptions() {
        return Markup.inlineKeyboard([
            Markup.button.callback('Add Show', 'add_show')
        ])
    }

    showQueryQuestionGen() {
        return new TelegrafStatelessQuestion<Context>('show_question', async (ctx: ReplyToMessageContext<Context>, additionalState: string) => {
            if ('text' in ctx.message) {
                await ctx.reply(`Searching for ${ctx.message.text}`);

                this.sonarClient.searchApi(ctx.message.text, async (data: SonarSearchResult[]) => {
                    let buttons = data.map((show) => {
                        this.showCache.put(show.tvdbId, show);
                        return [Markup.button.callback(`${show.title}`, `show_${show.tvdbId}`)];
                    });
                    await ctx.replyWithMarkdown("Here are the results", Markup.inlineKeyboard(buttons));
                });
            }
        });
    }


    run() {
        this.bot.launch();
    }

    memeCallback(ctx: Context) {
        let message = ctx.message;
        if (message !== undefined) {
            let chatId = message.chat.id;
            if (this.myDb[chatId] === undefined) {
                this.myDb[chatId] = {words: [], opts: {memes: true}};
            } else {
                this.myDb[chatId].opts.memes = !this.myDb[chatId].opts.memes;
            }
            ctx.reply("Memes have been enabled for your chat room");
        }
    }

    newWordCallback(ctx: Context) {
        let message = ctx.message;
        if (message !== undefined) {
            if ('text' in message) {
                let word = message.text;
                let realWords = word.split(" ");
                realWords.splice(0, 1);
                let realWord = realWords.join(" ");
                let chatid = message.chat.id;
                if (this.myDb[chatid] === undefined) {
                    this.myDb[chatid] = {words: [], opts: {memes: false}};
                    this.myDb[chatid].words.push(`.*${realWord.toLowerCase()}.*`);
                    ctx.reply(`Added a new trigger word: ${realWord}`);
                } else {
                    this.myDb[chatid].words.push(`.*${realWord.toLowerCase()}.*`);
                    ctx.reply(`Added a new trigger word: ${realWord}`);
                }
            } else {
                ctx.reply("No word found");
            }
        } else {
            ctx.reply("No word found");
        }
    }

    static async errorPrivateOnly(ctx: Context) {
        await ctx.reply("Sorry, this command is only available in a 1-1 message.");
    }
}
