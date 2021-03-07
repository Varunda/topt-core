import { Core } from "./Core";

import { PsEventType, PsEvent, PsEvents } from "./PsEvent";

import { PsLoadout, PsLoadouts } from "./census/PsLoadout";
import { Weapon, WeaponAPI } from "./census/WeaponAPI";
import { CharacterAPI, Character } from "./census/CharacterAPI";

import { FacilityCapture, PlayerVersus } from "./InvididualGenerator";

import { TrackedPlayer, TrackedNpc, TrackedNpcType } from "./objects/index";

import {
    TEvent, TEventType,
    TExpEvent, TKillEvent, TDeathEvent, TTeamkillEvent,
    TCaptureEvent, TDefendEvent,
    TVehicleKillEvent, TLoginEvent, TLogoutEvent,
    TMarkerEvent, TBaseEvent,
    TEventHandler,
} from "./events/index";

import { Logger } from "./Loggers";
const log = Logger.getLogger("Core.Processing");
const log2 = Logger.getLogger("Core.Processing.Trace");

declare module "./Core" {

    export interface Core {

        /**
         * Process a JSON message into an Event that's emitted
         * 
         * @param input     JSON string input to be processed into an Event
         * @param override  Will this message always be processed, even if it's not running?
         */
        processMessage(input: string, override: boolean): void;

    }
}

(Core as any).prototype.processMessage = function(input: string, override: boolean = false): void {
    const self: Core = this as Core;

    if (self.tracking.running == false && override == false) {
        return;
    }

    let save: boolean = false;

    const msg = JSON.parse(input);

    if (msg.type == "serviceMessage") {
        const event: string = msg.payload.event_name;
        const timestamp: number = Number.parseInt(msg.payload.timestamp) * 1000;

        const zoneID: string = msg.payload.zone_id;
        if (self.desolationFilter == true && zoneID != undefined) {
            const zoneIDN = Number.parseInt(zoneID);
            if ((zoneIDN & 0x0000FFFF) == 0x0169) {
                log2.debug(`Got ${event} in definition id ${zoneIDN & 0xFFFF} instance id ${(zoneIDN & 0xFFFF0000) >> 16}`);
            } else {
                log2.debug(`Skipped ${event} in zone ${zoneID}`);
                return;
            }
        }

        if (event == "GainExperience") {
            const eventID: string = msg.payload.experience_id;
            const charID: string = msg.payload.character_id;
            const targetID: string = msg.payload.other_id;
            const amount: number = Number.parseInt(msg.payload.amount);
            const event: PsEvent | undefined = PsEvents.get(eventID);

            if (eventID == PsEvent.constructionSpawn || eventID == PsEvent.sundySpawn) {
                const type: TrackedNpcType = (eventID == PsEvent.constructionSpawn) ? "router"
                    : (eventID == PsEvent.sundySpawn) ? "sundy"
                    : "unknown";

                const npcID: number = Number.parseInt(targetID);

                if (type == "router") {
                    const npcs: TrackedNpc[] = Array.from(self.npcs.active.values());

                    /*
                    for (const npc of npcs) {
                        if (npc.ownerID == charID && npc.ID != targetID) {
                            log.debug(`Router replaced, adding to destroyed`);

                            npc.destroyedAt = timestamp;
                            npc.destroyedByID = charID;

                            self.npcs.all.push(npc);
                            self.npcs.active.delete(npc.ID);
                        }
                    }
                    */
                }

                if (self.npcs.active.has(targetID) == false) {
                    const npc: TrackedNpc = {
                        ID: targetID,
                        ownerID: charID,
                        pulledAt: timestamp,
                        firstSpawnAt: timestamp,
                        destroyedAt: null,
                        destroyedByID: null,
                        spawns: [],
                        count: 1, // Count the event that caused the new router to be tracked
                        type: type
                    }

                    self.npcs.active.set(targetID, npc);

                    log.debug(`${npc.type}/${npcID.toString(16)} found, placed by ${charID} at ${timestamp}`);
                }

                const npc: TrackedNpc = self.npcs.active.get(targetID)!;
                npc.spawns.push(timestamp);
                npc.count += 1;
            } else if (eventID == PsEvent.routerKill || eventID == PsEvent.sundyDestroyed) {
                if (self.npcs.active.has(targetID) == true) {
                    const npc: TrackedNpc = self.npcs.active.get(targetID)!;

                    npc.destroyedAt = timestamp;
                    npc.destroyedByID = charID;

                    self.npcs.all.push({...npc});
                    self.npcs.active.delete(npc.ID);

                    log.debug(`${npc.type}/${Number.parseInt(npc.ID).toString(16)} destroyed, lasted ${(npc.destroyedAt - npc.pulledAt)/1000}s, killed by ${charID}, ${npc.count} spawns`);
                }
            }

            const ev: TExpEvent = {
                type: "exp",
                amount: amount,
                expID: eventID,
                zoneID: zoneID,
                trueExpID: eventID,
                loadoutID: msg.payload.loadout_id,
                sourceID: charID,
                targetID: targetID,
                timestamp: timestamp
            };

            // Undefined means was the target of the event, not the source
            const player = self.stats.get(charID);
            if (player != undefined) {
                if (Number.isNaN(amount)) {
                    log.warn(`NaN amount from event: ${JSON.stringify(msg)}`);
                } else {
                    player.score += amount;
                }

                if (event != undefined) {
                    if (event.track == true) {
                        player.stats.increment(eventID);

                        if (event.alsoIncrement != undefined) {
                            const alsoEvent: PsEvent = PsEvents.get(event.alsoIncrement)!;
                            if (alsoEvent.track == true) {
                                player.stats.increment(event.alsoIncrement);
                            }

                            ev.expID = event.alsoIncrement;
                        }
                    }
                }

                player.events.push(ev);
            } else {
                self.miscEvents.push(ev);
            }

            self.processExperienceEvent(ev);
            self.emit(ev);

            if (eventID == PsEvent.revive || eventID == PsEvent.squadRevive) {
                const target = self.stats.get(targetID);
                if (target != undefined) {
                    if (target.recentDeath != null) {
                        target.recentDeath.revived = true;
                        target.recentDeath.revivedEvent = ev;
                        //log.debug(`${targetID} died but was revived by ${charID}`);
                    }

                    target.stats.decrement(PsEvent.death);
                    target.stats.increment(PsEvent.revived);
                }
            }

            save = true;
        } else if (event == "Death") {
            const targetID: string = msg.payload.character_id;
            const sourceID: string = msg.payload.attacker_character_id;
            const isHeadshot: boolean = msg.payload.is_headshot == "1";
            const targetLoadoutID: string = msg.payload.character_loadout_id;
            const sourceLoadoutID: string = msg.payload.attacker_loadout_id;

            if (self.tracking.running == true) {
                CharacterAPI.cache(targetID);
                CharacterAPI.cache(sourceID);
            }

            const targetLoadout: PsLoadout | undefined = PsLoadouts.get(targetLoadoutID);
            if (targetLoadout == undefined) {
                return log.warn(`Unknown target loadout ID: ${targetLoadoutID}`);
            }

            const sourceLoadout: PsLoadout | undefined = PsLoadouts.get(sourceLoadoutID);
            if (sourceLoadout == undefined) {
                return log.warn(`Unknown source loadout ID: ${sourceLoadoutID}`);
            }

            let targetTicks = self.stats.get(targetID);
            if (targetTicks != undefined && targetLoadout.faction != sourceLoadout.faction) {
                targetTicks.stats.increment(PsEvent.death);

                const ev: TDeathEvent = {
                    type: "death",
                    isHeadshot: isHeadshot,
                    sourceID: targetID, // Swap the target and source to keep the events consistent
                    targetID: sourceID,
                    loadoutID: targetLoadoutID,
                    targetLoadoutID: sourceLoadoutID,
                    weaponID: msg.payload.attacker_weapon_id,
                    revived: false,
                    revivedEvent: null,
                    timestamp: timestamp,
                    zoneID: zoneID
                };

                targetTicks.events.push(ev);
                targetTicks.recentDeath = ev;

                if (self.tracking.running == true) {
                    WeaponAPI.precache(ev.weaponID);
                }

                self.emit(ev);
                self.processKillDeathEvent(ev);

                save = true;
            }

            let sourceTicks = self.stats.get(sourceID);
            if (sourceTicks != undefined) {
                if (targetLoadout.faction == sourceLoadout.faction) {
                    sourceTicks.stats.increment(PsEvent.teamkill);
                    targetTicks?.stats.increment(PsEvent.teamkilled);

                    const ev: TTeamkillEvent = {
                        type: "teamkill",
                        sourceID: sourceID,
                        loadoutID: sourceLoadoutID,
                        targetID: targetID,
                        targetLoadoutID: targetLoadoutID,
                        weaponID: msg.payload.attacker_weapon_id,
                        zoneID: zoneID,
                        timestamp: timestamp
                    };

                    sourceTicks.events.push(ev);

                    self.emit(ev);
                } else {
                    sourceTicks.stats.increment(PsEvent.kill);

                    if (isHeadshot == true) {
                        sourceTicks.stats.increment(PsEvent.headshot);
                    }

                    const ev: TKillEvent = {
                        type: "kill",
                        isHeadshot: isHeadshot,
                        sourceID: sourceID,
                        targetID: targetID,
                        loadoutID: sourceLoadoutID,
                        targetLoadoutID: targetLoadoutID,
                        weaponID: msg.payload.attacker_weapon_id,
                        timestamp: timestamp,
                        zoneID: zoneID
                    };
                    sourceTicks.events.push(ev);

                    WeaponAPI.precache(ev.weaponID);
                    self.emit(ev);

                    self.processKillDeathEvent(ev);
                }

                save = true;
            }
        } else if (event == "PlayerFacilityCapture") {
            const playerID: string = msg.payload.character_id;
            const outfitID: string = msg.payload.outfit_id;
            const facilityID: string = msg.payload.facility_id;

            const ev: TCaptureEvent = {
                type: "capture",
                sourceID: playerID,
                outfitID: outfitID,
                facilityID: facilityID,
                timestamp: timestamp,
                zoneID: zoneID
            };

            self.playerCaptures.push(ev);

            let player = self.stats.get(playerID);
            if (player != undefined) {
                //log.debug(`Tracked player ${player.name} got a capture on ${ev.facilityID}`);
                player.stats.increment(PsEvent.baseCapture);
                player.events.push(ev);
            }

            self.emit(ev);

            save = true;
        } else if (event == "PlayerFacilityDefend") {
            const playerID: string = msg.payload.character_id;
            const outfitID: string = msg.payload.outfit_id;
            const facilityID: string = msg.payload.facility_id;

            const ev: TDefendEvent = {
                type: "defend",
                sourceID: playerID,
                outfitID: outfitID,
                facilityID: facilityID,
                timestamp: timestamp,
                zoneID: zoneID,
            }

            self.playerCaptures.push(ev);

            let player = self.stats.get(playerID);
            if (player != undefined) {
                player.stats.increment(PsEvent.baseDefense);
                player.events.push(ev);
            }

            self.emit(ev);

            save = true;
        } else if (event == "AchievementEarned") {
            const charID: string = msg.payload.character_id;
            const achivID: string = msg.payload.achievement_id;

            const char = self.stats.get(charID);
            if (char != undefined) {
                char.ribbons.increment(achivID);
                save = true;
            }
        } else if (event == "FacilityControl") {
            const outfitID: string = msg.payload.outfit_id;
            const facilityID: string = msg.payload.facility_id;

            const capture = {
                facilityID: facilityID,
                zoneID: zoneID,
                timestamp: new Date(timestamp),
                timeHeld: Number.parseInt(msg.payload.duration_held),
                factionID: msg.payload.new_faction_id,
                outfitID: outfitID,
                previousFaction: msg.payload.old_faction_id,
            };

            self.captures.push(capture);

            save = true;

            const ev: TBaseEvent = {
                type: "base",
                sourceID: "7153",
                facilityID: capture.facilityID,
                timestamp: timestamp,
                zoneID: zoneID,
                outfitID: capture.outfitID,
                factionID: capture.factionID,
                previousFactionID: capture.previousFaction,
                timeHeld: capture.timeHeld,
                worldID: msg.payload.world_id
            }

            self.emit(ev);
        } else if (event == "ItemAdded") {
            const itemID: string = msg.payload.item_id;
            const charID: string = msg.payload.character_id;

            if (itemID == "6003551") {
                if (self.stats.get(charID) != undefined) {
                    /*
                    const npcs: TrackedNpc[] = Array.from(self.npcs.active.values());

                    for (const npc of npcs) {
                        if (npc.ownerID == charID && npc.type == "router") {
                            log.debug(`Router replaced, adding to destroyed`);

                            npc.destroyedAt = timestamp;
                            npc.destroyedByID = charID;

                            self.npcs.all.push(npc);
                            self.npcs.active.delete(npc.ID);
                        }
                    }
                    */
                    /* Turned off cause it's not actually that useful and making tracking harder
                    //log.debug(`${charID} pulled a new router`);

                    if (self.routerTracking.routerNpcs.has(charID)) {
                        const router: TrackedNpc = self.routerTracking.routerNpcs.get(charID)!;
                        //log.debug(`${charID} pulled a new router, saving old one`);
                        router.destroyedAt = timestamp;

                        self.routerTracking.routers.push({...router});
                    }

                    const router: TrackedNpc = {
                        ID: "", // We don't get the NPC ID until someone spawns on the router
                        ownerID: charID,
                        count: 0,
                        firstSpawnAt: null,
                        destroyedAt: null,
                        destroyedByID: null,
                        pulledAt: timestamp,
                        type: "router"
                    };

                    self.routerTracking.routerNpcs.set(charID, router);
                    */

                    save = true;
                }
            }
        } else if (event == "VehicleDestroy") {
            const killerID: string = msg.payload.attacker_character_id;
            const killerLoadoutID: string = msg.payload.attacker_loadout_id;
            const killerWeaponID: string = msg.payload.attacker_weapon_id;
            const vehicleID: string = msg.payload.vehicle_id;

            const ev: TVehicleKillEvent = {
                type: "vehicle",
                sourceID: killerID,
                loadoutID: killerLoadoutID,
                weaponID: killerWeaponID,
                targetID: msg.payload.character_id,
                vehicleID: vehicleID,
                attackerVehicleID: msg.payload.attacker_vehicle_id,
                timestamp: timestamp,
                zoneID: zoneID
            };

            const player = self.stats.get(killerID);
            if (player != undefined) {
                player.events.push(ev);
            } else {
                self.miscEvents.push(ev);
            }
            self.emit(ev);

            save = true;
        } else if (event == "PlayerLogin") {
            const charID: string = msg.payload.character_id;
            if (this.stats.has(charID)) {
                const char: TrackedPlayer = this.stats.get(charID)!;
                char.online = true;
                if (this.tracking.running == true) {
                    char.joinTime = new Date().getTime();
                }

                const ev: TLoginEvent = {
                    type: "login",
                    sourceID: charID,
                    timestamp: timestamp
                }

                char.events.push(ev);

                self.emit(ev);

                self.addMember({
                    ID: char.characterID,
                    name: char.name,
                    outfitTag: char.outfitTag 
                });
            }
        } else if (event == "PlayerLogout") {
            const charID: string = msg.payload.character_id;
            if (this.stats.has(charID)) {
                const char: TrackedPlayer = this.stats.get(charID)!;
                char.online = false;

                if (this.tracking.running == true) {
                    const diff: number = new Date().getTime() - char.joinTime;
                    char.secondsOnline += (diff / 1000);
                }

                const ev: TLogoutEvent = {
                    type: "logout",
                    sourceID: charID,
                    timestamp: timestamp
                };

                char.events.push(ev);

                self.emit(ev);

                self.removeMember(charID);
            }
        } else {
            log.warn(`Unknown event type: ${event}\n${JSON.stringify(msg)}`);
        }
    } else if (msg.type == "heartbeat") {
        //log.debug(`Heartbeat ${new Date().toISOString()}`);
    } else if (msg.type == "serviceStateChanged") {
        log.trace(`serviceStateChanged event`);
    } else if (msg.type == "connectionStateChanged") {
        log.trace(`connectionStateChanged event`);
    } else if (msg.type == undefined) {
        // Occurs in response to subscribing to new events
    } else if (msg.type == "toptMarker") {
        // These events are special because they will only be encountered during playback, not during
        //      traacking, as these are manually added by an outside source

        log.info(`Processed a toptMarker event: ${JSON.stringify(msg)}`);

        const ev: TMarkerEvent = {
            type: "marker",
            mark: msg.payload.mark,
            sourceID: msg.payload.sourceID,
            timestamp: Number.parseInt(msg.payload.timestamp),
        };
        self.miscEvents.push(ev);

        save = true;
    } else {
        log.warn(`Unchecked message type: '${msg.type}'`);
    }

    if (save == true) {
        self.rawData.push(JSON.stringify(msg));
    }
}