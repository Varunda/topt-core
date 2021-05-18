import { CensusAPI } from "./CensusAPI";
import { ApiResponse, ResponseContent } from "./ApiWrapper";

import { Logger } from "../Loggers";
const log = Logger.getLogger("AchievementAPI");

export class Achievement {
    public ID: string = "";
    public name: string = "";
    public imageUrl: string = "";
    public description: string = "";
}

export class AchievementAPI {

    private static _cache: Map<string, Achievement | null> = new Map(
        [["0", null]]
    );

    public static unknown: Achievement = {
        ID: "-1",
        name: "Unknown",
        imageUrl: "",
        description: "Unknown achievement"
    };

    public static parse(elem: any): Achievement {
        return {
            ID: elem.achievement_id,
            name: elem.name.en,
            description: elem.description?.en ?? "",
            imageUrl: elem.image_path
        };
    }

    public static getByID(achivID: string): Promise<Achievement | null> {
        const url: string = `achievement?item_id=${achivID}`;

        return new Promise<Achievement | null>(async (resolve, reject) => {
            if (AchievementAPI._cache.has(achivID)) {
                return resolve(AchievementAPI._cache.get(achivID)!);
            }

            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    if (request.data.returned != 1) {
                        return resolve(null);
                    }

                    const ach: Achievement = AchievementAPI.parse(request.data.achievement_list[0]);
                    AchievementAPI._cache.set(achivID, ach);

                    return resolve(ach);
                } else {
                    return reject(`API call failed:\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

    public static getByIDs(weaponIDs: string[]): Promise<Achievement[]> {
        return new Promise<Achievement[]>(async (resolve, reject) => {
            if (weaponIDs.length == 0) {
                return resolve([]);
            }

            const weapons: Achievement[] = [];
            const requestIDs: string[] = [];

            for (const weaponID of weaponIDs) {
                if (AchievementAPI._cache.has(weaponID)) {
                    const wep: Achievement = AchievementAPI._cache.get(weaponID)!;
                    weapons.push(wep);
                } else {
                    requestIDs.push(weaponID);
                }
            }

            if (requestIDs.length > 0) {
                const url: string = `achievement?achievement_id=${requestIDs.join(",")}`;
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    for (const datum of request.data.achievement_list) {
                        const ach: Achievement = AchievementAPI.parse(datum);
                        AchievementAPI._cache.set(ach.ID, ach);
                        weapons.push(ach);
                    }
                } else {
                    log.error(`API call failed:\n\t${url}\n\t${request.code} ${request.data}`);
                }
            }

            return resolve(weapons);
        });
    }

}