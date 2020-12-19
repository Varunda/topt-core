import { TEvent } from "../events/index";
import { ApiResponse } from "../census/ApiWrapper";
import { TrackedPlayer } from "../objects/TrackedPlayer";
import { PsEvent } from "../PsEvent";
import { Character } from "../census/CharacterAPI";

import { Logger } from "../Loggers";
const log = Logger.getLogger("FightReport");

export class FightReportParameters {

    public events: TEvent[] = [];

    /**
     * Map of players that will be part of the report <Character ID, TrackedPlayer>
     */
    public players: Map<string, TrackedPlayer> = new Map();

}

export class FightReport {

    public startTime: Date = new Date();

    public endTime: Date = new Date();

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
     * Idk what I'll use this for yet
     */
    public name: string = "Unknown fight";

    public participants: TrackedPlayer[] = [];

    public count = {
        score: 0 as number,
        kills: 0 as number,
        deaths: 0 as number,
        revives: 0 as number,
        heals: 0 as number
    };

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
                        report.entries.push(entry);

                        entry = new FightReportEntry();
                    }
                    inFight = false;
                }
            }

            // Who cares if we're not in a fight
            if (inFight == false) {
                continue;
            }

            // Handle the event based on it's type
            if (event.type == "kill") {
                ++entry.count.kills;

                if (entry.participants.find(iter => iter.characterID == event.sourceID) == null) {
                    const player: TrackedPlayer | undefined = parameters.players.get(event.sourceID);
                    if (player == null) {
                        log.warn(`Missing TrackedCharacter for ${event.sourceID} from ${JSON.stringify(event)}`);
                    } else {
                        entry.participants.push(player);
                    }
                }
            } else if (event.type == "death") {
                if (event.revived == false) {
                    ++entry.count.deaths;
                }

                if (entry.participants.find(iter => iter.characterID == event.sourceID) == null) {
                    const player: TrackedPlayer | undefined = parameters.players.get(event.sourceID);
                    if (player == null) {
                        log.warn(`Missing TrackedCharacter for ${event.sourceID} from ${JSON.stringify(event)}`);
                    } else {
                        entry.participants.push(player);
                    }
                }
            } else if (event.type == "exp") {
                let addchar: boolean = false;
                if (event.expID == PsEvent.heal || event.expID == PsEvent.squadHeal) {
                    ++entry.count.heals;
                    addchar = true;
                } else if (event.expID == PsEvent.revive || event.expID == PsEvent.squadRevive) {
                    ++entry.count.revives;
                    addchar = true;
                }

                if (addchar == true) {
                    if (entry.participants.find(iter => iter.characterID == event.sourceID) == null) {
                        const player: TrackedPlayer | undefined = parameters.players.get(event.sourceID);
                        if (player == null) {
                            log.warn(`Missing TrackedCharacter for ${event.sourceID} from ${JSON.stringify(event)}`);
                        } else {
                            entry.participants.push(player);
                        }
                    }
                }
            }
        }

        response.resolveOk(report);

        return response;
    }

}