export interface TrashbotOptions {
    defaultMemes: boolean
    sonarApiKey: string | undefined,
    radarApiKey: string | undefined
}

export type sonarrConfig = {
    addr: string,
    key: string,
    name: string,
    share: number
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
    [key: number]: ClientOpts,
    servers: {
        [key:string]: string[]
    },
    all_servers: {
        [key:string]: sonarrConfig
    }
}

export class Datastore {
    myDb: Db = { servers: {}, all_servers: {}};

    constructor(db: Db) {
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

    /**
     * Add a new SonarrServer to the DB
     * - Will also add it to the owner users cache
     * @param userId
     * @param server
     */
    addSonarrServer(userId: number, server: sonarrConfig) {
        this.myDb.all_servers[server.share] = server;
        this.addUserToServer(userId, server.share.toString());
    }

    /**
     * Migrate the DB
     */
    migrate() {
        if ( typeof(this.myDb.servers) === "undefined" ) {
            console.log("Migrating new servers table")
            this.myDb.servers = {};
        }
    }

    /**
     * Generate a unique code that is a numeric hash of the db items
     * @param key1
     * @param key2
     */
    generateShareCode(key1: string, key2: string) {
        let s = key1 + key2;
        return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
    }

    /**
     * Get a SonarrSerer by a number of filters
     * @param filter
     */
    getSonarr(filter: {code?: number}) {
        if ( filter.code ) {
            return this.myDb.all_servers[filter.code];
        }
    }

    /**
     * Add a sonarr server to a users cache
     * @param userId
     * @param server
     */
    addUserToServer(userId: number, server: string ) {
        if ( !this.myDb.servers.hasOwnProperty(userId) ) {
            this.myDb.servers[userId] = [];
        }
        this.myDb.servers[userId].push(server)
    }
}