import {TrashBot} from "./generic_bot";
import {Context, Telegraf} from "telegraf";
import * as dotenv from "dotenv";
import {Datastore} from "./datastore";
dotenv.config();

const token = process.env.TRASH_BOT_TOKEN || '';
const sonarToken = process.env.SONAR_API_KEY;
let trashBot = new TrashBot(new Telegraf<Context>(token));
trashBot.run();