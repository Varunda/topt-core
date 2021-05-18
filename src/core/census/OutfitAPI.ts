import { CensusAPI } from "./CensusAPI";
import { ApiResponse, ResponseContent } from "./ApiWrapper";
import { CharacterAPI, Character } from "./CharacterAPI";

import { Logger } from "../Loggers";
const log = Logger.getLogger("OutfitAPI");

export class Outfit {
    ID: string = "";
    name: string = "";
    tag: string = "";
    faction: string = "";
}

export class OutfitAPI {

    public static parse(elem: any): Outfit {
        return {
            ID: elem.outfit_id,
            name: elem.name,
            tag: elem.alias,
            faction: elem.leader?.faction_id ?? "-1"
        }
    }

    public static getByID(ID: string): Promise<Outfit | null> {
        const url: string = `/outfit/?outfit_id=${ID}&c:resolve=leader`;

        return new Promise<Outfit | null>(async (resolve, reject) => {
            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    if (request.data.returned != 1) {
                        return resolve(null);
                    }

                    const outfit: Outfit = OutfitAPI.parse(request.data.outfit_list[0]);
                    return resolve(outfit);
                } else {
                    return reject(`API call failed>\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

    public static getByIDs(IDs: string[]): Promise<Outfit[]> {
        return new Promise<Outfit[]>(async (resolve, reject) => {
            if (IDs.length == 0) {
                return resolve([]);
            }

            IDs = IDs.filter(i => i.length > 0 && i != "0");
            log.debug(`Loading outfits: [${IDs.join(", ")}]`);

            const outfits: Outfit[] = [];

            const sliceSize: number = 50;
            let slicesLeft: number = Math.ceil(IDs.length / sliceSize);
            log.debug(`Have ${slicesLeft} slices to do. size of ${sliceSize}, data of ${IDs.length}`);

            let errors: string[] = [];

            for (let i = 0; i < IDs.length; i += sliceSize) {
                const slice: string[] = IDs.slice(i, i + sliceSize);
                log.trace(`slice: [${slice.join(", ")}]`);

                const url: string = `/outfit/?outfit_id=${slice.join(",")}&c:resolve=leader`;

                try {
                    const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                    if (request.code == 200) {
                        if (request.data.returned == 0) {
                            log.warn(`Didn't get any outfits in slice [${slice.join(", ")}]`);
                        } else {
                            for (const datum of request.data.outfit_list) {
                                const outfit: Outfit = OutfitAPI.parse(datum);
                                outfits.push(outfit);
                            }
                        }
                    } else {
                        log.warn(`API error:\n\t${url}\n\t${request.code} ${request.data}`);
                    }
                } catch (err: any) {
                    errors.push(`Promise catch:\n\t${url}\n\t${err}`);
                }
            }

            if (errors.length > 0) {
                if (outfits.length == 0) {
                    return reject(errors);
                }
                log.warn(`${errors}`);
            }

            return resolve(outfits);
        });
    }

    public static getByTag(outfitTag: string): Promise<Outfit | null> {
        const url: string = `/outfit/?alias_lower=${outfitTag.toLowerCase()}&c:resolve=leader`;

        return new Promise<Outfit | null>(async (resolve, reject) => {
            if (outfitTag.trim().length == 0) {
                return resolve(null);
            }

            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    if (request.data.returned != 1) {
                        return resolve(null);
                    }

                    const outfit: Outfit = OutfitAPI.parse(request.data.outfit_list[0]);
                    return resolve(outfit);
                } else {
                    return reject(`API call failed>\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

    public static async getCharactersByID(outfitID: string): Promise<Character[]> {
        const url: string = `/outfit/?outfit_id=${outfitID}&c:resolve=member_character,member_online_status`;

        return new Promise<Character[]>(async (resolve, reject) => {
            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    if (request.data.returned != 1) {
                        return reject(`Got ${request.data.returned} results when getting outfit ID ${outfitID}`);
                    }

                    const chars: Character[] = request.data.outfit_list[0].members
                        .filter((elem: any) => elem.name != undefined)
                        .map((elem: any) => {
                            return CharacterAPI.parseCharacter({
                                outfit: {
                                    alias: request.data.outfit_list[0].alias
                                },
                                ...elem
                            });
                        });

                    return resolve(chars);
                } else {
                    return reject(`API call failed>\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

    public static async getCharactersByTag(outfitTag: string): Promise<Character[]> {
        const url: string = `/outfit/?alias_lower=${outfitTag.toLowerCase()}&c:resolve=member_character,member_online_status`;

        return new Promise<Character[]>(async (resolve, reject) => {
            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    if (request.data.returned != 1) {
                        return reject(`Got ${request.data.returned} results when getting ${outfitTag}`);
                    }

                    const chars: Character[] = request.data.outfit_list[0].members
                        .filter((elem: any) => elem.name != undefined)
                        .map((elem: any) => {
                            return CharacterAPI.parseCharacter({
                                outfit: {
                                    alias: request.data.outfit_list[0].alias
                                },
                                ...elem
                            });
                        });

                    return resolve(chars);
                } else {
                    return reject(`API call failed>\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

}