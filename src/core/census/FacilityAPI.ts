import CensusAPI from "./CensusAPI";
import { ApiResponse, ResponseContent } from "./ApiWrapper";

import { Logger } from "../Loggers";
import { request } from "websocket";
const log = Logger.getLogger("FacilityAPI");

export class Facility {
    public ID: string = "";
    public zoneID: string = "";
    public name: string = "";
    public typeID: string = "";
    public type: string = "";
}

export class FacilityAPI {

    private static _cache: Map<string, Facility | null> = new Map();

    private static _pending: Map<string, Promise<Facility | null>> = new Map();

    public static parse(elem: any): Facility {
        return {
            ID: elem.facility_id,
            zoneID: elem.zone_id,
            name: elem.facility_name,
            typeID: elem.facility_type_id,
            type: elem.facility_type
        };
    }

    private static _idList: string[] = [];

    private static _timeoutID: number = -1;

    public static setCache(data: Facility[]): void {
        for (const fac of data) {
            FacilityAPI._cache.set(fac.ID, fac);
        }
    }

    public static precache(facilityID: string): void {
        clearTimeout(this._timeoutID);

        this._idList.push(facilityID);

        if (this._idList.length > 49) {
            if (this._idList.length > 0) {
                this.getByIDs(this._idList);
                this._idList = [];
            }
        }

        this._timeoutID = setTimeout(() => {
            if (this._idList.length > 0) {
                this.getByIDs(this._idList);
                this._idList = [];
            }
        });
    }

    public static getByID(facilityID: string): Promise<Facility | null> {
        if (FacilityAPI._pending.has(facilityID)) {
            log.trace(`${facilityID} already has a pending request, using that one instead`);
            return FacilityAPI._pending.get(facilityID)!;
        }

        const prom = new Promise<Facility | null>(async (resolve, reject) => {
            const url: string = `/map_region?facility_id=${facilityID}`;

            if (FacilityAPI._cache.has(facilityID)) {
                return resolve(FacilityAPI._cache.get(facilityID)!);
            } else {
                try {
                    FacilityAPI._pending.set(facilityID, prom);
                    const request: ResponseContent<any> = await CensusAPI.get(url).promise();
                    FacilityAPI._pending.delete(facilityID);

                    if (request.code == 200) {
                        if (request.data.returned != 1) {
                            FacilityAPI._cache.set(facilityID, null);
                            return resolve(null);
                        }

                        const facility: Facility = FacilityAPI.parse(request.data.map_region_list[0]);
                        FacilityAPI._cache.set(facility.ID, facility);
                        return resolve(facility);
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

    public static getByIDs(IDs: string[]): Promise<Facility[]> {
        return new Promise<Facility[]>(async (resolve, reject) => {
            if (IDs.length == 0) {
                return resolve([]);
            }

            const facilities: Facility[] = [];
            const requestIDs: string[] = [];

            for (const facID of IDs) {
                if (FacilityAPI._cache.has(facID)) {
                    const fac = FacilityAPI._cache.get(facID)!;
                    facilities.push(fac);
                } else {
                    requestIDs.push(facID);
                }
            }

            log.debug(`Getting ${requestIDs.join(", ")} from census`);

            const url: string = `/map_region?facility_id=${requestIDs.join(",")}&c:limit=100`;

            if (requestIDs.length > 0) {
                try {
                    const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                    if (request.code == 200) {
                        if (request.data.returned == 0) {
                            log.warn(``);
                        } else {
                            const bases: Facility[] = [];
                            for (const datum of request.data.map_region_list) {
                                const fac: Facility = FacilityAPI.parse(datum);
                                facilities.push(fac);
                                bases.push(fac);
                                FacilityAPI._cache.set(fac.ID, fac);
                            }

                            for (const facID of requestIDs) {
                                const elem = bases.find(iter => iter.ID == facID);
                                if (elem == undefined) {
                                    log.debug(`Failed to find Facility ID ${facID}, settings cache to null`);
                                    FacilityAPI._cache.set(facID, null);
                                }
                            }
                        }
                    } else {
                        log.error(`API call failed:\n\t${url}`);
                    }
                } catch (err: any) {
                    return reject(err);
                }
            }

            return resolve(facilities);
        });
    }

    public static getAll(): Promise<Facility[]> {
        return new Promise<Facility[]>(async (resolve, reject) => {
            const facilities: Facility[] = [];

            try {
                const request: ResponseContent<any> = await CensusAPI.get(`/map_region?&c:limit=10000`).promise();

                if (request.code == 200) {
                    for (const datum of request.data.map_region_list) {
                        const fac: Facility = FacilityAPI.parse(datum);
                        facilities.push(fac);
                    }

                    return resolve(facilities);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

}