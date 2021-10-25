import * as fs from "fs";
import {Markup, Scenes, Telegraf, Context} from 'telegraf'
import {InlineKeyboardMarkup} from "telegraf/src/telegram-types";
import TelegrafStatelessQuestion from "telegraf-stateless-question";
import {ReplyToMessageContext} from "telegraf-stateless-question/dist/source/identifier";
import {AddShowResult, SonarManagedShowListResult, SonarrClient, SonarSearchResult} from "./sonarr";
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
        readOnlyUsers: number[],
        allUsers: number[]
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
    showCleanupQuestion: TelegrafStatelessQuestion<Context>;
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
        this.showCleanupQuestion = this.showCleanupQuestionGen();
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
        this.bot.command('/pto', async (ctx: Context) => {
            let message = ctx.message;
            if (message !== undefined) {
                let author = message.from.id;
                let chat = message.chat.id;
                if (this.myDb[chat] !== undefined) {
                    let opts = this.myDb[chat];
                    if (opts.opts.readOnlyUsers.indexOf(author) > -1) {
                        let index = opts.opts.readOnlyUsers.indexOf(author);
                        opts.opts.readOnlyUsers.splice(index, 1);
                    } else {
                        opts.opts.readOnlyUsers.push(author);
                    }
                }
            }
        });
        this.bot.command('newword', this.newWordCallback.bind(this));
        this.bot.command('/meme', this.memeCallback.bind(this));
        this.bot.command('/joinall', async (ctx: Context) => {
            let message = ctx.message;
            if (message != undefined) {
                let author = message.from.id;
                let chat = message.chat.id;
                if (this.myDb[chat] !== undefined) {
                    let opts = this.myDb[chat];
                    if (typeof (opts.opts.allUsers) === 'undefined') {
                        opts.opts.allUsers = [];
                    }
                    opts.opts.allUsers.push(author);
                }
            }
        });

        this.bot.command('/remindme', async(ctx: Context) => {
            let message = ctx.message;
            if ( message != undefined ) {

            }
        });

        this.bot.command('/noall', async (ctx: Context) => {
            let message = ctx.message;
            if (message != undefined) {
                let author = message.from.id;
                let chat = message.chat.id;
                if (this.myDb[chat] !== undefined) {
                    let opts = this.myDb[chat];
                    if (typeof (opts.opts.allUsers) === 'undefined') {
                        opts.opts.allUsers = [];
                    }
                    let index = opts.opts.allUsers.indexOf(author);
                    if (index > -1) {
                        opts.opts.allUsers.splice(index, 1);
                    }
                }
            }
        });

        this.bot.command('/sendall', async (ctx: Context) => {
            let message = ctx.message;
            if (message != undefined) {
                let chat = message.chat.id;
                if (this.myDb[chat] !== undefined) {
                    let opts = this.myDb[chat];
                    if ( opts.opts.allUsers.length > 0 ) {
                        let mentions: string[] = [];
                        opts.opts.allUsers.forEach((id: number) => {
                           mentions.push(`[test](tg://user?id=${id}) `)
                        });
                        ctx.replyWithMarkdown(mentions.join(''), {reply_to_message_id: message.message_id, parse_mode: "Markdown"})
                    }
                }
            }
        });

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
         * This handler runs when a user clicks a show name from the list of choices returned from a cleanup search
         */
        this.bot.action(/clean_show_(.*)/, async (localCtx) => {
            if ('match' in localCtx) {
                let showId = localCtx.match[1].trim();
                let show = this.showCache.get(Number(showId));
                if (show) {
                    if (show.remotePoster) {
                        await localCtx.replyWithPhoto(show.remotePoster);
                    }
                    let showDetails = `${show.title} (${show.year}) (${show.network})`;
                    await localCtx.replyWithMarkdown(showDetails, Markup.inlineKeyboard([
                        Markup.button.callback('Click here to clean up', `confirm_clean_${show.id}`)
                    ]));
                    await localCtx.answerCbQuery();
                } else {
                    console.log(`Show ${showId} wasn't cached`);
                }
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
                    this.sonarClient.addShow(show, async (err, data: AddShowResult) => {
                        if (!err) {
                            await this.sonarClient.searchForEpisodes(data.id);
                            await ctx.reply("Trying to download the last season");
                        } else {
                            await ctx.reply(`Something went wrong: ${err}`);
                        }
                    });
                }
            }
        });

        /**
         * This handler runs when a user clicks confirm clean
         */
        this.bot.action(/confirm_clean_(.*)/, async (ctx) => {
            if ('match' in ctx) {
                let showId = ctx.match[1];
                let show = this.showCache.get(Number(showId));
                if (show) {
                    await ctx.answerCbQuery();
                    await ctx.reply("Cleaning Show");
                    this.sonarClient.cleanShow(show, async (err, data: SonarSearchResult) => {
                        if (!err) {
                            await this.sonarClient.cleanFiles(data, async (deleted) => {
                                await ctx.reply(`Deleted ${deleted / 1000000} Gb of space`);
                            });
                            await ctx.reply("Cleaning up the seasons");
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

        this.bot.action('clean_up_show', async(ctx: Context) => {
           await this.showCleanupQuestion.replyWithMarkdown(ctx, "Please type the name of the show you want to clean up");
           await ctx.answerCbQuery();
        });

        this.bot.use(this.showQueryQuestion.middleware());
        this.bot.use(this.showCleanupQuestion.middleware());
    }

    showManagerOptions() {
        return Markup.inlineKeyboard([
            Markup.button.callback('Add Show', 'add_show'),
            Markup.button.callback('Clean up show', 'clean_up_show')
        ])
    }

    showQueryQuestionGen() {
        return new TelegrafStatelessQuestion<Context>('show_question', async (ctx: ReplyToMessageContext<Context>, additionalState: string) => {
            if ('text' in ctx.message) {
                await ctx.reply(`Searching for ${ctx.message.text}`);

                this.sonarClient.searchApi(ctx.message.text, async (data: SonarSearchResult[]) => {
                    let buttons = data.slice(0, 20).map((show) => {
                        this.showCache.put(show.tvdbId, show);
                        return [Markup.button.callback(`${show.title} (${show.year}) (${show.network})`, `show_${show.tvdbId}`)];
                    });
                    await ctx.replyWithMarkdown(`Here are the first 20 of ${data.length} results.`, Markup.inlineKeyboard(buttons));
                });
            }
        });
    }

    showCleanupQuestionGen() {
        return new TelegrafStatelessQuestion<Context>('show_cleanup', async (ctx: ReplyToMessageContext<Context>, additionalState: string) => {
            if ('text' in ctx.message) {
                await ctx.reply(`Looking for ${ctx.message.text} to cleanup`);
                let term = ctx.message.text;
                this.sonarClient.searchShows(async (data: SonarManagedShowListResult[]) => {
                    let buttons = data.map((show) => {
                        console.log(`${show.title} lookup ${term}`);
                        if ( show.title.toUpperCase().match(term.toUpperCase())) {
                            this.showCache.put(show.id, show);
                            return [Markup.button.callback(`${show.title}) (${show.network})`, `clean_show_${show.id}`)];
                        } else {
                            return []
                        }
                    });
                    await ctx.replyWithMarkdown(`Here are the first 20 of ${data.length} results.`, Markup.inlineKeyboard(buttons));
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
                this.myDb[chatId] = {words: [], opts: {memes: true, readOnlyUsers: [], allUsers: []}};
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
                    this.myDb[chatid] = {words: [], opts: {memes: false, readOnlyUsers: [], allUsers: []}};
                    this.myDb[chatid].words.push(`${realWord.toLowerCase()}`);
                    ctx.reply(`Added a new trigger word: ${realWord}`);
                } else {
                    this.myDb[chatid].words.push(`${realWord.toLowerCase()}`);
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
