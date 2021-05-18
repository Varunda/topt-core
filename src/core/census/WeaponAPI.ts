import { CensusAPI } from "./CensusAPI";
import { ApiResponse, ResponseContent } from "./ApiWrapper";

import { Logger } from "../Loggers";
const log = Logger.getLogger("WeaponAPI");

export class Weapon {
    public ID: string = "";
    public name: string = "";
    public type: string = "";
    public factionID: string = "";
    public imageSetID: string = "";
    public imageID: string = "";
}

export class WeaponAPI {

    public static _cache: Map<string, Weapon | null> = new Map(
        [["0", null]]
    );

    public static maxTypeFixer(name: string): string {
        if (name == "AI MAX (Left)" || name == "AI MAX (Right)") {
            return "AI MAX";
        }
        if (name == "AV MAX (Left)" || name == "AV MAX (Right)") {
            return "AV MAX";
        }
        if (name == "AA MAX (Left)" || name == "AA MAX (Right)") {
            return "AA MAX";
        }
        return name;
    }

    private static _pendingCaches: string[] = [];

    private static _pendingTimerID: number = -1;

    // <weapon ID, response>
    private static _pendingRequests: Map<string, Promise<Weapon | null>> = new Map();

    public static parse(elem: any): Weapon {
        return {
            ID: elem.item_id,
            name: elem.name?.en ?? `Unnamed ${elem.item_id}`,
            type: this.maxTypeFixer(elem.category?.name.en ?? "Unknown"),
            factionID: elem.faction_id,
            imageSetID: elem.image_set_id,
            imageID: elem.image_id
        };
    }

    public static setCache(weapons: Weapon[]): void {
        for (const weapon of weapons) {
            WeaponAPI._cache.set(weapon.ID, weapon);
        }
    }

    public static getEntires(): Weapon[] {
        // P sure this is safe
        return Array.from(WeaponAPI._cache.values())
            .filter(iter => iter != null) as Weapon[];
    }

    public static precache(weaponID: string): void {
        clearTimeout(this._pendingTimerID);

        if (this._pendingCaches.indexOf(weaponID) == -1) {
            this._pendingCaches.push(weaponID);
        }

        this._pendingTimerID = setTimeout(() => {
            this.getByIDs(this._pendingCaches);
        }, 100) as unknown as number;
    }

    public static getByID(weaponID: string): Promise<Weapon | null> {
        if (WeaponAPI._pendingRequests.has(weaponID)) {
            return WeaponAPI._pendingRequests.get(weaponID)!;
        }

        const prom: Promise<Weapon | null> = new Promise(async (resolve, reject) => {
            if (WeaponAPI._cache.has(weaponID)) {
                return resolve(WeaponAPI._cache.get(weaponID)!);
            } else {
                const url: string = `item?item_id=${weaponID}&c:hide=description,max_stack_size,image_path&c:lang=en&c:join=item_category^inject_at:category`;

                try {
                    WeaponAPI._pendingRequests.set(weaponID, prom);
                    const request: ResponseContent<any> = await CensusAPI.get(url).promise();
                    WeaponAPI._pendingRequests.delete(weaponID);

                    if (request.code == 200) {
                        if (request.data.returned != 1) {
                            return resolve(null);
                        }

                        const wep: Weapon = WeaponAPI.parse(request.data.item_list[0]);
                        WeaponAPI._cache.set(wep.ID, wep);
                        return resolve(wep);
                    } else {
                        return reject(`API call failed:\n\t${url}\n\t${request.code} ${request.data}`);
                    }
                } catch (err: any) {
                    return reject(err);
                }
            }
        });

        return prom;
    }

    public static getByIDs(weaponIDs: string[]): Promise<Weapon[]> {
        return new Promise<Weapon[]>(async (resolve, reject) => {
            // Remove duplicates
            weaponIDs = weaponIDs.filter((v, i, a) => a.indexOf(v) == i);

            if (weaponIDs.length == 0) {
                return resolve([]);
            }

            const weapons: Weapon[] = [];
            const requestIDs: string[] = [];

            for (const weaponID of weaponIDs) {
                if (WeaponAPI._cache.has(weaponID)) {
                    const wep: Weapon | null = WeaponAPI._cache.get(weaponID)!;
                    if (wep != null) {
                        weapons.push(wep);
                    }
                } else {
                    requestIDs.push(weaponID);
                }
            }

            if (requestIDs.length > 0) {
                const url: string = `item?item_id=${requestIDs.join(",")}&c:hide=description,max_stack_size,image_path&c:lang=en&c:join=item_category^inject_at:category`;

                try {
                    const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                    if (request.code == 200) {
                        for (const datum of request.data.item_list) {
                            const wep: Weapon = WeaponAPI.parse(datum);
                            WeaponAPI._cache.set(wep.ID, wep);
                            weapons.push(wep);
                        }
                    } else {
                        log.error(`API call failed:\n\t${url}\n\t${request.code} ${request.data}`);
                    }
                } catch (err: any) {
                    log.error(err);
                }
            }

            return resolve(weapons);
        });
    }

}