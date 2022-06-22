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
    id?: number,
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

export interface SonarManagedShowListResult {
    title: string
    id: number
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

export interface SonarEpisode {
    seriesId: number,
    seasonNumber: number,
    size: number,
    id: number
}

interface Tag {
    label: string,
    id: number
}

export interface AddShowResult {
    id: number,
    monitored: boolean,
    seasons: SeriesSeason[]
}

interface MappedSeasons {
    [key: string]: SeriesSeason
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
        if (this.auth) {
            options.headers = {
                'Authorization': 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64')
            }
        }
        options.host = this.ip
        return options;
    }

    searchApi(term: string, cb: (data: any) => any) {
        let options = this.options();
        options.path = encodeURI(`/api/tag?term=${term}&apiKey=${this.apiKey}`);

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

    searchTags(cb: (data: any) => any) {
        let options = this.options();
        options.path = encodeURI(`/api/tag`);
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

    searchShows(cb: (data: any) => any) {
        let options = this.options();
        options.path = encodeURI(`/api/series?apiKey=${this.apiKey}`);
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

    seasonReducer(map: MappedSeasons, season: SeriesSeason) {
        map[season.seasonNumber.toString()] = season;
        return map;
    }

    cleanFiles(show: SonarSearchResult, cb: (deleted: number) => any) {
        let options = this.options();
        options.path = encodeURI(`/api/episodefile?seriesId=${show.id}&apiKey=${this.apiKey}`);
        let mappedSeasons = new Map();
        show.seasons.forEach((season) => {
            mappedSeasons.set(season.seasonNumber.toString(), season);
        });
        https.get(options, (resp) => {
            let data = '';
            resp.on('data', (chunk) => {
                data += chunk;
            });
            resp.on('end', () => {
                let episodes: SonarEpisode[] = JSON.parse(data);
                let totalDeleted = 0;
                episodes.forEach((episode) => {
                    if (!mappedSeasons.get(episode.seasonNumber.toString()).monitored) {
                        this.deleteFile(episode.id);
                        totalDeleted += episode.size;
                    }
                });
                cb(totalDeleted);
            });
        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
    }

    deleteFile(episodeId: number) {
        let options = this.options();
        options.path = encodeURI(`/api/episodefile/${episodeId}?apiKey=${this.apiKey}`);
        options.method = 'DELETE';

        let req = https.request(options, res => {
        });
        req.end();
    }

    cleanShow(show: SonarSearchResult, cb: (err: Error | undefined, data: any) => any) {
        show.seasons = show.seasons.sort((a, b) => {
            return (a.seasonNumber > b.seasonNumber ? 1 : -1)
        }).map((s, i) => {
            if (i !== show.seasons.length - 1) {
                s.monitored = false;
            }
            return s;
        });
        let options = this.options()
        options.path = `/api/series/${show.id}?apiKey=${this.apiKey}`;
        options.method = 'PUT';

        let req = https.request(options, res => {
            console.log(`statusCode while PUTTING show: ${res.statusCode}`);
            let resp = '';
            res.on('data', d => {
                resp += d;
            });
            res.on('end', () => {
                if (res.statusCode) {
                    if (res.statusCode >= 400) {
                        cb(Error(res.statusCode.toString()), undefined);
                    } else {
                        cb(undefined, show);
                    }
                } else {
                    cb(Error("Something went wrong with the request"), undefined);
                }
            });
        });

        req.on('error', (err) => {
            cb(err, undefined);
        });

        req.write(JSON.stringify(show));
        req.end();
    }

    addShow(show: SonarSearchResult, chatId: number, cb: (err: Error | undefined, data: any) => any) {
        let seasons = show.seasons.sort((a, b) => {
            return (a.seasonNumber > b.seasonNumber ? 1 : -1)
        }).map((s, i) => {
            if (i !== show.seasons.length - 1) {
                s.monitored = false;
            }
            return s;
        });
        console.log(show.seasons);

        let showTags: number[] = [];
        this.searchTags((tags => {
            tags.forEach((tag: Tag) => {
                if (tag.label === chatId.toString()) {
                    showTags.push(tag.id)
                }
            })
        }));

        let body: object = {
            tvDbId: show.tvdbId,
            title: show.title,
            profileId: 1,
            titleSlug: show.titleSlug,
            images: show.images,
            seasons: seasons,
            RootFolderPath: '/tv',
            seasonFolder: true,
            tags: showTags,
            addOptions: {ignoreEpisodesWithoutFiles: false, ignoreEpisodesWithFiles: false}
        };

        let options = this.options()
        options.path = `/api/series?apiKey=${this.apiKey}`;
        options.method = 'POST';

        let req = https.request(options, res => {
            console.log(`statusCode while adding show: ${res.statusCode}`);
            let resp = '';
            res.on('data', d => {
                resp += d;
            });
            res.on('end', () => {
                if (res.statusCode) {
                    if (res.statusCode >= 400) {
                        console.log(resp);
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