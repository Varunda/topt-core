import { TEvent, TCaptureEvent, TDefendEvent } from "../events/index";
import { ApiResponse } from "../census/ApiWrapper";
import { TrackedPlayer } from "../objects/TrackedPlayer";
import { PsEvent } from "../PsEvent";
import { Breakdown, BreakdownArray, BreakdownTimeslot } from "../EventReporter";
import { IndividualReporter, Playtime } from "../InvididualGenerator";
import { Facility, FacilityAPI } from "../census/FacilityAPI";

import { Logger } from "../Loggers";
const log = Logger.getLogger("FightReport");
log.enableAll();

export class FightReportParameters {

    public events: TEvent[] = [];

    /**
     * Map of players that will be part of the report <Character ID, TrackedPlayer>
     */
    public players: Map<string, TrackedPlayer> = new Map();

}

export class FightReport {

    /**
     * When the first event was created
     */
    public startTime: Date = new Date();

    /**
     * When the last event was produced
     */
    public endTime: Date = new Date();

    /**
     * Each fight in the session
     */
    public entries: FightReportEntry[] = [];

}

export class FightReportEntry {

    /**
     * When the fight started
     */
    public startTime: Date = new Date();

    /**
     * When the fight ended
     */
    public endTime: Date = new Date();

    /**
     * How long the fight lasted in seconds
     */
    public duration: number = 0;

    /**
     * ID of the facility the fight might have taken place at
     */
    public facilityID: string | null = null;

    /**
     * Idk what I'll use this for yet
     */
    public name: string = "Unknown fight";

    /**
     * Players who were tracked for this fight
     */
    public participants: FightReportPlayer[] = [];

    /**
     * Breakdown of classes at the fight
     */
    public classBreakdown: BreakdownArray = new BreakdownArray();

    /**
     * Events that occured during the fight
     */
    public events: TEvent[] = [];

    public count = {
        score: 0 as number,
        kills: 0 as number,
        deaths: 0 as number,
        revives: 0 as number,
        heals: 0 as number,
        spawns: 0 as number
    };

    public perPlayer = {
        kpm: [] as number[],
        dpm: [] as number[],
        kd: [] as number[],
        hpm: [] as number[],
        rpm: [] as number[]
    };

    public charts = {
        kills: [] as BreakdownTimeslot[],
        deaths: [] as BreakdownTimeslot[],
        heals: [] as BreakdownTimeslot[],
        revives: [] as BreakdownTimeslot[],

        kpm: [] as BreakdownTimeslot[],

        uniqueEnemies: [] as BreakdownTimeslot[]
    };

}

/**
 * What a single player did during a single fight
 */
export class FightReportPlayer {

    /**
     * ID of the player
     */
    public ID: string = "";

    /**
     * Name of the player
     */
    public name: string = "";

    /**
     * Outfit tag of the player
     */
    public tag: string = "";

    /**
     * When the first event during a fight was
     */
    public startDate: Date = new Date();

    /**
     * When the last event during a fight was
     */
    public endDate: Date = new Date();

    /**
     * How long in seconds this player was part of the fight
     */
    public duration: number = 0;

    /**
     * How many kills this player got during the fight
     */
    public kills: number = 0;

    /**
     * How many times this player died during the fight
     */
    public deaths: number = 0;

    /**
     * How many heals they got during this fight
     */
    public heals: number = 0;

    /**
     * How many revives they got during the fight
     */
    public revives: number = 0;

    /**
     * How many spawns they got during the fight
     */
    public spawns: number = 0;
    
}

export class FightReportGenerator {

    public static generate(parameters: FightReportParameters): ApiResponse<FightReport> {
        const response: ApiResponse<FightReport> = new ApiResponse();

        const report: FightReport = new FightReport();

        if (parameters.events.length == 0 || parameters.players.size == 0) {
            response.resolveOk(report);
            return response;
        }

        report.startTime = new Date(parameters.events[0].timestamp);
        report.endTime = new Date(parameters.events[parameters.events.length - 1].timestamp);

        let inFight: boolean = false;
        let entry: FightReportEntry = new FightReportEntry();

        const playerIDs: string[] = [];
        parameters.players.forEach((player: TrackedPlayer, charID: string) => {
            playerIDs.push(charID);
        });
        log.debug(`Looking for these char IDs for capture/defend events: [${playerIDs.join(", ")}]`);

        const facilityIDs: string[] = parameters.events.filter(iter => iter.type == "capture" || iter.type == "defend")
            .map(iter => (iter as TCaptureEvent | TDefendEvent).facilityID)
            .filter((v, i, a) => a.indexOf(v) == i);

        FacilityAPI.getByIDs(facilityIDs).ok((facilities: Facility[]) => {
            log.debug(`Loaded ${facilities.length} from ${facilityIDs.length} IDs`);

            for (let i = 0; i < parameters.events.length; ++ i) {
                const event: TEvent = parameters.events[i];

                // Check if this is a fight start marker
                if (event.type == "marker") {
                    // Check if we're starting a fight or not
                    if (event.mark == "battle-start") {
                        if (inFight == false) {
                            log.debug(`New fight started at ${event.timestamp}`);

                            entry.startTime = new Date(event.timestamp);
                        }
                        inFight = true;
                    } else if (event.mark == "battle-end") {
                        if (inFight == true) {
                            log.debug(`Current fight ended, saving`);

                            entry.endTime = new Date(event.timestamp);
                            entry.duration = (event.timestamp - entry.startTime.getTime()) / 1000; // ms to seconds

                            report.entries.push(this.finalizeEntry(entry, parameters));

                            entry = new FightReportEntry();
                        }
                        inFight = false;
                    }
                }

                // Who cares if we're not in a fight
                if (inFight == false) {
                    continue;
                }

                entry.events.push(event);

                // Handle the event based on it's type
                if (event.type == "kill") {
                    ++entry.count.kills;
                } else if (event.type == "death" && event.revived == false) {
                    ++entry.count.deaths;
                } else if (event.type == "exp") {
                    if (event.expID == PsEvent.heal || event.expID == PsEvent.squadHeal) {
                        ++entry.count.heals;
                    } else if (event.expID == PsEvent.revive || event.expID == PsEvent.squadRevive) {
                        ++entry.count.revives;
                    } else if (event.expID == PsEvent.squadSpawn || ["201", "233", "355", "1410"].indexOf(event.expID) > -1) {
                        ++entry.count.spawns;
                    }
                } else if (event.type == "capture") {
                    if (playerIDs.indexOf(event.sourceID) > -1) {
                        if (entry.facilityID == null) {
                            const fac: Facility | undefined = facilities.find(iter => iter.ID == event.facilityID);
                            entry.name = `Capture of ${fac?.name ?? `bad ID ${event.facilityID}`}`;
                        } else if (entry.facilityID != event.facilityID) {
                            log.warn(`Fight already has a name: ${entry.name}`);
                        }
                    } else {
                        //log.debug(`${event.sourceID} is not tracked, skipping`);
                    }
                } else if (event.type == "defend" && playerIDs.indexOf(event.sourceID) > -1) {
                    if (entry.facilityID == null) {
                        const fac: Facility | undefined = facilities.find(iter => iter.ID == event.facilityID);
                        entry.name = `Defense of ${fac?.name ?? `bad ID ${event.facilityID}`}`;
                    } else if (entry.facilityID != event.facilityID) {
                        log.warn(`Fight already has a name: ${entry.name}`);
                    }
                }
            }

            response.resolveOk(report);
        });

        return response;
    }

    /**
     * Finalize the entry to be added to a report, such as getting the top contributers, kills over time, etc.
     * 
     * @param entry Entry to finalize before inserting
     * 
     * @returns |entry|
     */
    private static finalizeEntry(entry: FightReportEntry, parameters: FightReportParameters): FightReportEntry {

        // Get all the participants during a fight
        for (const event of entry.events) {
            const player: TrackedPlayer | undefined = parameters.players.get(event.sourceID);
            if (player == undefined) {
                continue;
            }

            let part: FightReportPlayer | undefined = entry.participants.find(iter => iter.ID == event.sourceID);

            if (part == undefined) {
                part = {
                    ID: player.characterID,
                    name: player.name,
                    tag: player.outfitTag,
                    startDate: entry.startTime,
                    endDate: new Date(),
                    duration: 0,
                    kills: 0,
                    deaths: 0,
                    heals: 0,
                    revives: 0,
                    spawns: 0
                };

                entry.participants.push(part);
            }

            if (event.type == "kill") {
                ++part.kills;
            } else if (event.type == "death" && event.revived == false) {
                ++part.deaths;
            } else if (event.type == "exp") {
                if (event.expID == PsEvent.heal || event.expID == PsEvent.squadHeal) {
                    ++part.heals;
                } else if (event.expID == PsEvent.revive || event.expID == PsEvent.squadRevive) {
                    ++part.revives;
                } else if (event.expID == PsEvent.squadSpawn || ["201", "233", "355", "1410"].indexOf(event.expID) > -1) {
                    ++part.spawns;
                }
            }
        }

        const classBreakdown: BreakdownArray = new BreakdownArray();
        const classArray: Breakdown[] = [
            { display: "Infiltrator", sortField: "", amount: 0, color: undefined },
            { display: "LA", sortField: "", amount: 0, color: undefined },
            { display: "Medic", sortField: "", amount: 0, color: undefined },
            { display: "Engineer", sortField: "", amount: 0, color: undefined },
            { display: "Heavy", sortField: "", amount: 0, color: undefined },
            { display: "MAX", sortField: "", amount: 0, color: undefined },
        ];

        const reversedEvents = [...entry.events].reverse();

        for (const part of entry.participants) {
            part.endDate = entry.endTime;
            //part.endDate = new Date(reversedEvents.find(iter => iter.sourceID == part.ID)!.timestamp);
            part.duration = (part.endDate.getTime() - part.startDate.getTime()) / 1000;

            let kpm: number = part.kills / (part.duration / 60);
            entry.perPlayer.kpm.push(Number.isFinite(kpm) == false ? 0 : kpm);

            let dpm: number = part.deaths / (part.duration / 60);
            entry.perPlayer.dpm.push(Number.isFinite(dpm) == false ? 0 : dpm);

            let hpm: number = part.heals / (part.duration / 60);
            entry.perPlayer.hpm.push(Number.isFinite(hpm) == false ? 0 : hpm);

            let rpm: number = part.revives / (part.duration / 60);
            entry.perPlayer.rpm.push(Number.isFinite(rpm) == false ? 0 : rpm);

            let kd: number = part.kills / (part.deaths || 1);
            entry.perPlayer.kd.push(Number.isFinite(kd) == false ? 0 : kd);

            const playtime: Playtime = IndividualReporter.classUsage({
                events: entry.events,
                player: parameters.players.get(part.ID)!,
                routers: [],
                tracking: { startTime: 0, endTime: 0, running: false }
            });

            const c: Breakdown | undefined = classArray.find(iter => iter.display == playtime.mostPlayed.name);
            if (c == undefined) {
                log.warn(`Failed to find Breakdown for class '${playtime.mostPlayed.name}'`);
            } else {
                c.amount += 1;
            }

            //log.info(`${part.name} playtime: ${JSON.stringify(playtime)}`);
        }

        classBreakdown.data = classArray;
        classBreakdown.total = classArray.length;
        entry.classBreakdown = classBreakdown;

        entry.perPlayer.kpm.sort((a, b) => a - b);
        entry.perPlayer.dpm.sort((a, b) => a - b);
        entry.perPlayer.hpm.sort((a, b) => a - b);
        entry.perPlayer.rpm.sort((a, b) => a - b);
        entry.perPlayer.kd.sort((a, b) => a - b);

        let killCount: number = 0;
        let deathCount: number = 0;
        let reviveCount: number = 0;
        let healCount: number = 0;

        let kpm: number = 0;
        let kpmTime: number = entry.events[0].timestamp;
        const kpmInterval: number = 10;

        const encountered: string[] = [];

        for (const event of entry.events) {
            if (event.type == "kill") {
                killCount += 1;

                entry.charts.kills.push({
                    startTime: event.timestamp,
                    endTime: event.timestamp,
                    value: killCount
                });

                if (event.timestamp > (kpmTime + (kpmInterval * 1000))) {
                    entry.charts.kpm.push({
                        startTime: event.timestamp,
                        endTime: event.timestamp,
                        value: (kpm * (60 / kpmInterval)) / entry.participants.length
                    });

                    kpm = 0;
                    kpmTime = event.timestamp;
                }

                kpm += 1;

                if (encountered.indexOf(event.targetID) == -1) {
                    encountered.push(event.targetID);

                    entry.charts.uniqueEnemies.push({
                        startTime: event.timestamp,
                        endTime: event.timestamp,
                        value: encountered.length
                    });
                }
            } else if (event.type == "death") {
                deathCount += 1;

                entry.charts.deaths.push({
                    startTime: event.timestamp,
                    endTime: event.timestamp,
                    value: deathCount
                });

                if (encountered.indexOf(event.targetID) == -1) {
                    encountered.push(event.targetID);

                    entry.charts.uniqueEnemies.push({
                        startTime: event.timestamp,
                        endTime: event.timestamp,
                        value: encountered.length
                    });
                }
            } else if (event.type == "exp") {
                if (event.expID == PsEvent.heal || event.expID == PsEvent.squadHeal) {
                    healCount += 1;

                    entry.charts.heals.push({
                        startTime: event.timestamp,
                        endTime: event.timestamp,
                        value: healCount
                    });
                } else if (event.expID == PsEvent.revive || event.expID == PsEvent.squadRevive) {
                    reviveCount += 1;

                    entry.charts.revives.push({
                        startTime: event.timestamp,
                        endTime: event.timestamp,
                        value: reviveCount
                    });
                }
            }
        }

        return entry;
    }

}