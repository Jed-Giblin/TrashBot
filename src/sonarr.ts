import * as https from 'https'

export interface SeriesImage {
    coverType: string,
    url: string
}

export interface SeriesSeason {
    seasonNumber: number,
    monitored: boolean
}

export interface SonarSearchResult {
    title: string
    sortTitle: string
    seasonCount: number
    status: string
    overview: string
    network: string
    remotePoster: string,
    seasons: SeriesSeason[],
    year: number,
    profileId: number,
    tvdbId: number,
    tvRageId: number,
    tvMazeId: number,
    titleSlug: string,
    images: SeriesImage[]
}

export interface AddShowResult {
    id: number,
    monitored: boolean,
    seasons: SeriesSeason[]
}

export class SonarrClient {
    private readonly ip: string;
    private readonly apiKey: string;
    private readonly auth: boolean = false;
    private username: string | undefined;
    private password: string | undefined;

    constructor(ip: string, apiKey: string, username?: string, password?: string) {
        this.ip = ip;
        this.apiKey = apiKey;
        if (username !== undefined && password !== undefined) {
            this.auth = true;
            this.username = username;
            this.password = password;
        }
    }
    options(): https.RequestOptions {
        let options: https.RequestOptions = {}
        if ( this.auth ) {
            options.headers = {
                'Authorization': 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
            }
        }
        options.host = this.ip
        return options;
    }

    searchApi(term: string, cb: (data: any) => any) {
        let options = this.options();
        options.path = `/api/series/lookup?term=${term}&apiKey=${this.apiKey}`

        https.get(options, (resp) => {
            let data = '';
            resp.on('data', (chunk) => {
                data += chunk;
            });
            resp.on('end', () => {
                cb(JSON.parse(data));
            });
        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
    }

    addShow(show:SonarSearchResult, cb: (err: Error|undefined, data: any) => any) {
        let seasons = show.seasons.sort( (a,b) => {
            return  ( a.seasonNumber > b.seasonNumber ? 1 : -1 )
        }).map( (s, i) => {
           if ( i !== show.seasons.length -1 ) {
               s.monitored = false;
           }
           return s;
        });

        let body: object = {
            tvDbId: show.tvdbId, title: show.title, profileId: 1,
            titleSlug: show.titleSlug, images: show.images, seasons: seasons,
            RootFolderPath: '/tv', seasonFolder: true
        }

        let options = this.options()
        options.path  = `/api/series?apiKey=${this.apiKey}`;
        options.method = 'POST';

        let req = https.request(options,res => {
            console.log(`statusCode while adding show: ${res.statusCode}`);
            let resp = '';
            res.on('data', d => {
                resp += d;
            });
            res.on('end', () => {
                if ( res.statusCode ) {
                    if ( res.statusCode >= 400 ) {
                        cb(Error(res.statusCode.toString()), undefined);
                    } else {
                        cb(undefined, JSON.parse(resp));
                    }
                } else {
                    cb(Error("Something went wrong with the request"), undefined);
                }
            });
        });

        req.on('error', (err) => {
            cb(err, undefined);
        })

        req.write(JSON.stringify(body));
        req.end();
    }

    async searchForEpisodes(seriesID: number) {
        let options = this.options();
        options.path = `/api/command?apiKey=${this.apiKey}`;
        options.method = 'POST';
        let body = {
            name: 'SeriesSearch',
            seriesId: seriesID
        }
        let req = https.request(options);
        req.write(JSON.stringify(body));
        req.end();

    }
}