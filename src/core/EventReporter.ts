import { ApiResponse } from "./census/ApiWrapper";
import { Character, CharacterAPI } from "./census/CharacterAPI";
import { Weapon, WeaponAPI } from "./census/WeaponAPI";
import StatMap from "./StatMap";
import { PsLoadout, PsLoadouts, PsLoadoutType } from "./census/PsLoadout";
import { Vehicle, VehicleAPI, VehicleTypes } from "./census/VehicleAPI";

import { PsEvent } from "./PsEvent";

import {
    TEvent, TEventType,
    TExpEvent, TKillEvent, TDeathEvent, TTeamkillEvent,
    TCaptureEvent, TDefendEvent,
    TVehicleKillEvent,
    TEventHandler
} from "./events/index";

import { IndividualReporter, TimeTracking, Playtime, FacilityCapture } from "./InvididualGenerator";
import { TrackedPlayer } from "./objects/TrackedPlayer";
import { OutfitAPI, Outfit } from "./census/OutfitAPI";

import { Logger } from "./Loggers";
const log = Logger.getLogger("EventReporter");

export class BreakdownArray {
    data: Breakdown[] = [];
    total: number = 0;
    display: ((_: number) => string) | null = null;
}

export class Breakdown { 
    display: string = "";
    sortField: string = "";
    amount: number = 0;
    color: string | undefined = undefined;
}

export class BreakdownTimeslot {
    startTime: number = 0;
    endTime: number = 0;
    value: number = 0;
}

export class BreakdownTrend {
    timestamp: Date = new Date();
    values: number[] = [];
};

export class OutfitVersusBreakdown {
    tag: string = "";
    name: string = "";
    faction: string = "";
    kills: number = 0;
    deaths: number = 0;
    revived: number = 0;
    players: number = 0;

    classKills: ClassCollection<number> = classCollectionNumber();
    classDeaths: ClassCollection<number> = classCollectionNumber();
    classRevived: ClassCollection<number> = classCollectionNumber();
}

export class BreakdownWeaponType {
    type: string = "";
    deaths: number = 0;
    revived: number = 0;
    unrevived: number = 0;
    headshots: number = 0;
    mostUsed: string = "";
    mostUsedDeaths: number = 0;
}

export function classCollectionNumber() {
    return {
        total: 0,
        infil: 0,
        lightAssault: 0,
        medic: 0,
        engineer: 0,
        heavy: 0,
        max: 0
    }
}

export interface ClassCollection<T> {
    total: T;
    infil: T;
    lightAssault: T;
    medic: T;
    engineer: T;
    heavy: T;
    max: T;
}

export class BaseCaptureOutfit {
    public ID: string = "";
    public name: string = "";
    public tag: string = "";
    public amount: number = 0
}

export class BaseCapture {
    public name: string = "";
    public faction: string = "";
    public timestamp: number = 0;
    public outfits: BreakdownArray = new BreakdownArray();
}

export class Streak {

    /**
     * How many instances of the event were in a streak
     */
    public amount: number = 0;

    /**
     * When the streak started in ms
     */
    public start: number = 0;

}

export async function statMapToBreakdown<T>(map: StatMap,
        source: (IDs: string[]) => Promise<T[]>,
        matcher: (elem: T, ID: string) => boolean,
        mapper: (elem: T | undefined, ID: string) => string,
        sortField: ((elem: T | undefined, ID: string) => string) | undefined = undefined
    ): Promise<BreakdownArray> {

    const breakdown: ApiResponse<BreakdownArray> = new ApiResponse();
    const arr: BreakdownArray = new BreakdownArray();

    if (map.size() > 0) {
        const IDs: string[] = Array.from(map.getMap().keys());
        const data: T[] = await source(IDs);
        map.getMap().forEach((amount: number, ID: string) => {
            const datum: T | undefined = data.find(elem => matcher(elem, ID));
            const breakdown: Breakdown = {
                display: mapper(datum, ID),
                sortField: (sortField != undefined) ? sortField(datum, ID) : mapper(datum, ID),
                amount: amount,
                color: undefined
            }
            arr.total += amount;
            arr.data.push(breakdown);
        });

        arr.data.sort((a, b) => {
            const diff: number = b.amount - a.amount;
            return diff || b.sortField.localeCompare(a.sortField);
        });

        return arr;
    }

    return arr;
}

export function defaultCharacterMapper(elem: Character | undefined, ID: string): string {
    return `${(elem?.outfitTag) ? `[${elem.outfitTag}] ` : ``}${(elem) ? elem.name : `Unknown ${ID}`}`;
}

export function defaultCharacterSortField(elem: Character | undefined, ID: string): string {
    return elem?.name ?? `Unknown ${ID}}`;
}

export function defaultWeaponMapper(elem: Weapon | undefined, ID: string): string {
    return elem?.name ?? `Unknown ${ID}`;
}

export function defaultVehicleMapper(elem: Vehicle | undefined, ID: string): string {
    return elem?.name ?? `Unknown ${ID}`;
}

export default class EventReporter {

    public static medicHealStreaks(events: TEvent[], charID: string): Streak[] {
        let current: Streak = new Streak();

        const streaks: Streak[] = [];

        // Have 2453 1/3 (rounded to 2500) units of juice, decays at 0.32 per ms (320/sec), revive gives 750
        const maxJuice: number = 2500;
        const decayRate: number = 0.32; // per ms
        const reviveJuice: number = 750;

        let juice: number = 2500;
        let prevRevive: number = 0;

        for (const ev of events) {
            if (ev.sourceID != charID) {
                continue;
            }

            if (ev.type == "exp" || ev.type == "kill") {
                if (ev.type == "exp" && (ev.expID == PsEvent.heal || ev.expID == PsEvent.squadHeal)) {
                    if (current.start == 0) {
                        current.start = ev.timestamp;
                        log.debug(`${charID} streak started at ${ev.timestamp}`);
                    }
                    if (prevRevive == 0) {
                        prevRevive = ev.timestamp;
                    }
                } else if (PsLoadout.getLoadoutType(ev.loadoutID) == "medic"
                    && (ev.type == "kill" || ev.expID == PsEvent.revive || ev.expID == PsEvent.squadRevive)) {

                    if (current.start == 0) {
                        current.start = ev.timestamp;
                        log.debug(`${charID} streak started at ${ev.timestamp}`);
                    }
                    if (prevRevive == 0) {
                        prevRevive = ev.timestamp;
                    }

                    juice += reviveJuice;
                    if (juice > maxJuice) {
                        juice = maxJuice;
                    }
                }

                if (current.start != 0) {
                    const diff: number = ev.timestamp - prevRevive;
                    const juiceLost: number = diff * decayRate;
                    prevRevive = ev.timestamp;

                    log.debug(`${charID} lost ${juiceLost} juice over ${diff}ms (${ev.timestamp} - ${prevRevive}). Had ${juice}, now have ${juice - juiceLost}`);

                    juice = juice - juiceLost;

                    if (juice <= 0) {
                        const overtime: number = (ev.timestamp - current.start) / 1000;
                        const otherJuice: number = juice / (decayRate * 1000);
                        current.amount = overtime + otherJuice;
                        streaks.push(current);

                        log.debug(`${charID} streak ended, overtime: ${overtime}, otherJuice: ${otherJuice} went from ${current.start} to ${ev.timestamp} and lasted ${current.amount}ms`);

                        prevRevive = 0;
                        current = new Streak();
                        current.start = 0; //ev.timestamp;
                        current.amount = 0;
                        juice = maxJuice;
                    }

                }

            }
        }

        return streaks;
    }

    public static async facilityCaptures(data: {captures: FacilityCapture[], players: (TCaptureEvent | TDefendEvent)[]}): Promise<BaseCapture[]> {
        const baseCaptures: BaseCapture[] = [];

        const captures: FacilityCapture[] = data.captures;
        const players: (TCaptureEvent | TDefendEvent)[] = data.players;

        log.debug(`Have ${data.captures.length} captures`);

        const outfitIDs: string[] = players.map(iter => iter.outfitID)
            .filter((value, index, arr) => arr.indexOf(value) == index);

        log.debug(`Getting these outfits: [${outfitIDs.join(", ")}]`);

        const outfits: Outfit[] = await OutfitAPI.getByIDs(outfitIDs);
        log.debug(`Loaded ${outfits.length}/${outfitIDs.length}. Processing ${captures.length} captures`);
        for (const capture of captures) {
            // Same faction caps are boring
            log.debug(`processing ${JSON.stringify(capture)}`);
            if (capture.factionID == capture.previousFaction) {
                log.debug(`Skipping capture: ${JSON.stringify(capture)}`);
                continue;
            }

            const entry: BaseCapture = new BaseCapture();
            entry.timestamp = capture.timestamp.getTime();
            entry.name = capture.name;
            entry.faction = capture.previousFaction;

            const outfitID: string = capture.outfitID;
            const outfit: Outfit | undefined = outfits.find(iter => iter.ID == outfitID);
            if (outfit == undefined) {
                log.warn(`Missing outfit ${outfitID}`);
                continue;
            }

            const helpers: (TDefendEvent | TCaptureEvent)[] = players.filter(iter => iter.timestamp == capture.timestamp.getTime());
            const outfitEntries: BaseCaptureOutfit[] = [{ name: "No outfit", ID: "-1", amount: 0, tag: "" }];
            for (const helper of helpers) {
                let outfitEntry: BaseCaptureOutfit | undefined = undefined;
                if (helper.outfitID == "0" || helper.outfitID.length == 0) {
                    outfitEntry = outfitEntries[0];
                } else {
                    outfitEntry = outfitEntries.find(iter => iter.ID == helper.outfitID);
                    if (outfitEntry == undefined) {
                        const outfitDatum: Outfit | undefined = outfits.find(iter => iter.ID == helper.outfitID);
                        outfitEntry = {
                            ID: helper.outfitID,
                            name: outfitDatum?.name ?? `Unknown ${helper.outfitID}`,
                            amount: 0,
                            tag: outfitDatum?.tag ?? ``,
                        }
                        outfitEntries.push(outfitEntry);
                    }
                }

                ++outfitEntry.amount;
            }

            const breakdown: BreakdownArray = {
                data: outfitEntries.sort((a, b) => b.amount - a.amount).map(iter => {
                    return {
                        display: iter.name,
                        amount: iter.amount,
                        color: undefined,
                        sortField: `${iter.amount}`
                    }
                }),
                total: outfitEntries.reduce(((acc, iter) => acc += iter.amount), 0),
                display: null
            };

            entry.outfits = breakdown;

            baseCaptures.push(entry);
        }

        return baseCaptures;
    }

    public static experience(expID: string, events: TEvent[]): Promise<BreakdownArray> {
        const exp: StatMap = new StatMap();

        for (const event of events) {
            if (event.type == "exp" && (event.expID == expID || event.trueExpID == expID)) {
                exp.increment(event.targetID);
            }
        }

        return statMapToBreakdown(exp,
            CharacterAPI.getByIDs,
            (elem: Character, charID: string) => elem.ID == charID,
            defaultCharacterMapper,
            defaultCharacterSortField
        );
    }

    public static async experienceSource(ids: string[], targetID: string, events: TEvent[]): Promise<BreakdownArray> {
        const exp: StatMap = new StatMap();

        for (const event of events) {
            if (event.type == "exp" && event.targetID == targetID && ids.indexOf(event.expID) > -1) {
                exp.increment(event.sourceID);
            }
        }

        if (exp.size() == 0) {
            return new BreakdownArray();
        }

        log.debug(`charIDs: [${Array.from(exp.getMap().keys()).join(", ")}]`);

        return statMapToBreakdown(exp,
            CharacterAPI.getByIDs,
            (elem: Character, charID: string) => elem.ID == charID,
            defaultCharacterMapper,
            defaultCharacterSortField
        );
    }

    public static async outfitVersusBreakdown(events: TEvent[]): Promise<OutfitVersusBreakdown[]> {
        const outfitBreakdowns: Map<string, OutfitVersusBreakdown> = new Map();
        const outfitPlayers: Map<string, string[]> = new Map();

        const killCount: number = events.filter(iter => iter.type == "kill").length;
        const deathCount: number = events.filter(iter => iter.type == "death" && iter.revived == false).length;

        const charIDs: string[] = events.filter((iter: TEvent) => iter.type == "kill" || (iter.type == "death" && iter.revived == false)) 
            .map((iter: TEvent) => {
                if (iter.type == "kill") {
                    return iter.targetID;
                } else if (iter.type == "death" && iter.revived == false) {
                    return iter.targetID;
                }
                throw `Invalid event type '${iter.type}'`;
            });

        const data: Character[] = await CharacterAPI.getByIDs(charIDs);
        for (const ev of events) {
            if (ev.type == "kill" || ev.type == "death") {
                const killedChar = data.find(iter => iter.ID == ev.targetID);
                if (killedChar == undefined) {
                    log.warn(`Missing ${ev.type} targetID ${ev.targetID}`);
                } else {
                    const outfitID: string = killedChar.outfitID;

                    if (outfitBreakdowns.has(outfitID) == false) {
                        const breakdown: OutfitVersusBreakdown = new OutfitVersusBreakdown();
                        breakdown.tag = killedChar.outfitTag;
                        breakdown.name = killedChar.outfitName || "<No outfit>";
                        breakdown.faction = killedChar.faction;
                        outfitBreakdowns.set(outfitID, breakdown);
                        outfitPlayers.set(outfitID, []);
                    }

                    const breakdown: OutfitVersusBreakdown = outfitBreakdowns.get(outfitID)!;
                    if (ev.type == "kill") {
                        ++breakdown.kills;
                    } else if (ev.type == "death") {
                        if (ev.revived == true) {
                            ++breakdown.revived;
                        } else {
                            ++breakdown.deaths;
                        }
                    }

                    const loadout: PsLoadout | undefined = PsLoadouts.get(ev.loadoutID);
                    const coll: ClassCollection<number> = ev.type == "kill" ? breakdown.classKills
                        : ev.type == "death" && ev.revived == false ? breakdown.classDeaths
                        : breakdown.classRevived;

                    if (loadout != undefined) {
                        if (loadout.type == "infil") {
                            ++coll.infil;
                        } else if (loadout.type == "lightAssault") {
                            ++coll.lightAssault;
                        } else if (loadout.type == "medic") {
                            ++coll.medic;
                        } else if (loadout.type == "engineer") {
                            ++coll.engineer;
                        } else if (loadout.type == "heavy") {
                            ++coll.heavy;
                        } else if (loadout.type == "max") {
                            ++coll.max;
                        }
                    }

                    const players: string[] = outfitPlayers.get(outfitID)!;
                    if (players.indexOf(ev.targetID) == -1) {
                        ++breakdown.players;
                        players.push(ev.targetID);
                    }
                }
            }
        }

        // Only include the outfit if they were > 1% of the kills or deaths
        const breakdowns: OutfitVersusBreakdown[] = Array.from(outfitBreakdowns.values())
            .filter(iter => iter.kills > (killCount / 100) || iter.deaths > (deathCount / 100));

        breakdowns.sort((a, b) => {
            return b.deaths - a.deaths
                || b.kills - a.kills
                || b.revived - a.revived
                || b.tag.localeCompare(a.tag);
        });

        return breakdowns;
    }

    public static kpmBoxplot(players: TrackedPlayer[], tracking: TimeTracking, loadout?: PsLoadoutType): number[] {
        let kpms: number[] = [];

        for (const player of players) {
            if (player.secondsOnline <= 0) { continue; }

            let secondsOnline: number = player.secondsOnline;

            if (loadout != undefined) {
                const playtime: Playtime = IndividualReporter.classUsage({player: player, tracking: tracking, routers: [], events: []});
                if (loadout == "infil") {
                    secondsOnline = playtime.infil.secondsAs;
                } else if (loadout == "lightAssault") {
                    secondsOnline = playtime.lightAssault.secondsAs;
                } else if (loadout == "medic") {
                    secondsOnline = playtime.medic.secondsAs;
                } else if (loadout == "engineer") {
                    secondsOnline = playtime.engineer.secondsAs;
                } else if (loadout == "heavy") {
                    secondsOnline = playtime.heavy.secondsAs;
                } else if (loadout == "max") {
                    secondsOnline = playtime.max.secondsAs;
                }

                if (secondsOnline == 0) {
                    continue;
                }
            }

            let count: number = 0;
            const kills: TKillEvent[] = player.events.filter(iter => iter.type == "kill") as TKillEvent[];

            for (const kill of kills) {
                const psloadout = PsLoadouts.get(kill.loadoutID)
                if (loadout == undefined || (psloadout != undefined && psloadout.type == loadout)) {
                    ++count;
                }
            }

            if (count == 0) {
                continue;
            }

            const minutesOnline: number = secondsOnline / 60;
            const kpm = Number.parseFloat((count / minutesOnline).toFixed(2));

            log.debug(`${player.name} got ${count} kills on ${loadout} in ${minutesOnline} minutes (${kpm})`);

            kpms.push(kpm);
        }

        kpms.sort((a, b) => b - a);

        return kpms;
    }

    public static kdBoxplot(players: TrackedPlayer[], tracking: TimeTracking, loadout?: PsLoadoutType): number[] {
        let kds: number[] = [];

        for (const player of players) {
            if (player.secondsOnline <= 0) { continue; }

            let killCount: number = 0;
            const kills: TKillEvent[] = player.events.filter(iter => iter.type == "kill") as TKillEvent[];

            for (const kill of kills) {
                const psloadout = PsLoadouts.get(kill.loadoutID)
                if (loadout == undefined || (psloadout != undefined && psloadout.type == loadout)) {
                    ++killCount;
                }
            }

            let deathCount: number = 0;
            const deaths: TDeathEvent[] = player.events.filter(iter => iter.type == "death" && iter.revived == false) as TDeathEvent[];

            for (const death of deaths) {
                const psloadout = PsLoadouts.get(death.loadoutID)
                if (loadout == undefined || (psloadout != undefined && psloadout.type == loadout)) {
                    ++deathCount;
                }
            }

            if (killCount == 0 || deathCount == 0) {
                continue;
            }

            const kd = Number.parseFloat((killCount / deathCount).toFixed(2));
            kds.push(kd);
        }

        kds.sort((a, b) => b - a);

        return kds;
    }

    public static async weaponDeathBreakdown(events: TEvent[]): Promise<BreakdownWeaponType[]> {
        const weapons: string[] = (events.filter((ev: TEvent) => ev.type == "death") as TDeathEvent[])
            .map((ev: TDeathEvent) => ev.weaponID)
            .filter((ID: string, index: number, arr: string[]) => arr.indexOf(ID) == index);

        let types: BreakdownWeaponType[] = [];

        // <weapon type, <weapon, count>>
        const used: Map<string, Map<string, number>> = new Map();

        const missingWeapons: Set<string> = new Set();

        const data: Weapon[] = await WeaponAPI.getByIDs(weapons);

        const deaths: TDeathEvent[] = events.filter(ev => ev.type == "death") as TDeathEvent[];

        for (const death of deaths) {
            const weapon = data.find(iter => iter.ID == death.weaponID);
            if (weapon == undefined && death.weaponID != "0") {
                missingWeapons.add(death.weaponID);
            }
            const typeName = weapon?.type ?? "Other";

            let type = types.find(iter => iter.type == typeName);
            if (type == undefined) {
                type = {
                    type: typeName,
                    deaths: 0,
                    headshots: 0,
                    revived: 0,
                    unrevived: 0,
                    mostUsed: "",
                    mostUsedDeaths: 0
                };
                types.push(type);
            }

            if (weapon != undefined) {
                if (!used.has(weapon.type)) {
                    used.set(weapon.type, new Map<string, number>());
                }

                const set: Map<string, number> = used.get(weapon.type)!;
                set.set(weapon.name, (set.get(weapon.name) ?? 0) + 1);

                used.set(weapon.type, set);
            }

            ++type.deaths;
            if (death.revived == false) {
                ++type.unrevived;
            } else {
                ++type.revived;
            }

            if (death.isHeadshot == true) {
                ++type.headshots;
            }
        }

        used.forEach((weapons: Map<string, number>, type: string) => {
            const breakdown: BreakdownWeaponType = types.find(iter => iter.type == type)!;

            weapons.forEach((deaths: number, weapon: string) => {
                if (deaths > breakdown.mostUsedDeaths) {
                    breakdown.mostUsedDeaths = deaths;
                    breakdown.mostUsed = weapon;
                }
            });
        });

        types = types.filter((iter: BreakdownWeaponType) => {
            return iter.deaths / deaths.length > 0.0025; // Only include outfits with at least 2.5% of deaths
        });

        types.sort((a, b) => {
            return b.deaths - a.deaths
                || b.headshots - a.headshots
                || b.type.localeCompare(a.type);
        });

        if (missingWeapons.size > 0) {
            log.info(`Missing weapons:`, missingWeapons);
        }

        return types;
    }

    public static vehicleKills(events: TEvent[]): Promise<BreakdownArray> {
        const vehKills: StatMap = new StatMap();

        for (const event of events) {
            if (event.type == "vehicle" && VehicleTypes.tracked.indexOf(event.vehicleID) > -1) {
                vehKills.increment(event.vehicleID);
            }
        }

        return statMapToBreakdown(vehKills,
            VehicleAPI.getAll,
            (elem: Vehicle, ID: string) => elem.ID == ID,
            defaultVehicleMapper
        );
    }

    public static vehicleWeaponKills(events: TEvent[]): Promise<BreakdownArray> {
        const vehKills: StatMap = new StatMap();

        for (const event of events) {
            if (event.type == "vehicle" && event.weaponID != "0") {
                vehKills.increment(event.weaponID);
            }
        }

        return statMapToBreakdown(vehKills,
            WeaponAPI.getByIDs,
            (elem: Weapon, ID: string) => elem.ID == ID,
            defaultWeaponMapper
        );
    }

    public static weaponKills(events: TEvent[]): Promise<BreakdownArray> {
        const wepKills: StatMap = new StatMap();

        for (const event of events) {
            if (event.type == "kill") {
                wepKills.increment(event.weaponID);
            }
        }

        return statMapToBreakdown(wepKills,
            WeaponAPI.getByIDs,
            (elem: Weapon, ID: string) => elem.ID == ID,
            defaultWeaponMapper
        );
    }

    public static async weaponHeadshot(events: TEvent[]): Promise<BreakdownArray> {
        const total: StatMap = new StatMap();
        const hs: StatMap = new StatMap();

        const weapons: Set<string> = new Set();

        for (const ev of events) {
            if (ev.type == "kill") {
                if (ev.isHeadshot == true) {
                    hs.increment(ev.weaponID);
                }
                total.increment(ev.weaponID);

                weapons.add(ev.weaponID);
            }
        }

        const arr: BreakdownArray = new BreakdownArray();

        const data: Weapon[] = await WeaponAPI.getByIDs(Array.from(weapons.values()));

        total.getMap().forEach((kills: number, weaponID: string) => {
            const hsKills: number = hs.get(weaponID, 0);
            const hsr: number = hsKills / kills;

            const weapon: Weapon | undefined = data.find(iter => iter.ID == weaponID);

            const entry: Breakdown = {
                amount: kills,
                display: `${weapon?.name ?? `Weapon ${weaponID}`} ${hsKills}/${kills} (${(hsr * 100).toFixed(2)}%)`,
                color: undefined,
                sortField: `${kills}`
            };

            arr.data.push(entry);
        });

        arr.total = 1;

        return arr;
    }

    public static weaponTeamkills(events: TEvent[]): Promise<BreakdownArray> {
        const wepKills: StatMap = new StatMap();

        for (const ev of events) {
            if (ev.type == "teamkill") {
                wepKills.increment(ev.weaponID);
            }
        }

        return statMapToBreakdown(wepKills,
            WeaponAPI.getByIDs,
            (elem: Weapon, ID: string) => elem.ID == ID,
            defaultWeaponMapper
        );
    }

    public static weaponDeaths(events: TEvent[], revived: boolean | undefined = undefined): Promise<BreakdownArray> {
        const amounts: StatMap = new StatMap();

        for (const event of events) {
            if (event.type == "death" && (revived == undefined || revived == event.revived)) {
                amounts.increment(event.weaponID);
            }
        }

        return statMapToBreakdown(amounts,
            WeaponAPI.getByIDs,
            (elem: Weapon, ID: string) => elem.ID == ID,
            defaultWeaponMapper
        );
    }

    public static async weaponTypeKills(events: TEvent[], loadout?: PsLoadoutType): Promise<BreakdownArray> {
        const amounts: StatMap = new StatMap();

        const weaponIDs: string[] = [];
        for (const event of events) {
            if (event.type == "kill") {
                weaponIDs.push(event.weaponID);
            }
        }

        const arr: BreakdownArray = new BreakdownArray();
        const data: Weapon[] = await WeaponAPI.getByIDs(weaponIDs);

        for (const event of events) {
            if (event.type == "kill") {
                if (loadout != undefined) {
                    if (loadout != PsLoadout.getLoadoutType(event.loadoutID)) {
                        continue;
                    }
                }
                const weapon = data.find(iter => iter.ID == event.weaponID);
                if (weapon == undefined) {
                    amounts.increment("Unknown");
                } else {
                    amounts.increment(weapon.type);
                }
                ++arr.total;
            }
        }

        amounts.getMap().forEach((count: number, wepType: string) => {
            arr.data.push({
                display: wepType,
                amount: count,
                sortField: wepType,
                color: undefined
            });
        });

        arr.data.sort((a, b) => {
            const diff: number = b.amount - a.amount;
            if (diff == 0) {
                return b.display.localeCompare(a.display);
            }
            return diff;
        });

        return arr;
    }

    public static async weaponTypeDeaths(events: TEvent[], revivedType: "all" | "unrevived" | "revived", loadout?: PsLoadoutType): Promise<BreakdownArray> {
        const amounts: StatMap = new StatMap();

        const revived: boolean | undefined = revivedType == "all" ? undefined
            : revivedType == "unrevived" ? false
            : true;

        const weaponIDs: string[] = [];
        for (const event of events) {
            if (event.type == "death" && (revived == undefined || event.revived == revived)) {
                weaponIDs.push(event.weaponID);
            }
        }

        const arr: BreakdownArray = new BreakdownArray();
        const data: Weapon[] = await WeaponAPI.getByIDs(weaponIDs);

        for (const event of events) {
            if (event.type == "death" && (revived == undefined || event.revived == revived)) {
                if (loadout != undefined) {
                    if (loadout != PsLoadout.getLoadoutType(event.loadoutID)) {
                        continue;
                    }
                }
                const weapon = data.find(iter => iter.ID == event.weaponID);
                if (weapon == undefined) {
                    amounts.increment("Unknown");
                } else {
                    amounts.increment(weapon.type);
                }
                ++arr.total;
            }
        }

        amounts.getMap().forEach((count: number, wepType: string) => {
            arr.data.push({
                display: wepType,
                amount: count,
                sortField: wepType,
                color: undefined
            });
        });

        arr.data.sort((a, b) => (b.amount - a.amount) || b.display.localeCompare(a.display));

        return arr;
    }

    public static classPlaytimes(times: Playtime[]): BreakdownArray {
        const arr: BreakdownArray = new BreakdownArray();

        const infil: Breakdown = {
            amount: 0,
            color: undefined,
            display: "Infiltrator",
            sortField: "infil"
        };

        const la: Breakdown = {
            amount: 0,
            color: undefined,
            display: "Light Assault",
            sortField: "LA"
        };

        const medic: Breakdown = {
            amount: 0,
            color: undefined,
            display: "Medic playtime",
            sortField: "medic"
        };

        const eng: Breakdown = {
            amount: 0,
            color: undefined,
            display: "Engineer",
            sortField: "engineer"
        };

        const heavy: Breakdown = {
            amount: 0,
            color: undefined,
            display: "Heavy Assault",
            sortField: "heavy"
        };

        const max: Breakdown = {
            amount: 0,
            color: undefined,
            display: "MAX",
            sortField: "max"
        };

        for (const time of times) {
            infil.amount += time.infil.secondsAs;
            la.amount += time.lightAssault.secondsAs;
            medic.amount += time.medic.secondsAs;
            eng.amount += time.engineer.secondsAs;
            heavy.amount += time.heavy.secondsAs;
            max.amount += time.max.secondsAs;
        }

        arr.data.push(infil, la, medic, eng, heavy, max);
        arr.total = infil.amount + la.amount + medic.amount + eng.amount + heavy.amount + max.amount;
        arr.display = (seconds: number) => {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds - (3600 * hours)) / 60);
            return `${hours.toFixed(0).padStart(2, "0")}:${mins.toFixed(0).padStart(2, "0")}:${(seconds % 60).toFixed(0).padStart(2, "0")}`;
        }

        return arr;
    }

    public static factionKills(events: TEvent[]): BreakdownArray {
        const arr: BreakdownArray = new BreakdownArray();

        const countKills = function(ev: TEvent, faction: string) {
            if (ev.type != "kill") {
                return false;
            }
            const loadout = PsLoadouts.get(ev.targetLoadoutID);
            return loadout != undefined && loadout.faction == faction;
        }

        arr.data.push({
            amount: events.filter(iter => countKills(iter, "VS")).length,
            color: "#AE06B3",
            display: "VS",
            sortField: "VS"
        });

        arr.data.push({
            amount: events.filter(iter => countKills(iter, "NC")).length,
            color: "#1A39F9",
            display: "NC",
            sortField: "NC"
        });

        arr.data.push({
            amount: events.filter(iter => countKills(iter, "TR")).length,
            color: "#CE2304",
            display: "TR",
            sortField: "TR"
        });

        arr.data.push({
            amount: events.filter(iter => countKills(iter, "NS")).length,
            color: "#6A6A6A",
            display: "NS",
            sortField: "NS"
        });

        arr.total = events.filter(iter => iter.type == "kill").length;

        return arr;
    }

    public static factionDeaths(events: TEvent[]): BreakdownArray {
        const countDeaths = function(ev: TEvent, faction: string) {
            if (ev.type != "death" || ev.revived == true) {
                return false;
            }
            const loadout = PsLoadouts.get(ev.targetLoadoutID);
            return loadout != undefined && loadout.faction == faction;
        }

        const arr: BreakdownArray = new BreakdownArray();
        arr.data.push({
            amount: events.filter(iter => countDeaths(iter, "VS")).length,
            color: "#AE06B3",
            display: "VS",
            sortField: "VS"
        });

        arr.data.push({
            amount: events.filter(iter => countDeaths(iter, "NC")).length,
            color: "#1A39F9",
            display: "NC",
            sortField: "NC"
        });

        arr.data.push({
            amount: events.filter(iter => countDeaths(iter, "TR")).length,
            color: "#CE2304",
            display: "TR",
            sortField: "TR"
        });

        arr.data.push({
            amount: events.filter(iter => countDeaths(iter, "NS")).length,
            color: "#6A6A6A",
            display: "NS",
            sortField: "NS"
        });

        arr.total = events.filter(iter => iter.type == "death" && iter.revived == false).length;

        return arr;
    }

    public static continentKills(events: TEvent[]): BreakdownArray {
        const countKills = function(ev: TEvent, zoneID: string) {
            return ev.type == "kill" && ev.zoneID == zoneID;
        }

        const arr: BreakdownArray = new BreakdownArray();
        arr.data.push({
            amount: events.filter(iter => countKills(iter, "2")).length,
            color: "#F4E11D",
            display: "Indar",
            sortField: "Indar"
        });

        arr.data.push({
            amount: events.filter(iter => countKills(iter, "4")).length,
            color: "#09B118",
            display: "Hossin",
            sortField: "Hossin"
        });

        arr.data.push({
            amount: events.filter(iter => countKills(iter, "6")).length,
            color: "#2DE53E",
            display: "Amerish",
            sortField: "Amerish"
        });

        arr.data.push({
            amount: events.filter(iter => countKills(iter, "8")).length,
            color: "#D8E9EC",
            display: "Esamir",
            sortField: "Esamir"
        });

        arr.total = events.filter(iter => iter.type == "kill").length;

        return arr;
    }

    public static continentDeaths(events: TEvent[]): BreakdownArray {
        const countDeaths = function(ev: TEvent, zoneID: string) {
            return ev.type == "death" && ev.revived == false && ev.zoneID == zoneID;
        }

        const arr: BreakdownArray = new BreakdownArray();
        arr.data.push({
            amount: events.filter(iter => countDeaths(iter, "2")).length,
            color: "#F4E11D",
            display: "Indar",
            sortField: "Indar"
        });

        arr.data.push({
            amount: events.filter(iter => countDeaths(iter, "4")).length,
            color: "#09B118",
            display: "Hossin",
            sortField: "Hossin"
        });

        arr.data.push({
            amount: events.filter(iter => countDeaths(iter, "6")).length,
            color: "#2DE53E",
            display: "Amerish",
            sortField: "Amerish"
        });

        arr.data.push({
            amount: events.filter(iter => countDeaths(iter, "8")).length,
            color: "#D8E9EC",
            display: "Esamir",
            sortField: "Esamir"
        });

        arr.total = events.filter(iter => iter.type == "death" && iter.revived == false).length;

        return arr;
    }

    public static characterKills(events: TEvent[]): Promise<BreakdownArray> {
        const amounts: StatMap = new StatMap();

        for (const event of events) {
            if (event.type == "kill") {
                amounts.increment(event.targetID);
            }
        }

        return statMapToBreakdown(amounts,
            CharacterAPI.getByIDs,
            (elem: Character, ID: string) => elem.ID == ID,
            defaultCharacterMapper
        );
    }

    public static characterDeaths(events: TEvent[]): Promise<BreakdownArray> {
        const amounts: StatMap = new StatMap();

        for (const event of events) {
            if (event.type == "death" && event.revived == false) {
                amounts.increment(event.targetID);
            }
        }

        return statMapToBreakdown(amounts,
            CharacterAPI.getByIDs,
            (elem: Character, ID: string) => elem.ID == ID,
            defaultCharacterMapper
        );
    }

    public static kpmOverTime(events: TEvent[], timeWidth: number = 300000): BreakdownTimeslot[] { 
        const kills: TKillEvent[] = events.filter(iter => iter.type == "kill")
            .sort((a, b) => a.timestamp - b.timestamp) as TKillEvent[];

        const players: Set<string> = new Set();

        if (kills.length == 0) {
            return [];
        }

        const slots: BreakdownTimeslot[] = [];

        const minutes: number = timeWidth / 60000;

        const stop = kills[kills.length - 1].timestamp;
        let start = events[0].timestamp;
        let count = 0;

        while (true) {
            const end = start + timeWidth;
            const section: TKillEvent[] = kills.filter(iter => iter.timestamp >= start && iter.timestamp < end);

            for (const ev of section) {
                players.add(ev.sourceID);
                ++count;
            }

            slots.push({
                startTime: start,
                endTime: end,
                value: Number.parseFloat((count / (players.size || 1) / minutes).toFixed(2))
            });

            count = 0;
            players.clear();
            start += timeWidth;

            if (start > stop) {
                break;
            }
        }

        return slots;
    }

    public static kdOverTime(events: TEvent[], timeWidth: number = 300000): BreakdownTimeslot[] {
        const evs: TEvent[] = events.filter(iter => iter.type == "kill" || (iter.type == "death" && iter.revived == false));

        if (evs.length == 0) {
            return [];
        }

        const slots: BreakdownTimeslot[] = [];

        const stop = evs[evs.length - 1].timestamp;
        let start = events[0].timestamp;

        while (true) {
            const end = start + timeWidth;
            const section: TEvent[] = evs.filter(iter => iter.timestamp >= start && iter.timestamp < end);

            const kills: TKillEvent[] = section.filter(iter => iter.type == "kill") as TKillEvent[];
            const deaths: TDeathEvent[] = section.filter(iter => iter.type == "death" && iter.revived == false) as TDeathEvent[];

            slots.push({
                startTime: start,
                endTime: end,
                value: Number.parseFloat((kills.length / (deaths.length || 1)).toFixed(2))
            });

            start += timeWidth;

            if (start > stop) {
                break;
            }
        }

        return slots;
    }

    public static kdPerUpdate(allEvents: TEvent[]): BreakdownTimeslot[] {
        const events: TEvent[] = allEvents.filter(iter => iter.type == "kill" || (iter.type == "death" && iter.revived == false));

        if (events.length == 0) {
            return [];
        }

        let kills: number = 0;
        let deaths: number = 0;

        const slots: BreakdownTimeslot[] = [];

        for (let i = events[0].timestamp; i < events[events.length - 1].timestamp; i += 1000) {
            const evs = events.filter(iter => iter.timestamp == i);
            if (evs.length == 0) {
                continue;
            }

            for (const ev of evs) {
                if (ev.type == "kill") {
                    ++kills;
                } else if (ev.type == "death") {
                    ++deaths;
                }
            }

            slots.push({
                value: Number.parseFloat((kills / (deaths || 1)).toFixed(2)),
                startTime: i,
                endTime: i
            });
        }

        return slots;
    }

    public static revivesOverTime(events: TEvent[], timeWidth: number = 300000): BreakdownTimeslot[] {
        const revives: TEvent[] = events.filter(iter => iter.type == "exp" && (iter.expID == PsEvent.revive || iter.expID == PsEvent.squadRevive));

        if (revives.length == 0) {
            return [];
        }

        const slots: BreakdownTimeslot[] = [];

        const stop = revives[revives.length - 1].timestamp;
        let start = events[0].timestamp;

        while (true) {
            const end = start + timeWidth;
            const section: TEvent[] = revives.filter(iter => iter.timestamp >= start && iter.timestamp < end);

            const players: number = section.map(iter => iter.sourceID)
                .filter((value: string, index: number, arr: string[]) => arr.indexOf(value) == index).length;

            slots.push({
                startTime: start,
                endTime: end,
                value: Number.parseFloat((section.length / (players || 1) / 5).toFixed(2))
            });

            start += timeWidth;

            if (start > stop) {
                break;
            }
        }

        return slots;
    }

}