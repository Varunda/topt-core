import { CensusAPI } from "./CensusAPI";
import { ApiResponse, ResponseContent } from "./ApiWrapper";

import { Logger } from "../Loggers";
const log = Logger.getLogger("CharacterEventsAPI");

export class CharEventKill {
    public attackerID: string = "";
    public characterID: string = "";
    public zoneID: string = "";
    public worldID: string = "";
    public timestamp: number = 0;
}

export class CharacterEventAPI {
    public static parseKill(ev: any): CharEventKill {
        return {
            attackerID: ev.attacker_character_id,
            characterID: ev.character_id,
            zoneID: ev.zone_id,
            worldID: ev.world_id,
            timestamp: Number.parseInt(ev.timestamp) * 1000
        };
    }

    public static getKillsByCharacterID(charID: string): Promise<CharEventKill[]> {
        const url: string = `/characters_event/?character_id=${charID}&type=KILL&c:limit=1000`;

        return new Promise<CharEventKill[]>(async (resolve, reject) => {
            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    const ev: CharEventKill[] = [];

                    for (const datum of request.data.characters_event_list) {
                        ev.push(CharacterEventAPI.parseKill(datum));
                    }

                    return resolve(ev);
                } else {
                    return reject(`API call failed:\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

}