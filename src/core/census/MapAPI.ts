import { CensusAPI } from "./CensusAPI";
import { ApiResponse, ResponseContent } from "./ApiWrapper";

import { Logger } from "../Loggers";
const log = Logger.getLogger("MapAPI");

export class Region {
    regionID: string = "";
    factionID: string = "";
}

export class MapAPI {

    public static parse(elem: any): Region {
        return {
            regionID: elem.RowData.RegionId,
            factionID: elem.RowData.FactionId
        }
    }

    public static getMap(serverID: string, zoneID: string): Promise<Region[]> {
        const url: string = `/map/?world_id=${serverID}&zone_ids=${zoneID}`;

        return new Promise<Region[]>(async (resolve, reject) => {
            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    if (request.data.returned != 1) {
                        return resolve([]);
                    }

                    const maps: Region[] = [];

                    for (const datum of request.data.map_list[0].Regions.Row) {
                        const map: Region = MapAPI.parse(datum);
                        maps.push(map);
                    }

                    return resolve(maps);
                } else {
                    return reject(`API call failed>\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

}