import { CharacterAPI, Character } from "./census/CharacterAPI";
import { Weapon, WeaponAPI } from "./census/WeaponAPI";
import { Achievement, AchievementAPI } from "./census/AchievementAPI";

import { PsLoadout, PsLoadouts, PsLoadoutType } from "./census/PsLoadout";
import { PsEventType, PsEvent, PsEvents } from "./PsEvent";
import StatMap from "./StatMap";
import EventReporter, { 
    statMapToBreakdown, BreakdownWeaponType,
    Breakdown, BreakdownArray, defaultCharacterMapper, defaultCharacterSortField,
    OutfitVersusBreakdown, ClassCollection, classCollectionNumber, BreakdownTimeslot, BreakdownTrend, BaseCapture
} from "./EventReporter";

import {
    TEvent, TEventType,
    TExpEvent, TKillEvent, TDeathEvent, TTeamkillEvent,
    TCaptureEvent, TDefendEvent,
    TVehicleKillEvent,
    TEventHandler
} from "./events/index";

import { TrackedPlayer, TrackedNpcType, TrackedNpc } from "./objects/index";

import { Logger } from "./Loggers";
const log = Logger.getLogger("IndividualGenerator");

export class ClassBreakdown {
    secondsAs: number = 0;
    score: number = 0;
    kills: number = 0;
    deaths: number = 0;
}

export class FacilityCapture {
    facilityID: string = "";
    name: string = "";
    type: string = "";
    typeID: string = "";
    zoneID: string = "";
    timestamp: Date = new Date();
    timeHeld: number = 0;
    factionID: string = "";
    outfitID: string = "";
    previousFaction: string = "";
}

export class ExpBreakdown {
    name: string = "";
    score: number = 0;
    amount: number = 0;
}

export class TimeTracking {
    public running: boolean = false;
    public startTime: number = 0;
    public endTime: number = 0;
}

export type ClassKdCollection = ClassCollection<ClassBreakdown>;

export function classKdCollection(): ClassKdCollection {
    return {
        infil: new ClassBreakdown(),
        lightAssault: new ClassBreakdown(),
        medic: new ClassBreakdown(),
        engineer: new ClassBreakdown(),
        heavy: new ClassBreakdown(),
        max: new ClassBreakdown(),
        total: new ClassBreakdown()
    };
};

export type ClassCollectionBreakdownTrend = ClassCollection<BreakdownTrend[]>;

export function classCollectionBreakdownTrend(): ClassCollectionBreakdownTrend {
    return {
        total: [],
        infil: [],
        lightAssault: [],
        medic: [],
        engineer: [],
        heavy: [],
        max: []
    }
}

export class Playtime {
    public characterID: string = "";
    public secondsOnline: number = 0;
    public infil: ClassBreakdown = new ClassBreakdown();
    public lightAssault: ClassBreakdown = new ClassBreakdown();
    public medic: ClassBreakdown = new ClassBreakdown();
    public engineer:  ClassBreakdown = new ClassBreakdown();
    public heavy:  ClassBreakdown = new ClassBreakdown();
    public max: ClassBreakdown = new ClassBreakdown();
    public mostPlayed = {
        name: "" as string,
        secondsAs: 0 as number,
    };
}

export class ClassUsage {
    public mostPlayed = {
        name: "" as string,
        secondsAs: 0 as number
    };

    public infil: ClassBreakdown = new ClassBreakdown();
    public lightAssault: ClassBreakdown = new ClassBreakdown();
    public medic: ClassBreakdown = new ClassBreakdown();
    public engineer: ClassBreakdown = new ClassBreakdown();
    public heavy: ClassBreakdown = new ClassBreakdown();
    public max: ClassBreakdown = new ClassBreakdown();
}

export class Report {
    opened: boolean = false;
    player: TrackedPlayer | null = null;

    stats: Map<string, string> = new Map();

    classBreakdown: ClassUsage = new ClassUsage();

    classKd: ClassKdCollection = classKdCollection();

    logistics = {
        show: false as boolean,
        routers: [] as TrackedNpc[],
        metas: [] as BreakdownMeta[]
    };

    overtime = {
        kpm: [] as BreakdownTimeslot[],
        kd: [] as BreakdownTimeslot[],
        rpm: [] as BreakdownTimeslot[]
    };

    perUpdate = {
        kpm: [] as BreakdownTimeslot[],
        kd: [] as BreakdownTimeslot[],
        rpm: [] as BreakdownTimeslot[]
    };

    collections: BreakdownSingleCollection[] = [];

    vehicleBreakdown: BreakdownArray = new BreakdownArray();
    scoreBreakdown: ExpBreakdown[] = [];
    ribbons: CountedRibbon[] = [];
    ribbonCount: number = 0;

    breakdowns: BreakdownCollection[] = [];

    weaponKillBreakdown: BreakdownArray = new BreakdownArray();
    weaponKillTypeBreakdown: BreakdownArray = new BreakdownArray();
    weaponHeadshotBreakdown: BreakdownArray = new BreakdownArray();

    weaponDeathBreakdown: BreakdownArray = new BreakdownArray();
    weaponDeathTypeBreakdown: BreakdownArray = new BreakdownArray();

    playerVersus: PlayerVersus[] = [];
}

export class PlayerVersusEntry {
    public timestamp: number = 0;
    public type: "kill" | "death" | "revived" | "unknown" = "unknown";
    public weaponName: string = "";
    public headshot: boolean = false;
}

export class PlayerVersus {
    public charID: string = "";
    public name: string = "";
    public kills: number = 0;
    public deaths: number = 0;
    public revives: number = 0;

    public weaponKills: BreakdownArray = new BreakdownArray();
    public weaponDeaths: BreakdownArray = new BreakdownArray();

    public encounters: PlayerVersusEntry[] = [];
}

export type BreakdownSingleCollection = {
    header: string;
    metas: BreakdownSingle[];
}

export type CountedRibbon = Achievement & { amount: number };

export class BreakdownSpawn {
    public npcID: string = "";
    public count: number = 0;
    public firstSeen: Date = new Date();
}

export class BreakdownCollection {
    public title: string = "";
    public sections: BreakdownSection[] = [];
}

export class BreakdownSection {
    public title: string = "";

    public left: BreakdownMeta | null = null;
    public right: BreakdownMeta | null = null;

    public showPercent: boolean = true;
    public showTotal: boolean = true;
}

export class BreakdownMeta {
    public title: string = "";
    public altTitle: string = "Count";
    public data: BreakdownArray = new BreakdownArray();
}

export class BreakdownSingle {
    public title: string = "";
    public altTitle: string = "";
    public data: BreakdownArray = new BreakdownArray();
    public showPercent: boolean = true;
    public showTotal: boolean = true;
}

export class ReportParameters {

    /**
     * Player the report is being generated for
     */
    public player: TrackedPlayer = new TrackedPlayer();

    /**
     * Contains all events collected during tracking. If you need just the player's events, use player
     */
    public events: TEvent[] = [];

    /**
     * Tracking information about the current state the tracker
     */
    public tracking: TimeTracking = { running: false, startTime: 0, endTime: 0 };

    /**
     * All routers tracked
     */
    public routers: TrackedNpc[] = [];

}

export class IndividualReporter {

    public static async generatePersonalReport(parameters: ReportParameters): Promise<Report> {
        if (parameters.player.events.length == 0) {
            return new Report();
        }

        const report: Report = new Report();

        const firstPlayerEvent: TEvent = parameters.player.events[0];
        const lastPlayerEvent: TEvent = parameters.player.events[parameters.player.events.length - 1];

        report.player = {...parameters.player};
        report.player.events = [];
        report.player.secondsOnline = (lastPlayerEvent.timestamp - firstPlayerEvent.timestamp) / 1000;

        report.classBreakdown = IndividualReporter.classUsage(parameters);
        report.classKd = IndividualReporter.classVersusKd(parameters.player.events);
        report.scoreBreakdown = IndividualReporter.scoreBreakdown(parameters);

        report.player.stats.getMap().forEach((value: number, eventID: string) => {
            const event: PsEvent | undefined = PsEvents.get(eventID);
            if (event == undefined) { return; }

            report.stats.set(event.name, `${value}`);
            report.player?.stats.set(event.name, value);
        });

        const calculatedStats: Map<string, string> = IndividualReporter.calculatedStats(parameters, report.classBreakdown);
        calculatedStats.forEach((value: string, key: string) => {
            report.stats.set(key, value);
        });

        report.logistics.routers = IndividualReporter.routerBreakdown(parameters);

        report.collections.push(await IndividualReporter.supportedBy(parameters));
        report.collections.push(await IndividualReporter.miscCollection(parameters));

        report.weaponHeadshotBreakdown = await EventReporter.weaponHeadshot(parameters.player.events);
        report.weaponKillBreakdown = await EventReporter.weaponKills(parameters.player.events);
        report.weaponKillTypeBreakdown = await EventReporter.weaponTypeKills(parameters.player.events);
        report.weaponDeathBreakdown = await EventReporter.weaponDeaths(parameters.player.events);
        report.weaponDeathTypeBreakdown = await EventReporter.weaponTypeDeaths(parameters.player.events, "unrevived");

        report.playerVersus = await IndividualReporter.playerVersus(parameters);

        report.overtime.kd = EventReporter.kdOverTime(parameters.player.events);
        report.perUpdate.kd = EventReporter.kdPerUpdate(parameters.player.events);
        report.overtime.kpm = EventReporter.kpmOverTime(parameters.player.events);

        if (parameters.player.events.find(iter => iter.type == "exp" && (iter.expID == PsEvent.revive || iter.expID == PsEvent.squadRevive)) != undefined) {
            report.overtime.rpm = EventReporter.revivesOverTime(parameters.player.events);
        }

        const ribbonIDs: string[] = Array.from(parameters.player.ribbons.getMap().keys());
        if (ribbonIDs.length > 0) {
            const data: Achievement[] = await AchievementAPI.getByIDs(ribbonIDs);
            report.player?.ribbons.getMap().forEach((amount: number, achivID: string) => {
                const achiv = data.find((iter: Achievement) => iter.ID == achivID) || AchievementAPI.unknown;
                const entry: CountedRibbon = {
                    ...achiv,
                    amount: amount
                };

                report.ribbonCount += amount;
                report.ribbons.push(entry);
            });

            report.ribbons.sort((a, b) => (b.amount - a.amount) || b.name.localeCompare(a.name))
        }

        if (report.classBreakdown.medic.secondsAs > 10) {
            report.breakdowns.push(await IndividualReporter.medicBreakdown(parameters));
        }

        if (report.classBreakdown.engineer.secondsAs > 10) {
            report.breakdowns.push(await IndividualReporter.engineerBreakdown(parameters));
        }

        return report;
    }

    public static async playerVersus(parameters: ReportParameters): Promise<PlayerVersus[]> {
        const versus: PlayerVersus[] = [];

        const charIDs: Set<string> = new Set();
        const wepIDs: Set<string> = new Set();

        for (const ev of parameters.player.events) {
            if (ev.sourceID != parameters.player.characterID) { continue; }
            if (ev.type != "kill" && ev.type != "death") { continue; }

            charIDs.add(ev.targetID);
            wepIDs.add(ev.weaponID);
        }

        const killsMap: Map<string, StatMap> = new Map();
        const deathsMap: Map<string, StatMap> = new Map();

        const characters: Character[] = await CharacterAPI.getByIDs(Array.from(charIDs.values()));
        const weapons: Weapon[] = await WeaponAPI.getByIDs(Array.from(wepIDs.values()));

        for (const ev of parameters.player.events) {
            if (ev.sourceID != parameters.player.characterID) { continue; }
            if (ev.type != "kill" && ev.type != "death") { continue; }

            let entry: PlayerVersus | undefined = versus.find(iter => iter.charID == ev.targetID);
            if (entry == undefined) {
                entry = new PlayerVersus();
                entry.charID = ev.targetID;
                entry.name = characters.find(iter => iter.ID == ev.targetID)?.name ?? `Unknown ${ev.targetID}`;

                killsMap.set(ev.targetID, new StatMap());
                deathsMap.set(ev.targetID, new StatMap());

                versus.push(entry);
            }

            const weaponName: string = weapons.find(iter => iter.ID == ev.weaponID)?.name ?? `Unknown ${ev.weaponID}`;

            let type: "kill" | "death" | "revived" | "unknown" = "unknown";
            if (ev.type == "kill") {
                ++entry.kills;
                type = "kill";
                killsMap.get(ev.targetID)!.increment(weaponName);
            } else if (ev.type == "death") {
                if (ev.revived == true) {
                    ++entry.revives;
                    type = "revived";
                } else {
                    ++entry.deaths;
                    type = "death";
                    deathsMap.get(ev.targetID)!.increment(weaponName);
                }
            } else {
                log.error(`Unchecked event type: '${ev}'`);
            }

            const encounter: PlayerVersusEntry = {
                timestamp: ev.timestamp,
                headshot: ev.isHeadshot,
                type: type,
                weaponName: weapons.find(iter => iter.ID == ev.weaponID)?.name ?? `Unknown ${ev.weaponID}`
            };

            entry.encounters.push(encounter);
        }

        for (const entry of versus) {
            if (killsMap.has(entry.charID) == false) {
                log.error(`Missing killsMap entry for ${entry.name}`);
                continue;
            }
            if (deathsMap.has(entry.charID) == false) {
                log.error(`Missing deathsMap entry for ${entry.name}`);
                continue;
            }

            const killMap: StatMap = killsMap.get(entry.charID)!;
            const deathMap: StatMap = deathsMap.get(entry.charID)!;

            const killBreakdown: BreakdownArray = new BreakdownArray();
            killMap.getMap().forEach((amount: number, weapon: string) => {
                killBreakdown.data.push({
                    display: weapon,
                    amount: amount,
                    sortField: weapon,
                    color: undefined
                });

                killBreakdown.total += amount;
            });
            entry.weaponKills = killBreakdown;

            const deathBreakdown: BreakdownArray = new BreakdownArray();
            deathMap.getMap().forEach((amount: number, weapon: string) => {
                deathBreakdown.data.push({
                    display: weapon,
                    amount: amount,
                    sortField: weapon,
                    color: undefined
                });

                deathBreakdown.total += amount;
            });
            entry.weaponDeaths = deathBreakdown;
        }

        return versus;
    }

    private static async medicBreakdown(parameters: ReportParameters): Promise<BreakdownCollection> {
        const coll: BreakdownCollection = new BreakdownCollection();
        coll.title = "Medic";

        coll.sections.push(await IndividualReporter.breakdownSection(parameters, "Heal ticks", PsEvent.heal, PsEvent.squadHeal));
        coll.sections.push(await IndividualReporter.breakdownSection(parameters, "Revives", PsEvent.revive, PsEvent.squadRevive));
        coll.sections.push(await IndividualReporter.breakdownSection(parameters, "Shield repair ticks", PsEvent.shieldRepair, PsEvent.squadShieldRepair));

        return coll;
    }

    private static async engineerBreakdown(parameters: ReportParameters): Promise<BreakdownCollection> {
        const coll: BreakdownCollection = new BreakdownCollection();

        coll.title = "Engineer";
        coll.sections.push(await IndividualReporter.breakdownSection(parameters, "Resupply ticks", PsEvent.resupply, PsEvent.squadResupply));
        coll.sections.push(await IndividualReporter.breakdownSection(parameters, "MAX repair ticks", PsEvent.maxRepair, PsEvent.squadMaxRepair));

        return coll;
    }

    private static async breakdownSection(parameters: ReportParameters, name: string, expID: string, squadExpID: string): Promise<BreakdownSection> {
        const ticks: TExpEvent[] = parameters.player.events.filter(iter => iter.type == "exp" && iter.expID == expID) as TExpEvent[];

        const section: BreakdownSection = new BreakdownSection();
        section.title = name;

        section.left = new BreakdownMeta();
        section.left.title = "All";
        section.left.data = await EventReporter.experience(expID, ticks);

        section.right = new BreakdownMeta();
        section.right.title = "Squad only";
        section.right.data = await EventReporter.experience(squadExpID, ticks);

        return section;
    }

    private static miscCollection(parameters: ReportParameters): BreakdownSingleCollection {
        const coll: BreakdownSingleCollection = {
            header: "Misc",
            metas: []
        }

        const dep = IndividualReporter.deployableDestroyedBreakdown(parameters);
        if (dep != null) {
            coll.metas.push(dep);
        }

        return coll;
    }

    private static async supportedBy(parameters: ReportParameters): Promise<BreakdownSingleCollection> {
        const coll: BreakdownSingleCollection = {
            header: "Supported by",
            metas: []
        };

        const metas: (BreakdownSingle | null)[] = [];
        metas.push(await IndividualReporter.singleSupportedBy(parameters, "Healed by", [PsEvent.heal, PsEvent.squadHeal]));
        metas.push(await IndividualReporter.singleSupportedBy(parameters, "Healed by", [PsEvent.heal, PsEvent.squadHeal]));
        metas.push(await IndividualReporter.singleSupportedBy(parameters, "Revived by", [PsEvent.revive, PsEvent.squadRevive]));
        metas.push(await IndividualReporter.singleSupportedBy(parameters, "Shield repaired by", [PsEvent.shieldRepair, PsEvent.squadShieldRepair]));
        metas.push(await IndividualReporter.singleSupportedBy(parameters, "Resupplied by", [PsEvent.resupply, PsEvent.squadResupply]));
        metas.push(await IndividualReporter.singleSupportedBy(parameters, "Repaired by", [PsEvent.maxRepair, PsEvent.squadMaxRepair]));

        for (const meta of metas) {
            if (meta != null) {
                coll.metas.push(meta);
            }
        }

        return coll;
    }

    private static async singleSupportedBy(parameters: ReportParameters, name: string, ids: string[]): Promise<BreakdownSingle | null> {
        let found: boolean = false;
        for (const ev of parameters.events) {
            if (ev.type == "exp" && ids.indexOf(ev.expID) > -1 && ev.targetID == parameters.player.characterID) {
                found = true;
                break;
            }
        }

        if (found == false) {
            return null;
        }

        const meta: BreakdownSingle = new BreakdownSingle();
        meta.title = name;
        meta.altTitle = "Player";
        meta.data = new BreakdownArray();
        meta.data = await EventReporter.experienceSource(ids, parameters.player.characterID, parameters.events);

        return meta;
    }

    private static deployableDestroyedBreakdown(parameters: ReportParameters): BreakdownSingle | null {
        const expIDs: string[] = [
            "57", // Eng turret
            "270", // Squad spawn beacon
            "327", // Tank mines
            "370", // Motion sensor kill
            "437", // Shield bubble
            "579", // Spitfire
            "1373", // Hardlight
            "1409", // Router
        ];

        const ticks: TExpEvent[] = parameters.player.events.filter((iter: TEvent) => {
            if (iter.type != "exp") {
                return false;
            }

            return expIDs.indexOf(iter.expID) > -1;
        }) as TExpEvent[];

        if (ticks.length > 0) {
            const meta: BreakdownSingle = new BreakdownSingle();
            meta.title = "Deployable kills";
            meta.altTitle = "Deployable";
            meta.data = new BreakdownArray();

            const map: StatMap = new StatMap();

            for (const tick of ticks) {
                let name = "unknown";
                if (tick.expID == "57") { name = "Engineer turret"; }
                else if (tick.expID == "270") { name = "Spawn beacon"; }
                else if (tick.expID == "327") { name = "Tank mine"; }
                else if (tick.expID == "370") { name = "Motion sensor"; }
                else if (tick.expID == "437") { name = "Shield bubble"; }
                else if (tick.expID == "579") { name = "Spitfire"; }
                else if (tick.expID == "1373") { name = "Hardlight"; }
                else if (tick.expID == "1409") { name = "Router"; }
                else { name = `Unknown ${tick.expID}`; }

                map.increment(name);
            }

            map.getMap().forEach((amount: number, expName: string) => {
                meta.data.total += amount;
                meta.data.data.push({
                    display: expName,
                    sortField: expName,
                    amount: amount,
                    color: undefined
                });
            });

            meta.data.data.sort((a, b) => {
                return b.amount - a.amount || a.sortField.localeCompare(b.sortField);
            });

            return meta;
        }

        return null;
    }

    private static routerBreakdown(parameters: ReportParameters): TrackedNpc[] {
        const rts: TrackedNpc[] = parameters.routers.filter(iter => iter.ownerID == parameters.player!.characterID);

        return rts;
    }

    private static calculatedStats(parameters: ReportParameters, classKd: ClassUsage): Map<string, string> {
        const map: Map<string, string> = new Map<string, string>();

        const stats: StatMap = parameters.player.stats;

        map.set("KPM",
            (stats.get("Kill") / (parameters.player.secondsOnline / 60)).toFixed(2)
        );

        // K/D = Kills / Deaths
        map.set("K/D",
            (stats.get("Kill") / stats.get("Death", 1)).toFixed(2)
        );

        // KA/D = Kills + Assits / Deaths
        map.set("KA/D",
            ((stats.get("Kill") + stats.get("Kill assist")) / stats.get("Death", 1)).toFixed(2)
        );

        // HSR = Headshots / Kills
        map.set("HSR",
            `${(stats.get("Headshot") / stats.get("Kill") * 100).toFixed(2)}%`
        );

        // KR/D  = Kills + Revives / Deaths
        map.set("KR/D",
            ((classKd.medic.kills + stats.get("Revive")) 
                / (classKd.medic.deaths || 1)).toFixed(2)
        );

        // R/D = Revives / Death
        map.set("R/D",
            (stats.get("Revive") / (classKd.medic.deaths || 1)).toFixed(2)
        );

        // RPM = Revives / minutes online
        map.set("RPM",
            (stats.get("Revive") / (classKd.medic.secondsAs / 60)).toFixed(2)
        );

        return map;
    }

    private static scoreBreakdown(parameters: ReportParameters): ExpBreakdown[] {
        const breakdown: Map<string, ExpBreakdown> = new Map<string, ExpBreakdown>();
        for (const event of parameters.player.events) {
            if (event.type == "exp") {
                const exp: PsEvent = PsEvents.get(event.expID) || PsEvent.other;
                if (!breakdown.has(exp.name)) {
                    breakdown.set(exp.name, new ExpBreakdown());
                }

                const score: ExpBreakdown = breakdown.get(exp.name)!;
                score.name = exp.name;
                score.score += event.amount;
                score.amount += 1;

                if (exp == PsEvent.other) {
                    log.log(`Other: ${JSON.stringify(event)}`);
                }
            }
        }

        // Sort all the entries by score, followed by amount, then lastly name
        return [...breakdown.entries()].sort((a, b) => {
            return b[1].score - a[1].score
                || b[1].amount - a[1].amount
                || a[0].localeCompare(b[0]);
        }).map((a) => a[1]); // Transform the tuple into the ExpBreakdown
    }

    public static classVersusKd(events: TEvent[], classLimit?: PsLoadoutType): ClassKdCollection {
        const kds: ClassKdCollection = classKdCollection();

        events.forEach((event: TEvent) => {
            if (event.type == "kill" || event.type == "death") {
                const sourceLoadoutID: string = event.loadoutID;
                const sourceLoadout = PsLoadouts.get(sourceLoadoutID);
                if (sourceLoadout == undefined) { return; }

                const targetLoadoutID: string = event.targetLoadoutID;
                const targetLoadout = PsLoadouts.get(targetLoadoutID);
                if (targetLoadout == undefined) { return; }

                if (classLimit != undefined) {
                    if (sourceLoadout.type != classLimit) {
                        return; // Continue to next iteration
                    }
                }

                if (event.type == "kill") {
                    switch (targetLoadout.type) {
                        case "infil": kds.infil.kills += 1; break;
                        case "lightAssault": kds.lightAssault.kills += 1; break;
                        case "medic": kds.medic.kills += 1; break;
                        case "engineer":  kds.engineer.kills += 1; break;
                        case "heavy":  kds.heavy.kills += 1; break;
                        case "max": kds.max.kills += 1; break;
                        default: log.warn(`Unknown type`);
                    }
                }
                if (event.type == "death" && event.revived == false) {
                    switch (targetLoadout.type) {
                        case "infil": kds.infil.deaths += 1; break;
                        case "lightAssault": kds.lightAssault.deaths += 1; break;
                        case "medic": kds.medic.deaths += 1; break;
                        case "engineer":  kds.engineer.deaths += 1; break;
                        case "heavy":  kds.heavy.deaths += 1; break;
                        case "max": kds.max.deaths += 1; break;
                        default: log.warn(`Unknown type`);
                    }
                }
                if (event.type == "death" && event.revived == true) {
                    switch (targetLoadout.type) {
                        case "infil": kds.infil.score += 1; break;
                        case "lightAssault": kds.lightAssault.score += 1; break;
                        case "medic": kds.medic.score += 1; break;
                        case "engineer":  kds.engineer.score += 1; break;
                        case "heavy":  kds.heavy.score += 1; break;
                        case "max": kds.max.score += 1; break;
                        default: log.warn(`Unknown type`);
                    }
                }
            }
        });

        return kds;
    }

    public static classUsage(parameters: ReportParameters): Playtime {
        const usage: Playtime = new Playtime();

        if (parameters.player.events.length == 0) {
            return usage;
        }

        let lastLoadout: PsLoadout | undefined = undefined;
        let lastTimestamp: number = parameters.player.events[0].timestamp;

        const finalTimestamp: number = parameters.player.events[parameters.player.events.length - 1].timestamp;

        usage.characterID = parameters.player.characterID;
        usage.secondsOnline = (finalTimestamp - lastTimestamp) / 1000;

        parameters.player.events.forEach((event: TEvent) => {
            if (event.type == "capture" || event.type == "defend" || event.type == "login" || event.type == "logout" || event.type == "marker" || event.type == "base") {
                return;
            }

            lastLoadout = PsLoadouts.get(event.loadoutID);
            if (lastLoadout == undefined) {
                return log.warn(`Unknown loadout ID: ${event.loadoutID}`);
            }

            if (event.type == "exp") {
                const diff: number = (event.timestamp - lastTimestamp) / 1000;
                lastTimestamp = event.timestamp;

                switch (lastLoadout.type) {
                    case "infil": usage.infil.secondsAs += diff; break;
                    case "lightAssault": usage.lightAssault.secondsAs += diff; break;
                    case "medic": usage.medic.secondsAs += diff; break;
                    case "engineer":  usage.engineer.secondsAs += diff; break;
                    case "heavy":  usage.heavy.secondsAs += diff; break;
                    case "max": usage.max.secondsAs += diff; break;
                    default: log.warn(`Unknown type`);
                }
            }

            if (event.type == "exp") {
                switch (lastLoadout.type) {
                    case "infil": usage.infil.score += event.amount; break;
                    case "lightAssault": usage.lightAssault.score += event.amount; break;
                    case "medic": usage.medic.score += event.amount; break;
                    case "engineer":  usage.engineer.score += event.amount; break;
                    case "heavy":  usage.heavy.score += event.amount; break;
                    case "max": usage.max.score += event.amount; break;
                    default: log.warn(`Unknown type`);
                }
            } else if (event.type == "kill") {
                switch (lastLoadout.type) {
                    case "infil": usage.infil.kills += 1; break;
                    case "lightAssault": usage.lightAssault.kills += 1; break;
                    case "medic": usage.medic.kills += 1; break;
                    case "engineer":  usage.engineer.kills += 1; break;
                    case "heavy":  usage.heavy.kills += 1; break;
                    case "max": usage.max.kills += 1; break;
                    default: log.warn(`Unknown type`);
                }
            } else if (event.type == "death" && event.revived == false) {
                switch (lastLoadout.type) {
                    case "infil": usage.infil.deaths += 1; break;
                    case "lightAssault": usage.lightAssault.deaths += 1; break;
                    case "medic": usage.medic.deaths += 1; break;
                    case "engineer":  usage.engineer.deaths += 1; break;
                    case "heavy":  usage.heavy.deaths += 1; break;
                    case "max": usage.max.deaths += 1; break;
                    default: log.warn(`Unknown type`);
                }
            }
        });

        let maxTime: number = 0;
        if (usage.infil.secondsAs > maxTime) {
            maxTime = usage.infil.secondsAs;
            usage.mostPlayed.name = "Infiltrator";
        }
        if (usage.lightAssault.secondsAs > maxTime) {
            maxTime = usage.lightAssault.secondsAs;
            usage.mostPlayed.name = "Light Assault";
        }
        if (usage.medic.secondsAs > maxTime) {
            maxTime = usage.medic.secondsAs;
            usage.mostPlayed.name = "Medic";
        } 
        if (usage.engineer.secondsAs > maxTime) {
            maxTime = usage.engineer.secondsAs;
            usage.mostPlayed.name = "Engineer";
        }
        if (usage.heavy.secondsAs > maxTime) {
            maxTime = usage.heavy.secondsAs;
            usage.mostPlayed.name = "Heavy";
        }
        if (usage.max.secondsAs > maxTime) {
            maxTime = usage.max.secondsAs;
            usage.mostPlayed.name = "MAX";
        }
        usage.mostPlayed.secondsAs = maxTime;

        return usage;
    }

    public static unrevivedTime(events: TEvent[]): number[] {
        const array: number[] = [];

        for (const ev of events) {
            if (ev.type != "death") {
                continue;
            }

            if (ev.revivedEvent != null) {
                const diff: number = (ev.revivedEvent.timestamp - ev.timestamp) / 1000;
                if (diff > 40) {
                    continue; // Somehow death events are missed and a revive event is linked to the wrong death
                }
                array.push(diff);
            }
        }

        return array.sort((a, b) => b - a);
    }

    public static reviveLifeExpectance(events: TEvent[]): number[] {
        const array: number[] = [];

        for (const ev of events) {
            if (ev.type != "death" || ev.revivedEvent == null) {
                continue;
            }

            const charEvents: TEvent[] = events.filter(iter => iter.sourceID == ev.sourceID);

            const index: number = charEvents.findIndex(iter => {
                return iter.type == "death" && iter.timestamp == ev.timestamp && iter.targetID == ev.targetID;
            });

            if (index == -1) {
                log.error(`Failed to find a death for ${ev.sourceID} at ${ev.timestamp} but wasn't found in charEvents`);
                continue;
            }

            let nextDeath: TDeathEvent | null = null;
            for (let i = index + 1; i < charEvents.length; ++i) {
                if (charEvents[i].type == "death") {
                    nextDeath = charEvents[i] as TDeathEvent;
                    break;
                }
            }

            if (nextDeath == null) {
                log.error(`Failed to find the next death for ${ev.sourceID} at ${ev.timestamp}`);
                continue;
            }

            const diff: number = (nextDeath.timestamp - ev.revivedEvent.timestamp) / 1000;
            if (diff <= 20) {
                array.push(diff);
            }
        }

        return array.sort((a, b) => b - a);
    }

    public static lifeExpectanceRate(events: TEvent[]): number[] {
        const array: number[] = [];

        for (const ev of events) {
            if (ev.type != "death" || ev.revivedEvent == null) {
                continue;
            }

            const charEvents: TEvent[] = events.filter(iter => iter.sourceID == ev.sourceID);

            const index: number = charEvents.findIndex(iter => {
                return iter.type == "death" && iter.timestamp == ev.timestamp && iter.targetID == ev.targetID;
            });

            if (index == -1) {
                log.error(`Failed to find a death for ${ev.sourceID} at ${ev.timestamp} but wasn't found in charEvents`);
                continue;
            }

            let nextDeath: TDeathEvent | null = null;
            for (let i = index + 1; i < charEvents.length; ++i) {
                if (charEvents[i].type == "death") {
                    nextDeath = charEvents[i] as TDeathEvent;
                    break;
                }
            }

            if (nextDeath == null) {
                log.error(`Failed to find the next death for ${ev.sourceID} at ${ev.timestamp}`);
                continue;
            }

            const diff: number = (nextDeath.timestamp - ev.revivedEvent.timestamp) / 1000;
            array.push(diff);
        }

        const probs: number[] = this.kaplanMeier(array, 20);

        return probs;
    }

    public static timeUntilReviveRate(events: TEvent[]): number[] {
        const array: number[] = [];

        for (const ev of events) {
            if (ev.type != "death") {
                continue;
            }

            if (ev.revivedEvent != null) {
                const diff: number = (ev.revivedEvent.timestamp - ev.timestamp) / 1000;
                if (diff > 40) {
                    continue; // Somehow death events are missed and a revive event is linked to the wrong death
                }
                array.push(diff);
            }
        }

        const probs: number[] = this.kaplanMeier(array);

        return probs;
    }

    private static kaplanMeier(data: number[], max?: number): number[] {
        const ticks: number[] = [...Array(max ?? Math.max(...data)).keys()];
        const probs: number[] = [];

        let cur_pop: number[] = [...Array(data.length).keys()];
        for (const tick of ticks) {
            const survived = data.filter(iter => iter > tick).length;

            probs.push(survived / cur_pop.length);
            cur_pop = data.filter(iter => iter > tick);
        }

        let cumul: number = 1;
        for (let i = 0; i < probs.length; ++i) {
            probs[i] = cumul * probs[i];
            cumul = probs[i];
        }

        return probs;
    }

    public static generateContinentPlayedOn(events: TEvent[]): string {
        let indar: number = 0;
        let esamir: number = 0;
        let amerish: number = 0;
        let hossin: number = 0;

        for (const ev of events) {
            if (ev.type == "kill" || ev.type == "death") {
                switch (ev.zoneID) {
                    case "2": ++indar; break;
                    case "4": ++hossin; break;
                    case "6": ++amerish; break;
                    case "8": ++esamir; break;
                }
            }
        }

        let count: number = 0;
        let cont: string = "Default";
        if (indar > count) {
            cont = "Indar";
            count = indar;
        }
        if (esamir > count) {
            cont = "Esamir";
            count = esamir;
        }
        if (amerish > count) {
            cont = "Amerish";
            count = amerish;
        }
        if (hossin > count) {
            cont = "Hossin";
            count = hossin;
        }

        return cont;
    }

}