import {CommandList, TelegramBaseCommandImp, errorPrivateOnly} from "./base_cmd"
import {Context, Markup, NarrowedContext, Telegraf} from "telegraf";
import {ClientOpts} from "../trashbot";
import {Datastore} from "../datastore";
import TelegrafStatelessQuestion from "telegraf-stateless-question";
import {ReplyToMessageContext} from "telegraf-stateless-question/dist/source/identifier";
import {AddShowResult, SonarManagedShowListResult, SonarrClient, SonarSearchResult} from "../sonarr";
import {LruCache} from "../cache";
import {Update} from "typegram"

export class SonarrShowManagerCommand extends TelegramBaseCommandImp {
    name: string = "SonarrShowManager";
    commandString: string = "/shows"

    // Custom Properties
    showQueryQuestion: TelegrafStatelessQuestion<Context>;
    showCleanupQuestion: TelegrafStatelessQuestion<Context>;
    showCache: LruCache<SonarSearchResult> = new LruCache<SonarSearchResult>();
    sonarClient: SonarrClient;

    handler: (arg0: Context) => void = async (ctx: Context) => {
        if (ctx.chat?.type !== 'private') {
            await errorPrivateOnly(ctx);
        } else {
            await ctx.replyWithMarkdown(
                "What would you like to do?",
                Markup.inlineKeyboard([
                    Markup.button.callback('Add Show', 'add_show'),
                    Markup.button.callback('Clean up show', 'clean_up_show'),
                    Markup.button.callback('View my shows', 'my_shows')
                ])
            );
        }
    }

    /**
     * User click "Add Show"
     * @param ctx
     */
    async addShowClickedCallback(ctx: Context) {
        await this.showQueryQuestion.replyWithMarkdown(ctx, "Oh you want to add a show? Please respond with your search.");
        await ctx.answerCbQuery();
    }

    /**
     * User confirmed the AddShow button for a specific show
     * @param ctx
     */
    async addShowConfirmAddShowCallback(ctx:  NarrowedContext<Context<Update> & {match: RegExpExecArray}, Update.CallbackQueryUpdate>) {
        if ('match' in ctx) {
            let showId = ctx.match[1];
            let show = this.showCache.get(Number(showId));
            if (show) {
                await ctx.answerCbQuery();
                await ctx.reply("Adding show!");
                if (!ctx.chat) {
                    return
                }
                await this.sonarClient.addShow(show, ctx.chat.id, async (err, data: AddShowResult) => {
                    if (!err) {
                        await this.sonarClient.searchForEpisodes(data.id);
                        await ctx.reply("Trying to download the last season");
                    } else {
                        await ctx.reply(`Something went wrong: ${err}`);
                    }
                });
            }
        }
    }

    /**
     * User clicked a show from the list
     * @param localCtx
     */
    async addShowSelectShowCallback(localCtx:  NarrowedContext<Context<Update> & {match: RegExpExecArray}, Update.CallbackQueryUpdate>) {
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
    }

    /**
     * The user entered text to search for AddShow
     * @param ctx
     * @param additionalState
     */
    async addShowSearchCallback(ctx: ReplyToMessageContext<Context>, additionalState: string) {
        let message = ctx.message;
        if ( message && 'text' in message) {
            let msgText = message.text;

            await ctx.reply(`Searching for ${msgText}`);

            try {
                let data = await this.sonarClient.searchApi(msgText);
                let buttons = data.slice(0, 20).map((show) => {
                    this.showCache.put(show.tvdbId, show);
                    return [Markup.button.callback(`${show.title} (${show.year}) (${show.network})`, `show_${show.tvdbId}`)];
                });
                await ctx.replyWithMarkdown(`Here are the first 20 of ${data.length} results.`, Markup.inlineKeyboard(buttons));
            } catch (e) {
                await ctx.reply(`Something went wrong while trying to to search for shows. ${e.toString()}`);
            }
        }
    }

    /**
     * user clicked Clean Show
     * @param ctx
     */
    async cleanShowClickedCallback(ctx: Context) {
        await this.showCleanupQuestion.replyWithMarkdown(ctx, "Please type the name of the show you want to clean up");
        await ctx.answerCbQuery();
    }

    async cleanShowSelectShowCallback(localCtx:  NarrowedContext<Context<Update> & {match: RegExpExecArray}, Update.CallbackQueryUpdate>) {
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
    }

    async cleanupShowConfirmCleanCallback(ctx:  NarrowedContext<Context<Update> & {match: RegExpExecArray}, Update.CallbackQueryUpdate>) {
        if ('match' in ctx) {
            let showId = ctx.match[1];
            let show = this.showCache.get(Number(showId));
            let author = ctx.from;
            let authorName = 'Someone in chat'
            if (author !== undefined) {
                if (author.username !== undefined) {
                    authorName = author.username;
                } else {
                    authorName = author.first_name;
                }
            }
            if (show) {
                await ctx.answerCbQuery();
                await ctx.reply("Cleaning Show");
                this.sonarClient.cleanShow(show, async (err, data: SonarSearchResult) => {
                    if (!err) {
                        let tagList = await this.sonarClient.searchTags();
                        let tagIdList = tagList.map((t) => {
                            if (t.label.startsWith('tg:')) {
                                return t.id;
                            }
                        });
                        for (let i = 0; i <= data.tags.length; i++) {
                            let existingShowTag = data.tags[i];
                            if (tagIdList.indexOf(existingShowTag) > -1) {
                                console.log("Found a TG user tag on the show")
                                // The tag exists, notify user.
                                let tagToUse = tagList.find(t => t.id === existingShowTag);
                                if (tagToUse) {
                                    console.log("Properly found the tag Value")
                                    let chatId = tagToUse.label.split(':')[1];
                                    if (chatId) {
                                        console.log(`Found the chatID: ${chatId}`)
                                        console.log('Message is defined')
                                        // @ts-ignore

                                        let body = `${data.title} is being cleaned up by ${authorName}`
                                        console.log(body);
                                        await this.bot.telegram.sendMessage(chatId, body);
                                        await this.sonarClient.cleanFiles(data, async (deleted) => {
                                            await ctx.reply(`Deleted ${deleted / 1000000000} Gb of space`);
                                        });
                                        await ctx.reply("Cleaning up the seasons");
                                    }
                                }
                            }
                        }
                    } else {
                        await ctx.reply(`Something went wrong: ${err}`);
                    }
                });
            }
        }
    }

    async cleanupShowSearchCallback(ctx: ReplyToMessageContext<Context>, additionalState: string) {
        if ('text' in ctx.message) {
            await ctx.reply(`Looking for ${ctx.message.text} to cleanup`);
            let term = ctx.message.text;
            this.sonarClient.searchShows(async (data: SonarManagedShowListResult[]) => {
                let buttons = data.map((show) => {
                    console.log(`${show.title} lookup ${term}`);
                    if (show.title.toUpperCase().match(term.toUpperCase())) {
                        this.showCache.put(show.id, show);
                        return [Markup.button.callback(`${show.title}) (${show.network})`, `clean_show_${show.id}`)];
                    } else {
                        return []
                    }
                });
                await ctx.replyWithMarkdown(`Here are the first 20 of ${data.length} results.`, Markup.inlineKeyboard(buttons));
            });
        }
    }

    /**
     * Callback for when a user clicks MyShows
     * @param ctx
     */
    async myShowsCallback(ctx: Context) {
        let chat = ctx.chat;
        let chatId = -1;
        let userShows: string[] = [];
        if (chat !== undefined) {
            chatId = chat.id;
        }
        if (chatId > 0) {
            let tagList = await this.sonarClient.searchTags();
            let userTag = tagList.find((t) => {
                return t.label === `tg:${chatId}`;
            });
            if (userTag !== undefined) {
                this.sonarClient.searchShows(async (showList) => {
                    for (let i = 0; i < showList.length; i++) {
                        let show = showList[i];
                        // @ts-ignore
                        if (show.tags.includes(userTag.id)) {
                            userShows.push(show.title);
                        }
                    }
                    if (userShows.length > 0) {
                        await ctx.reply(userShows.join("\n"));
                    } else {
                        await ctx.reply("You have no current shows")
                    }
                });
            } else {
                await ctx.reply("You have never added a show");
            }
        } else {
            await ctx.reply("Hmm. I something went wrong. This statement is false");
        }
    }

    constructor(db: Datastore, bot: Telegraf<Context>) {
        super(db, bot);
        this.sonarClient = new SonarrClient(process.env.SONARR_HOST || '',
            process.env.SONARR_API_KEY || '',
            process.env.SONARR_USERNAME,
            process.env.SONARR_PASSWORD)
        /**
         * These are the actions for the AddShow workflow
         */
        this.bot.action("add_show", this.addShowClickedCallback.bind(this));
        this.bot.action(/show_(.*)/, this.addShowSelectShowCallback.bind(this));
        this.bot.action(/confirm_add_(.*)/, this.addShowConfirmAddShowCallback.bind(this));
        this.showQueryQuestion = new TelegrafStatelessQuestion<Context>('show_question', this.addShowSearchCallback.bind(this));
        this.bot.use(this.showQueryQuestion.middleware())
        /**
         * These are teh actions for the CLeanShow workflow
         */
        this.bot.action('clean_up_show', this.cleanShowClickedCallback.bind(this));
        this.bot.action(/clean_show_(.*)/, this.cleanShowSelectShowCallback.bind(this));
        this.bot.action(/confirm_clean_(.*)/, this.cleanupShowConfirmCleanCallback.bind(this));
        this.showCleanupQuestion = new TelegrafStatelessQuestion<Context>('show_cleanup', this.cleanupShowSearchCallback.bind(this));
        this.bot.use(this.showCleanupQuestion.middleware());

        /**
         * These are the actions for the MyShows workflow
         */
        this.bot.action('my_shows', this.myShowsCallback.bind(this));
    }
}