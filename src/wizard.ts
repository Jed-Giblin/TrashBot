// import {Scenes, Context as TelegrafContext, Markup, Telegraf} from 'telegraf';
// import {
//     MenuTemplate,
//     MenuMiddleware,
//     createBackMainMenuButtons,
//     replyMenuToContext,
//     getMenuOfPath, editMenuOnContext
// } from 'telegraf-inline-menu'
// import TelegrafStatelessQuestion from "telegraf-stateless-question";
// import {ReplyToMessageContext} from "telegraf-stateless-question/dist/source/identifier";
// import {SonarrClient, SonarSearchResult} from "./sonarr";
//
// export class Wizard {
//     bot: Telegraf<MyContext>;
//     showOptions: MenuTemplate<MyContext> = new MenuTemplate<MyContext>(() => 'Search Results');
//     showManager: MenuTemplate<MyContext> = new MenuTemplate<MyContext>(() => 'Show Manager');
//     showQueryQuestion: TelegrafStatelessQuestion<MyContext>;
//
//     constructor(bot: Telegraf<MyContext>) {
//         this.showQueryQuestion = new TelegrafStatelessQuestion<MyContext>('show_question', this.getQueryStringCallback.bind(this));
//         this.bot = bot;
//         this.bot.use(this.showQueryQuestion.middleware());
//         this.setup();
//         this.middleware();
//     }
//
//     middleware() {
//         let showManager = new MenuMiddleware('/', this.showManager);
//         let showOptions = new MenuMiddleware('/shows/list/', this.showOptions);
//         this.bot.use(showOptions);
//         this.bot.use(showManager);
//     }
//
//     setup() {
//         this.showManager.interact('Add a show', 'add_show', {
//             do: this.addShowResponse.bind(this),
//         });
//     }
//
//     async getQueryStringCallback(ctx: ReplyToMessageContext<MyContext>, additionalState: string) {
//         if ('text' in ctx.message) {
//             console.log(`Searching for ${ctx.message.text} to ${additionalState}`);
//             await ctx.reply(`Searching for ${ctx.message.text}`);
//             await this.add_show(ctx.message.text, ctx);
//         } else {
//             console.log("No text");
//         }
//     }
//
//     async addShowResponse(context: MyContext, path: string) {
//         let text = "Please enter the show name"
//         console.log(path);
//         let additionalState = getMenuOfPath(path);
//         await this.showQueryQuestion.replyWithMarkdown(context, text, additionalState);
//         return true;
//     }
//
//     async add_show(query: string, ctx: MyContext) {
//         let client = new SonarrClient(process.env.SONARR_HOST || '',
//             process.env.SONARR_API_KEY || '',
//             process.env.SONARR_USERNAME,
//             process.env.SONARR_PASSWORD)
//
//         client.searchApi(query, async (data: SonarSearchResult[]) => {
//             await ctx.reply(`Found ${data.length} shows. Parsing options`);
//             this.showOptions.manualRow(createBackMainMenuButtons());
//             let showSubmenu = new MenuTemplate<MyContext>('Show Details');
//             // Add a button that would allow the user to add the show
//             showSubmenu.interact('Add Show!', `add_new_show`, {
//                 do: async (ctx) => {
//                     console.log("This will add the show");
//                     return false;
//                 }
//             });
//             this.showOptions.chooseIntoSubmenu('details_', data.map(d => d.title), showSubmenu, {});
//             await replyMenuToContext(this.showOptions, ctx, '/shows/list/');
//         });
//     }
//
//     reply(ctx: MyContext) {
//         let showManager = new MenuMiddleware('/', this.showManager);
//         showManager.replyToContext(ctx);
//     }
// }