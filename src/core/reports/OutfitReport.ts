import { PsLoadout, PsLoadouts } from "../census/PsLoadout";
import { PsEventType, PsEvent, PsEvents } from "../PsEvent";

import {
    TEvent, TEventType,
    TExpEvent, TKillEvent, TDeathEvent, TTeamkillEvent,
    TCaptureEvent, TDefendEvent,
    TVehicleKillEvent,
    TEventHandler
} from "../events/index";

import EventReporter, { statMapToBreakdown,
    Breakdown, BreakdownArray,
    BaseCapture,
    OutfitVersusBreakdown, ClassCollection, classCollectionNumber,
    BreakdownTimeslot, BreakdownTrend, BreakdownWeaponType, BaseCaptureOutfit
} from "../EventReporter";
import {
    ExpBreakdown, FacilityCapture, IndividualReporter,
    TimeTracking, 
    ClassKdCollection, classKdCollection,
    Playtime, PlayerVersusEntry
} from "../InvididualGenerator";

import { SquadStat, TrackedPlayer }  from "../objects/index";
import { Squad } from "../squad/Squad";
import { BaseExchange } from "../objects/BaseExchange";
import { FacilityAPI, Facility } from "../census/FacilityAPI";
import { ProgressCallback, ProgressNotification } from "../PromiseProgress";

import { Logger } from "../Loggers";
const log = Logger.getLogger("OutfitReport");

export class OutfitReportSettings {

    /**
     * ID of the zone to limit events to. Leaven null for all zones
     */
    public zoneID: string | null = null;

    /**
     * If squad stats will be generated and displayed
     */
    public showSquadStats: boolean = false;

}

/**
 * Parameters used to generate an outfit report
 */
export class OutfitReportParameters {

    /**
     * Settings used to generate the report
     */
    public settings: OutfitReportSettings = new OutfitReportSettings();

    /**
     * Facility captures that will be included in the report
     */
    //public captures: FacilityCapture[] = [];
    public captures: BaseExchange[] = [];

    /**
     * List of all the capture events related to players that will be included in the report
     */
    public playerCaptures: (TCaptureEvent | TDefendEvent)[] = [];

    /**
     * List of events that will be included in the report
     */
    public events: TEvent[] = [];

    /**
     * Map of players that will be part of the report <Character ID, TrackedPlayer>
     */
    public players: Map<string, TrackedPlayer> = new Map();

    /**
     * Squad stats
     */
    public squads = {
        perm: [] as Squad[],
        guesses: [] as Squad[]
    };

    /**
     * List of outfit IDs that will be included in the report
     */
    public outfits: string[] = [];

    /**
     * The period of time that the report will be generated over
     */
    public tracking: TimeTracking = new TimeTracking();

}

/**
 * Outfit report
 */
export class OutfitReport {

    /**
     * The various stats and how many the outfit got, based on the exp events
     */
    stats: Map<string, number> = new Map();

    /**
     * Total score that was gained during the ops
     */
    score: number = 0;

    /**
     * The players that make the outfit report
     */
    players: ({ name: string } & Playtime)[] = [];
    
    /**
     * List of events that was generated during the outfit report
     */
    events: TEvent[] = [];
    
    /**
     * The start and stop times that tracking was done over
     */
    tracking: TimeTracking = new TimeTracking();

    /**
     * The facility captures that took place
     */
    facilityCaptures: FacilityCapture[] = [];

    /**
     * Breakdown of each class and how many of each exp event each class got
     */
    classStats: Map<string, ClassCollection<number>> = new Map();

    /**
     * Breakdown of the score, what how many of each event and how much score
     */
    scoreBreakdown: ExpBreakdown[] = [];

    /**
     * How many seconds each class is played over all members
     */
    classPlaytimes: BreakdownArray = new BreakdownArray();

    /**
     * Collection of stats per 5 minute blocks
     */
    overtimePer5 = {
        kpm: [] as BreakdownTimeslot[],
        kd: [] as BreakdownTimeslot[],
        rpm: [] as BreakdownTimeslot[],
    };

    /**
     * Collection of stats per 1 minute blocks
     */
    overtimePer1 = {
        kpm: [] as BreakdownTimeslot[],
        kd: [] as BreakdownTimeslot[],
        rpm: [] as BreakdownTimeslot[],
    };

    /**
     * Collection of stats updated everytime a relevant event is performed
     */
    perUpdate = {
        kpm: [] as BreakdownTimeslot[],
        kd: [] as BreakdownTimeslot[],
        rpm: [] as BreakdownTimeslot[]
    };

    /**
     * Numbers used to create the boxplot of KPMs
     */
    kpmBoxPlot = {
        total: [] as number[],
        infil: [] as number[],
        lightAssault: [] as number[],
        medic: [] as number[],
        engineer: [] as number[],
        heavy: [] as number[],
        max: [] as number[]
    };

    /**
     * Numbers used to create the boxplot of KDs
     */
    kdBoxPlot = {
        total: [] as number[],
        infil: [] as number[],
        lightAssault: [] as number[],
        medic: [] as number[],
        engineer: [] as number[],
        heavy: [] as number[],
        max: [] as number[]
    };

    public squadStats = {
        data: [] as SquadStat[],
        all: new SquadStat() as SquadStat
    };

    weaponKillBreakdown: BreakdownArray = new BreakdownArray();
    weaponTypeKillBreakdown: BreakdownArray = new BreakdownArray();

    teamkillBreakdown: BreakdownArray = new BreakdownArray();
    teamkillTypeBreakdown: BreakdownArray = new BreakdownArray();

    deathAllBreakdown: BreakdownArray = new BreakdownArray();
    deathAllTypeBreakdown: BreakdownArray = new BreakdownArray();
    deathRevivedBreakdown: BreakdownArray = new BreakdownArray();
    deathRevivedTypeBreakdown: BreakdownArray = new BreakdownArray();
    deathKilledBreakdown: BreakdownArray = new BreakdownArray();
    deathKilledTypeBreakdown: BreakdownArray = new BreakdownArray();

    outfitVersusBreakdown: OutfitVersusBreakdown[] = [];
    weaponTypeDeathBreakdown: BreakdownWeaponType[] = [];

    vehicleKillBreakdown: BreakdownArray = new BreakdownArray();
    vehicleKillWeaponBreakdown: BreakdownArray = new BreakdownArray();

    /**
     * Unused
     */
    timeUnrevived: number[] = [];
    revivedLifeExpectance: number[] = [];
    kmLifeExpectance: number[] = [];
    kmTimeDead: number[] = [];

    factionKillBreakdown: BreakdownArray = new BreakdownArray();
    factionDeathBreakdown: BreakdownArray = new BreakdownArray();

    continentKillBreakdown: BreakdownArray = new BreakdownArray();
    continentDeathBreakdown: BreakdownArray = new BreakdownArray();

    baseCaptures: BaseCapture[] = [];

    /**
     * The KD of class against all other classes, i.e. how many kills/deaths medics got against heavies
     */
    classKds = {
        infil: classKdCollection() as ClassKdCollection,
        lightAssault: classKdCollection() as ClassKdCollection,
        medic: classKdCollection() as ClassKdCollection,
        engineer: classKdCollection() as ClassKdCollection,
        heavy: classKdCollection() as ClassKdCollection,
        max: classKdCollection() as ClassKdCollection,
        total: classKdCollection() as ClassKdCollection
    };

    classTypeKills = {
        infil: new BreakdownArray() as BreakdownArray,
        lightAssault: new BreakdownArray() as BreakdownArray,
        medic: new BreakdownArray() as BreakdownArray,
        engineer: new BreakdownArray() as BreakdownArray,
        heavy: new BreakdownArray() as BreakdownArray,
        max: new BreakdownArray() as BreakdownArray,
    };

    classTypeDeaths = {
        infil: new BreakdownArray() as BreakdownArray,
        lightAssault: new BreakdownArray() as BreakdownArray,
        medic: new BreakdownArray() as BreakdownArray,
        engineer: new BreakdownArray() as BreakdownArray,
        heavy: new BreakdownArray() as BreakdownArray,
        max: new BreakdownArray() as BreakdownArray,
    };
}

export class OutfitReportGenerator {

    public static async generate(parameters: OutfitReportParameters, progress?: ProgressCallback): Promise<OutfitReport> {
        const report: OutfitReport = new OutfitReport();
        report.tracking = parameters.tracking;

        if (progress) {
            const steps: string[] = [
                "Facility captures",
                "Weapon kills",
                "Teamkills",
                "Weapon deaths",
                "Deaths",
                "Outfit KD",
                "Vehicle kills",
                "Class kill breakdown",
                "Class death breakdown"
            ];
            progress({
                type: "steps",
                steps: steps
            });
        }

        const startStep = (step: string): void => {
            if (progress) {
                progress({
                    type: "update",
                    step: step,
                    state: "started"
                });
            }
        }

        const endStep = (step: string): void => {
            if (progress) {
                progress({
                    type: "update",
                    step: step,
                    state: "done"
                });
            }
        }

        startStep("Facility control");
        const facilityIDs: string[] = parameters.captures.filter(iter => parameters.outfits.indexOf(iter.outfitID) > -1)
            .map(iter => iter.facilityID)
            .filter((value, index, arr) => arr.indexOf(value) == index);

        const facilities: Facility[] = await FacilityAPI.getByIDs(facilityIDs);
        log.debug(`Got these facilities when loaded: [${facilityIDs.join(", ")}]:\n${JSON.stringify(facilities)}`);

        let missing: string[] = [];

        for (const capture of parameters.captures) {
            if (parameters.outfits.indexOf(capture.outfitID) == -1) {
                continue;
            }

            const facility: Facility | undefined = facilities.find(iter => iter.ID == capture.facilityID);
            if (facility != undefined) {
                const cap: FacilityCapture = {
                    facilityID: facility.ID,
                    zoneID: capture.zoneID,
                    name: facility.name,
                    typeID: facility.typeID,
                    type: facility.type,
                    timestamp: capture.timestamp,
                    timeHeld: capture.timeHeld,
                    factionID: capture.factionID,
                    outfitID: capture.outfitID,
                    previousFaction: capture.previousFaction
                };

                report.facilityCaptures.push(cap);
            } else {
                if (missing.indexOf(capture.facilityID) == -1) {
                    log.warn(`Failed to find facility ID ${capture.facilityID}`);
                    missing.push(capture.facilityID);
                }
            }
        }

        report.facilityCaptures.sort((a, b) => {
            return a.timestamp.getTime() - b.timestamp.getTime();
        });

        report.baseCaptures = await EventReporter.facilityCaptures({
            captures: report.facilityCaptures,
            players: parameters.playerCaptures
        });

        endStep("Facility captures");

        const chars: TrackedPlayer[] = Array.from(parameters.players.values());

        report.kpmBoxPlot = {
            total: EventReporter.kpmBoxplot(chars, parameters.tracking),
            infil: EventReporter.kpmBoxplot(chars, parameters.tracking, "infil"),
            lightAssault: EventReporter.kpmBoxplot(chars, parameters.tracking, "lightAssault"),
            medic: EventReporter.kpmBoxplot(chars, parameters.tracking, "medic"),
            engineer: EventReporter.kpmBoxplot(chars, parameters.tracking, "engineer"),
            heavy: EventReporter.kpmBoxplot(chars, parameters.tracking, "heavy"),
            max: EventReporter.kpmBoxplot(chars, parameters.tracking, "max"),
        }

        report.kdBoxPlot = {
            total: EventReporter.kdBoxplot(chars, parameters.tracking),
            infil: EventReporter.kdBoxplot(chars, parameters.tracking, "infil"),
            lightAssault: EventReporter.kdBoxplot(chars, parameters.tracking, "lightAssault"),
            medic: EventReporter.kdBoxplot(chars, parameters.tracking, "medic"),
            engineer: EventReporter.kdBoxplot(chars, parameters.tracking, "engineer"),
            heavy: EventReporter.kdBoxplot(chars, parameters.tracking, "heavy"),
            max: EventReporter.kdBoxplot(chars, parameters.tracking, "max")
        }

        parameters.players.forEach((player: TrackedPlayer, charID: string) => {
            player.stats.getMap().forEach((amount: number, expID: string) => {
                const event: PsEvent | undefined = PsEvents.get(expID);
                if (event == undefined) { return; }

                const reportAmount: number = report.stats.get(event.name) ?? 0;
                report.stats.set(event.name, reportAmount + amount);
            });
        });

        const playtimes: Playtime[] = [];

        parameters.players.forEach((player: TrackedPlayer, charID: string) => {
            if (player.events.length == 0) { return; }

            report.score += player.score;
            report.events.push(...player.events);

            const playtime = IndividualReporter.classUsage({
                player: player,
                events: [],
                routers: [],
                tracking: parameters.tracking
            });

            playtimes.push(playtime);

            report.players.push({
                name: `${(player.outfitTag != '' ? `[${player.outfitTag}] ` : '')}${player.name}`,
                ...playtime 
            });
        });

        report.classPlaytimes = EventReporter.classPlaytimes(playtimes);

        report.events = report.events.sort((a, b) => a.timestamp - b.timestamp);

        // Track how many headshots each class got
        const headshots: ClassCollection<number> = classCollectionNumber();
        for (const ev of report.events) {
            if (ev.type != "kill" || ev.isHeadshot == false) {
                continue;
            }

            const loadout: PsLoadout | undefined = PsLoadouts.get(ev.loadoutID);
            if (loadout == undefined) { continue; }

            if (loadout.type == "infil") { ++headshots.infil; }
            else if (loadout.type == "lightAssault") { ++headshots.lightAssault; }
            else if (loadout.type == "medic") { ++headshots.medic; }
            else if (loadout.type == "engineer") { ++headshots.engineer; }
            else if (loadout.type == "heavy") { ++headshots.heavy; }
            else if (loadout.type == "max") { ++headshots.max; }

            ++headshots.total;
        }
        report.classStats.set("Headshot", headshots);

        for (const ev of report.events) {
            let statName: string = "Other";

            if (ev.type == "kill") {
                statName = "Kill";
            } else if (ev.type == "death") {
                statName = (ev.revived == true) ? "Revived" : "Death";
            } else if (ev.type == "exp") {
                const event: PsEvent | undefined = PsEvents.get(ev.expID);
                if (event != undefined) {
                    if (event.track == false) { continue; }
                    statName = event.name;
                }
            } else {
                continue;
            }

            if (!report.classStats.has(statName)) {
                //log.debug(`Added stats for '${statName}'`);
                report.classStats.set(statName, classCollectionNumber());
            }

            const classCollection: ClassCollection<number> = report.classStats.get(statName)!;
            ++classCollection.total;

            const loadout: PsLoadout | undefined = PsLoadouts.get(ev.loadoutID);
            if (loadout == undefined) { continue; }

            if (loadout.type == "infil") { ++classCollection.infil; }
            else if (loadout.type == "lightAssault") { ++classCollection.lightAssault; }
            else if (loadout.type == "medic") { ++classCollection.medic; }
            else if (loadout.type == "engineer") { ++classCollection.engineer; } 
            else if (loadout.type == "heavy") { ++classCollection.heavy; } 
            else if (loadout.type == "max") { ++classCollection.max; }
        }

        startStep("Weapon kills");
        report.weaponKillBreakdown = await EventReporter.weaponKills(report.events);
        report.weaponTypeKillBreakdown = await EventReporter.weaponTypeKills(report.events);
        endStep("Weapon kills");

        startStep("Teamkills");
        report.teamkillBreakdown = await EventReporter.weaponTeamkills(report.events);
        endStep("Teamkills");

        report.continentKillBreakdown = EventReporter.continentKills(report.events);
        report.continentDeathBreakdown = EventReporter.continentDeaths(report.events);

        report.factionKillBreakdown = EventReporter.factionKills(report.events);
        report.factionDeathBreakdown = EventReporter.factionDeaths(report.events);

        startStep("Weapon deaths")
        report.weaponTypeDeathBreakdown = await EventReporter.weaponDeathBreakdown(report.events);
        endStep("Weapon deaths");

        startStep("Deaths")
        report.deathAllBreakdown = await EventReporter.weaponDeaths(report.events);
        report.deathRevivedBreakdown = await EventReporter.weaponDeaths(report.events, true);
        report.deathKilledBreakdown = await EventReporter.weaponDeaths(report.events, false);
        report.deathAllTypeBreakdown = await EventReporter.weaponTypeDeaths(report.events, "all");
        report.deathRevivedTypeBreakdown = await EventReporter.weaponTypeDeaths(report.events, "revived");
        report.deathKilledTypeBreakdown = await EventReporter.weaponTypeDeaths(report.events, "unrevived");
        endStep("Deaths");

        /* Not super useful and take a long time to generate
        report.timeUnrevived = IndividualReporter.unrevivedTime(report.events);
        report.revivedLifeExpectance = IndividualReporter.reviveLifeExpectance(report.events);
        report.kmLifeExpectance = IndividualReporter.lifeExpectanceRate(report.events);
        report.kmTimeDead = IndividualReporter.timeUntilReviveRate(report.events);
        */

        startStep("Class kill breakdown")
        report.classTypeKills.infil = await EventReporter.weaponTypeKills(report.events, "infil");
        report.classTypeKills.lightAssault = await EventReporter.weaponTypeKills(report.events, "lightAssault");
        report.classTypeKills.medic = await EventReporter.weaponTypeKills(report.events, "medic");
        report.classTypeKills.engineer = await EventReporter.weaponTypeKills(report.events, "engineer");
        report.classTypeKills.heavy = await EventReporter.weaponTypeKills(report.events, "heavy");
        report.classTypeKills.max = await EventReporter.weaponTypeKills(report.events, "max");
        endStep("Class kill breakdown");

        startStep("Class death breakdown")
        report.classTypeDeaths.infil = await EventReporter.weaponTypeDeaths(report.events, "all", "infil");
        report.classTypeDeaths.lightAssault = await EventReporter.weaponTypeDeaths(report.events,"all",  "lightAssault");
        report.classTypeDeaths.medic = await EventReporter.weaponTypeDeaths(report.events,"all",  "medic");
        report.classTypeDeaths.engineer = await EventReporter.weaponTypeDeaths(report.events,"all",  "engineer");
        report.classTypeDeaths.heavy = await EventReporter.weaponTypeDeaths(report.events,"all",  "heavy");
        report.classTypeDeaths.max = await EventReporter.weaponTypeDeaths(report.events,"all",  "max");
        endStep("Class death breakdown");

        report.classKds.infil = IndividualReporter.classVersusKd(report.events, "infil");
        report.classKds.lightAssault = IndividualReporter.classVersusKd(report.events, "lightAssault");
        report.classKds.medic = IndividualReporter.classVersusKd(report.events, "medic");
        report.classKds.engineer = IndividualReporter.classVersusKd(report.events, "engineer");
        report.classKds.heavy = IndividualReporter.classVersusKd(report.events, "heavy");
        report.classKds.max = IndividualReporter.classVersusKd(report.events, "max");
        report.classKds.total = IndividualReporter.classVersusKd(report.events);

        startStep("Outfit KD")
        report.outfitVersusBreakdown = await EventReporter.outfitVersusBreakdown(report.events);
        endStep("Outfit KD")

        startStep("Vehicle kills")
        report.vehicleKillBreakdown = await EventReporter.vehicleKills(report.events);
        report.vehicleKillWeaponBreakdown = await EventReporter.vehicleWeaponKills(report.events);
        endStep("Vehicle kills");

        const getSquadStats: (squad: Squad, name: string) => SquadStat = (squad: Squad, name: string) => {
            const squadIDs: string[] = squad.members.map(iter => iter.charID);

            return {
                name: name,
                members: squad.members.map(iter => iter.name),

                kills: parameters.events.filter(iter => iter.type == "kill"
                    && squadIDs.indexOf(iter.sourceID) > -1).length,

                deaths: parameters.events.filter(iter => iter.type == "death" && iter.revived == false
                    && squadIDs.indexOf(iter.sourceID) > -1).length,

                revives: parameters.events.filter(iter => iter.type == "exp"
                    && (iter.expID == PsEvent.revive || iter.expID == PsEvent.squadRevive)
                    && squadIDs.indexOf(iter.sourceID) > -1).length,

                heals: parameters.events.filter(iter => iter.type == "exp"
                    && (iter.expID == PsEvent.heal || iter.expID == PsEvent.squadHeal)
                    && squadIDs.indexOf(iter.sourceID) > -1).length,

                resupplies: parameters.events.filter(iter => iter.type == "exp"
                    && (iter.expID == PsEvent.resupply || iter.expID == PsEvent.squadResupply)
                    && squadIDs.indexOf(iter.sourceID) > -1).length,

                repairs: parameters.events.filter(iter => iter.type == "exp"
                    && (iter.expID == PsEvent.maxRepair || iter.expID == PsEvent.squadMaxRepair)
                    && squadIDs.indexOf(iter.sourceID) > -1).length,

                vKills: parameters.events.filter(iter => iter.type == "vehicle"
                    && squadIDs.indexOf(iter.sourceID) > -1).length,
            }
        }

        for (const squad of parameters.squads.perm) {
            report.squadStats.data.push(getSquadStats(squad, squad.display || "Other"));
        }
        
        for (const squad of parameters.squads.guesses) {
            report.squadStats.data.push(getSquadStats(squad, squad.display || "Other"));
        }

        const allSquad: Squad = new Squad();
        for (const squad of [...parameters.squads.perm, ...parameters.squads.guesses]) {
            allSquad.members.push(...squad.members);
        }
        report.squadStats.all = getSquadStats(allSquad, "All");
        report.squadStats.data.push(report.squadStats.all);

        let otherIDs: string[] = [];
        const breakdown: Map<string, ExpBreakdown> = new Map<string, ExpBreakdown>();
        for (const event of report.events) {
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
                    otherIDs.push(event.expID);
                }
            }
        }
        log.debug(`Untracked experience IDs: ${otherIDs.filter((v, i, a) => a.indexOf(v) == i).join(", ")}`);

        // Sort all the entries by score, followed by amount, then lastly name
        report.scoreBreakdown = [...breakdown.entries()].sort((a, b) => {
            return (b[1].score - a[1].score)
                || (b[1].amount - a[1].amount)
                || (b[0].localeCompare(a[0]))
        }).map((a) => a[1]); // Transform the tuple into the ExpBreakdown

        report.overtimePer1.kpm = EventReporter.kpmOverTime(report.events, 60000);
        report.overtimePer1.kd = EventReporter.kdOverTime(report.events, 60000);
        report.overtimePer1.rpm = EventReporter.revivesOverTime(report.events, 60000);

        report.overtimePer5.kpm = EventReporter.kpmOverTime(report.events);
        report.overtimePer5.kd = EventReporter.kdOverTime(report.events);
        report.overtimePer5.rpm = EventReporter.revivesOverTime(report.events);

        report.perUpdate.kd = EventReporter.kdPerUpdate(report.events);

        return report;
    }

}
