export interface TrashbotOptions {
    defaultMemes: boolean
    sonarApiKey: string | undefined,
    radarApiKey: string | undefined
}

export interface ClientOpts {
    words: string[],
    opts: {
        memes: boolean
        readOnlyUsers: number[],
        allUsers: number[]
    }
}

export interface Db {
    [key: number]: ClientOpts
}

export class Datastore {
    myDb: Db = {};

    constructor(db: {}) {
        this.myDb = db;
    }

    getChat(id: number): (ClientOpts|undefined){
        if ( this.myDb[id] !== undefined ) {
            return this.myDb[id];
        }
        return undefined;
    }
    getAllChats(): ClientOpts[] {
        let chats: ClientOpts[] = [];
        Object.keys(this.myDb).forEach((key) => {
            if ( this.myDb.hasOwnProperty(key) ) {
                chats.push(this.myDb[Number(key)])
            }
        })
        return chats;
    }

    createChat(id: number): void {
        this.myDb[id] = {words: [], opts: {memes: false, readOnlyUsers: [], allUsers: []}};
    }
}