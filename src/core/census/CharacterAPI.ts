import { CensusAPI } from "./CensusAPI";
import { ApiResponse, ResponseContent } from "./ApiWrapper";

import { Logger } from "../Loggers";
const log = Logger.getLogger("CharacterAPI");

export class Character {
    public ID: string = "";
    public name: string = "";
    public faction: string = "";
    public outfitID: string = "";
    public outfitTag: string = "";
    public outfitName: string = "";
    public online: boolean = false;
    public joinTime: number = 0;
    public secondsPlayed: number = 0;
}

export class CharacterAPI {

    private static _cache: Map<string, Character | null> = new Map();

    private static _pending: Map<string, Promise<Character | null>> = new Map();

    public static parseCharacter(elem: any): Character {
        const char: Character = {
            ID: elem.character_id,
            name: elem.name.first,
            faction: elem.faction_id,
            outfitID: (elem.outfit != undefined) ? elem.outfit.outfit_id : "",
            outfitTag: (elem.outfit != undefined) ? elem.outfit.alias : "",
            outfitName: (elem.outfit != undefined) ? elem.outfit.name : "",
            online: elem.online_status != "0",
            joinTime: (new Date()).getTime(),
            secondsPlayed: 0
        };

        CharacterAPI._cache.set(char.ID, char);

        return char;
    }

    public static setCache(chars: Character[]): void {
        for (const char of chars) {
            CharacterAPI._cache.set(char.ID, char);
        }
    }

    public static getCache(): Character[] {
        return Array.from(CharacterAPI._cache.values())
            .filter(iter => iter != null)
            .map(iter => iter as Character);
    }

    public static getByID(charID: string): Promise<Character | null> {
        if (CharacterAPI._pending.has(charID)) {
            return CharacterAPI._pending.get(charID)!;
        }

        const url: string = `/character/?character_id=${charID}&c:resolve=outfit,online_status`;

        const prom: Promise<Character | null> = new Promise(async (resolve, reject) => {
            if (CharacterAPI._cache.has(charID)) {
                return resolve(CharacterAPI._cache.get(charID)!);
            }

            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    if (request.data.returned != 1) {
                        return resolve(null);
                    }

                    const char: Character = CharacterAPI.parseCharacter(request.data.character_list[0]);
                    return resolve(char);
                } else {
                    return reject(`API call failed:\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });

        CharacterAPI._pending.set(charID, prom);

        return prom;
    }

    private static _pendingIDs: string[] = [];
    private static _pendingResolveID: number = 0;

    public static cache(charID: string): void {
        if (CharacterAPI._cache.has(charID)) {
            return;
        }

        clearTimeout(CharacterAPI._pendingResolveID);
        CharacterAPI._pendingIDs.push(charID);

        if (CharacterAPI._pendingIDs.length > 9) {
            CharacterAPI.getByIDs(CharacterAPI._pendingIDs);

            CharacterAPI._pendingIDs = [];
        } else {
            CharacterAPI._pendingResolveID = setTimeout(() => {
                CharacterAPI.getByIDs(CharacterAPI._pendingIDs);
            }, 5000) as unknown as number;
        }
    }

    public static getByIDs(charIDs: string[]): Promise<Character[]> {
        return new Promise<Character[]>(async (resolve, reject) => {
            if (charIDs.length == 0) {
                return resolve([]);
            }

            const chars: Character[] = [];
            const requestIDs: string[] = [];

            for (const charID of charIDs) {
                if (CharacterAPI._cache.has(charID)) {
                    const char: Character = CharacterAPI._cache.get(charID)!;
                    chars.push(char);
                } else {
                    requestIDs.push(charID);
                }
            }

            if (requestIDs.length > 0) {
                const sliceSize: number = 50;
                let slicesLeft: number = Math.ceil(requestIDs.length / sliceSize);
                log.info(`Have ${slicesLeft} slices to do. size of ${sliceSize}, data of ${requestIDs.length}`);

                for (let i = 0; i < requestIDs.length; i += sliceSize) {
                    const slice: string[] = requestIDs.slice(i, i + sliceSize);
                    log.info(`Slice ${i}: ${i} - ${i + sliceSize - 1}: [${slice.join(",")}]`);

                    try {
                        const url: string = `/character/?character_id=${slice.join(",")}&c:resolve=outfit,online_status`;
                        const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                        if (request.code == 200) {
                            for (const datum of request.data.character_list) {
                                const char: Character = CharacterAPI.parseCharacter(datum);
                                chars.push(char);
                            }
                        } else {
                            log.warn(`API call failed:\n\t${url}\n\t${request.code} ${request.data}`);
                        }
                    } catch (err: any) {
                        log.error(err);
                    }
                }

                log.info(`Did all slices`);

                return resolve(chars);
            } else {
                return resolve(chars);
            }
        });
    }

    public static getByName(name: string): Promise<Character | null> {
        const url: string = `/character/?name.first_lower=${name.toLowerCase()}&c:resolve=outfit,online_status`;

        return new Promise<Character | null>(async (resolve, reject) => {
            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    if (request.data.returned != 1) {
                        return resolve(null);
                    }

                    const char: Character = CharacterAPI.parseCharacter(request.data.character_list[0]);
                    return resolve(char);
                } else {
                    return reject(`API call failed:\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

}