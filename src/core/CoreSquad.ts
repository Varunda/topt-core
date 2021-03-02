import { Core } from "./Core";

import { TKillEvent, TDeathEvent, TExpEvent } from "./events/index";
import { PsLoadout, PsLoadouts } from "./census/PsLoadout";
import { PsEvent, PsEvents } from "./PsEvent";

import { Squad } from "./squad/Squad";
import { SquadMember } from "./squad/SquadMember";

import { Logger } from "./Loggers";
const log = Logger.getLogger("Core.Squad");

declare module "./Core" {

    export interface Core {

        /**
         * Start up method called during the ctor, I'm not sure what would happen when it's called twice
         */
        squadInit(): void

        /**
         * Get a specific squad by it's name
         * 
         * @param squadName Squad name to get
         */
        getSquad(squadName: string): Squad | null;

        /**
         * Get a specific squad by it's ID
         * 
         * @param squadID Squad ID to get
         */
        getSquadByID(squadID: number): Squad | null;

        /**
         * Get the squad a member is in
         * 
         * @param charID Character ID of the member to get the squad of
         */
        getSquadOfMember(charID: string): Squad | null;

        /**
         * Process a kill or death event and update the tracked squads
         * 
         * @param event Event to process
         */
        processKillDeathEvent(event: TKillEvent | TDeathEvent): void;

        /**
         * Process an experience event and update the tracked squads
         * 
         * @param event Experience event to process
         */
        processExperienceEvent(event: TExpEvent): void;

        /**
         * Merge one squad into another squad, moving all members
         * 
         * @param mergeInto Name of the squad being merged into
         * @param mergeFrom Name of the squad that the members will be moved out of
         */
        mergeSquads(mergeInto: Squad, mergeFrom: Squad): void;

        /**
         * Begin tracking a new character in the squad
         * 
         * @param char Character to begin tracking
         */
        addMember(char: { ID: string, name: string, outfitTag: string }): void;

        /**
         * Create a new guess squad
         */
        createGuessSquad(): Squad;

        /**
         * Create a new permanent squad
         */
        createPermSquad(): Squad;

        /**
         * Remove a perm squad. Any members are moved to a new guess squad
         * 
         * @param squadName Name of the perm squad to remove
         */
        removePermSquad(squadName: string): void;

        /**
         * Character ID of the member to add to a squad, removing the character
         *      from old squads if needed. Either a squad name or squad ID can be passed,
         *      using a squad ID will be more consistent, but sometimes a squad ID isn't available
         * 
         * @param charID Character ID of the member to move into a squad
         * @param squadRef ID or name of the squad to move the member into
         */
        addMemberToSquad(charID: string, squadRef: string | number): void;

        /**
         * Remove a member from the squad they are currently in,
         * creating a new squad in the process
         * 
         * @param charID Character ID of the character to move out of the squad
         */
        removeMemberFromSquad(charID: string): void;

        /**
         * Mark a member as offline, for example when they log out
         * 
         * @param charID Character ID to mark as offline
         */
        removeMember(charID: string): void;

        /**
         * Print debug information about squads
         */
        printSquadInfo(): void;

    }
}

const squadEvents: string[] = [
    PsEvent.squadResupply,
    PsEvent.squadHeal,
    PsEvent.squadMaxRepair,
    PsEvent.squadMotionDetect,
    PsEvent.squadRadarDetect,
    PsEvent.squadRevive,
    PsEvent.squadShieldRepair,
    //PsEvent.squadSpawn, // Other ID isn't a char ID
    PsEvent.squadSpotKill
];

const nonSquadEvents: string[] = [
    PsEvent.heal,
    PsEvent.revive,
    PsEvent.resupply,
    PsEvent.shieldRepair,
    PsEvent.motionDetect,
    PsEvent.radarDetect,
    PsEvent.spotKill,
];

Core.prototype.squadInit = function(): void {
    // Make the four default squads
    this.createPermSquad();
    this.createPermSquad();
    this.createPermSquad();
    this.createPermSquad();

    // Every second update the death timer and beacon cooldown if needed
    setInterval(() => {
        const time: number = new Date().getTime();
        this.squad.members.forEach((member: SquadMember, charID: string) => {

            // If they've died update their dying timer
            if (member.state == "dying" && member.whenDied != null) {
                member.timeDead = (time - member.whenDied) / 1000; // ms to seconds

                if (member.timeDead > 29) {
                    member.state = "dead"; // They've been dead too long
                }
            }

            // If they've placed a beacon update the timer
            if (member.whenBeacon) {
                member.beaconCooldown = (time - member.whenBeacon) / 1000;

                if (member.beaconCooldown > 299) {
                    member.whenBeacon = null;
                    member.beaconCooldown = 0;
                }
            }
        });
    }, 1000);
}

/**
 * Sort the names in a squad, by online status, then name
 * 
 * @param squad Squad to sort the members of
 */
function sortSquad(squad: Squad): void {
    squad.members.sort((a, b) => {
        if (b.online == false && a.online == false) {
            return a.name.localeCompare(b.name);
        }
        if (b.online == false && a.online == true) {
            return -1;
        }
        if (b.online == true && a.online == false) {
            return 1;
        }
        return a.name.localeCompare(b.name);
    });
}

Core.prototype.addMember = function(char: { ID: string, name: string, outfitTag: string }): void {
    if (this.squad.members.has(char.ID)) {
        this.squad.members.get(char.ID)!.online = true;
        log.debug(`${char.name}/${char.ID} was online before, setting online again`);
        return;
    }

    this.squad.members.set(char.ID, {
        name: char.name,
        charID: char.ID,
        outfitTag: char.outfitTag,
        class: "",
        state: "alive",
        timeDead: 0,
        whenDied: null,
        whenBeacon: null,
        beaconCooldown: 0,
        online: true
    });

    const member: SquadMember = this.squad.members.get(char.ID)!;
    member.online = true;

    log.debug(`Started squad tracking ${char.name}/${char.ID}`);

    const squad: Squad = this.createGuessSquad();
    squad.members.push(member);
    sortSquad(squad);
}

Core.prototype.processKillDeathEvent = function(event: TKillEvent | TDeathEvent): void {
    if (event.type == "kill") {
        if (this.squad.members.has(event.sourceID)) {
            const member: SquadMember = this.squad.members.get(event.sourceID)!;
            member.state = "alive";
            member.timeDead = 0;
            member.whenDied = null;

            const loadout: PsLoadout = PsLoadouts.get(event.loadoutID) ?? PsLoadout.default;
            switch (loadout.type) {
                case "infil": member.class = "I"; break;
                case "lightAssault": member.class = "L"; break;
                case "medic": member.class = "M"; break;
                case "engineer": member.class = "E"; break;
                case "heavy": member.class = "H"; break;
                case "max": member.class = "W"; break;
                case "unknown": member.class = ""; break;
            }
        }
    } else if (event.type == "death") {
        if (this.squad.members.has(event.sourceID)) {
            const member: SquadMember = this.squad.members.get(event.sourceID)!;
            member.state = "dying";
            member.whenDied = new Date().getTime();
            member.timeDead = 0;

            const loadout: PsLoadout = PsLoadouts.get(event.loadoutID) ?? PsLoadout.default;
            switch (loadout.type) {
                case "infil": member.class = "I"; break;
                case "lightAssault": member.class = "L"; break;
                case "medic": member.class = "M"; break;
                case "engineer": member.class = "E"; break;
                case "heavy": member.class = "H"; break;
                case "max": member.class = "W"; break;
                case "unknown": member.class = ""; break;
            }
        }
    }
}

const validRespawnEvent = (ev: TExpEvent, whenDied: number | null): boolean => {
    // These events can happen whenever and aren't useful for knowing if someone is alive or not
    if (ev.expID == PsEvent.resupply || ev.expID == PsEvent.squadResupply
        || ev.expID == PsEvent.shieldRepair || ev.expID == PsEvent.squadShieldRepair
        || ev.expID == PsEvent.killAssist
        || ev.expID == PsEvent.ribbon
        || ev.expID == PsEvent.motionDetect || ev.expID == PsEvent.squadMotionDetect
        || ev.expID == PsEvent.squadSpawn
        || ev.expID == PsEvent.drawfire
        //|| ev.expID == PsEvent.heal || ev.expID == PsEvent.squadHeal // People rarely run mending field to make this an issue
        ) {
        return false;
    }

    // These events might be useful, depending on how long ago the player died, for example if they get a revive
    //      within 1 second of death it might be a revive nade, but if it's after 8 seconds we know they had to respawn
    //      in some other way as a revive nade takes 2.5 seconds to prime

    /*
    if (whenDied != null) {
        log.log(`It's been ${ev.timestamp - whenDied} ms since death`);
        if (((ev.expID == PsEvent.revive || ev.expID == PsEvent.squadRevive) && (ev.timestamp - whenDied <= 5)) // Revive nades take 2.5 seconds to prime
            || ((ev.expID == PsEvent.heal || ev.expID == PsEvent.squadHeal) && (ev.timestamp - whenDied <= 15)) // Heal nades last for 10? seconds
        ) {
            return false;
        }
    }
    */

    return true;
}

Core.prototype.processExperienceEvent = function(event: TExpEvent): void {
    if (event.expID == PsEvent.revive || event.expID == PsEvent.squadRevive) {
        if (this.squad.members.has(event.targetID)) {
            const member: SquadMember = this.squad.members.get(event.targetID)!;

            member.state = "alive";
            member.timeDead = 0;
            member.whenDied = null;
        }
    }

    if (event.expID == PsEvent.squadSpawn) {
        if (this.squad.members.has(event.sourceID)) {
            const member: SquadMember = this.squad.members.get(event.sourceID)!;
            if (member.whenBeacon == null) {
                log.debug(`${member.name} placed a beacon`);

                member.beaconCooldown = 300;
                member.whenBeacon = new Date().getTime();
            }
        }
    }

    if (this.squad.members.has(event.sourceID)) {
        const member: SquadMember = this.squad.members.get(event.sourceID)!;

        if (member.state != "alive") {
            if (validRespawnEvent(event, member.whenDied) == true) {
                member.state = "alive";
                member.whenDied = null;
                member.timeDead = 0;
                //debug(`${member.name} was revived from ${event}`);
            } 
        }

        const loadout: PsLoadout = PsLoadouts.get(event.loadoutID) ?? PsLoadout.default;
        switch (loadout.type) {
            case "infil": member.class = "I"; break;
            case "lightAssault": member.class = "L"; break;
            case "medic": member.class = "M"; break;
            case "engineer": member.class = "E"; break;
            case "heavy": member.class = "H"; break;
            case "max": member.class = "W"; break;
            case "unknown":
                log.warn(`Unknown class from event: ${event}`);
                member.class = ""; 
                break;
        }
    }

    const sourceMember: SquadMember | undefined = this.squad.members.get(event.sourceID);
    const targetMember: SquadMember | undefined = this.squad.members.get(event.targetID);

    // There are events that happen where no one is tracked
    if (sourceMember == undefined && targetMember == undefined) { return; }

    if (this.squad.autoadd == false && (sourceMember == undefined || targetMember == undefined)) {
        return;
    }

    if (this.squad.autoadd == true) {
        if (squadEvents.indexOf(event.trueExpID) > -1) {
            if (sourceMember == undefined && targetMember != undefined) {
                log.info(`${event.sourceID} is not tracked, adding them to the tracker from ${JSON.stringify(event)}`);
                this.addPlayerByID(event.sourceID).then(() => {
                    this.processExperienceEvent(event);
                });
            }
            if (sourceMember != undefined && targetMember == undefined) {
                log.info(`${event.targetID} is not tracked, adding them to the tracker from ${JSON.stringify(event)}`);
                this.addPlayerByID(event.targetID).then(() => {
                    this.processExperienceEvent(event);
                });
            }
            return;
        }
    }

    if (this.squad.autoadd == true && (sourceMember == undefined || targetMember == undefined)) {
        log.warn(`Not sure how we got here`);
        return;
    }
    if (sourceMember == undefined || targetMember == undefined) {
        throw `Bad logic above ^^^`;
    }

    let sourceSquad: Squad | null = this.getSquadOfMember(event.sourceID);
    let targetSquad: Squad | null = this.getSquadOfMember(event.targetID);

    if (sourceSquad == null) {
        sourceSquad = this.createGuessSquad();
        sourceSquad.members.push(sourceMember);
    }

    if (targetSquad == null) {
        targetSquad = this.createGuessSquad();
        targetSquad.members.push(targetMember);
    }

    // Check if the squads need to be merged into one another if this was a squad exp source
    if (squadEvents.indexOf(event.trueExpID) > -1) {
        if (sourceSquad.ID == targetSquad.ID) {
            //log.log(`${sourceMember.name} // ${targetMember.name} are already in a squad`);
        } else {
            const ev: PsEvent | undefined = PsEvents.get(event.expID);

            // 3 cases:
            //      1. Both squads are guesses => Merge squads
            //      2. One squad isn't a guess => Move guess squad into non-guess squad
            //      3. Neither squad is a guess => Move member who performed action into other squad
            if (targetSquad.guess == true && sourceSquad.guess == true) {
                log.debug(`Both guesses, merging ${sourceMember.name} (${sourceSquad}) into ${targetMember.name} (${targetSquad}) from ${ev?.name}`);

                this.mergeSquads(sourceSquad, targetSquad);
            } else if (targetSquad.guess == false && sourceSquad.guess == true) {
                log.debug(`Target is not a guess, merging ${sourceMember.name} (${sourceSquad}) into ${targetMember.name} (${targetSquad}) from ${ev?.name}`);

                this.mergeSquads(targetSquad, sourceSquad);
            } else if (targetSquad.guess == true && sourceSquad.guess == false) {
                log.debug(`Source is not a guess, merging ${targetMember.name} (${targetSquad}) into ${sourceMember.name} (${sourceSquad}) from ${ev?.name}`);

                this.mergeSquads(sourceSquad, targetSquad);
            } else if (targetSquad.guess == false && sourceSquad.guess == false) {
                log.debug(`Neither squad is a guess, moving ${targetMember.name} into ${sourceMember} (${sourceSquad}) from ${ev?.name}`);
                sourceSquad.members.push(targetMember);
                targetSquad.members = targetSquad.members.filter(iter => iter.charID != targetMember.charID);
            }

            sortSquad(sourceSquad);
            sortSquad(targetSquad);
        }
    }

    // Check if the squad is no longer valid and needs to be removed, i.e. moved squads
    if (nonSquadEvents.indexOf(event.trueExpID) > -1) {
        //log.log(`Non squad event: ${event.trueExpID}`);
        if (sourceSquad.ID == targetSquad.ID) {
            log.debug(`${sourceMember.name} was in squad with ${targetMember.name}, but didn't get an expect squad exp event`);

            targetSquad.members = targetSquad.members.filter(iter => iter.charID != sourceMember.charID);

            const squad: Squad = this.createGuessSquad();
            squad.members.push(sourceMember);

            sortSquad(squad);
            sortSquad(targetSquad);
            sortSquad(sourceSquad);
        }
    }
}

Core.prototype.getSquad = function(squadName: string): Squad | null {
    let squad: Squad | null = this.squad.perm.find(iter => iter.name == squadName) || null;
    if (squad != null) {
        return squad;
    }

    return this.squad.guesses.find(iter => iter.name == squadName) || null;
}

Core.prototype.getSquadByID = function(squadID: number): Squad | null {
    let squad: Squad | null = this.squad.perm.find(iter => iter.ID == squadID) || null;
    if (squad != null) {
        return squad;
    }

    return this.squad.guesses.find(iter => iter.ID == squadID) || null;
}

Core.prototype.addMemberToSquad = function(charID: string, squadRef: string | number): void {
    const member: SquadMember | undefined = this.squad.members.get(charID);
    if (member == undefined) {
        return log.warn(`Cannot move ${charID} to ${squadRef}: ${charID} is not a squad member`);
    }

    const squad: Squad | null = (typeof(squadRef) == "string") ? this.getSquad(squadRef) : this.getSquadByID(squadRef);
    if (squad == null) {
        return log.warn(`Cannot move ${charID} to ${squadRef}: squad ${squadRef} does not exist`);
    }

    if (squad.members.find(iter => iter.charID == charID) != null) {
        return log.debug(`${charID} is already part of squad ${squadRef}, no need to move`);
    }

    const oldSquad: Squad | null = this.getSquadOfMember(charID);
    if (oldSquad != null) {
        log.debug(`${charID} is currently in ${oldSquad.name}, moving out of it`);
        oldSquad.members = oldSquad.members.filter(iter => iter.charID != charID);

        if (oldSquad.members.length == 0 && oldSquad.guess == true) {
            this.squad.guesses = this.squad.guesses.filter(iter => iter.ID != oldSquad.ID);
        }
    }

    squad.members.push(member);
    sortSquad(squad);
}

Core.prototype.getSquadOfMember = function(charID: string): Squad | null {
    const check = (squad: Squad) => {
        return squad.members.find(iter => iter.charID == charID) != null;
    }

    for (const squad of this.squad.perm) {
        if (check(squad) == true) {
            return squad;
        }
    }

    for (const squad of this.squad.guesses) {
        if (check(squad) == true) {
            return squad;
        }
    }

    log.debug(`Failed to find a squad for ${charID}`);

    return null;
}

Core.prototype.mergeSquads = function(into: Squad, from: Squad): void {
    into.members.push(...from.members);
    from.members = [];

    if (from.guess == true) {
        log.debug(`${from.name} is a guess, removing from list`);
        this.squad.guesses = this.squad.guesses.filter(iter => iter.ID != from.ID);
    }
}

let squadNameIndex: number = 0; 
let squadNames: string[] = [
    "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "a", "s", "d",
    "f", "g", "h", "j", "k", "l", "z", "x", "c", "v", "b", "n", "m"
];

let permSquadNames: string[] = [
    "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"
];

Core.prototype.createGuessSquad = function(): Squad {
    const squad: Squad = new Squad();
    squad.name = squadNames[(squadNameIndex++) % 26];
    squad.guess = true;

    log.debug(`Created new guess squad ${squad.name}`);

    this.squad.guesses.push(squad);

    return squad;
}

Core.prototype.createPermSquad = function(): Squad {
    const squad: Squad = new Squad();
    squad.name = `${this.squad.perm.length + 1}`;
    squad.guess = false;
    squad.display = permSquadNames[(this.squad.perm.length % permSquadNames.length)];

    log.debug(`Created new perm squad ${squad.name}/${squad.display}`);

    this.squad.perm.push(squad);

    return squad;
}

Core.prototype.removePermSquad = function(squadName: string): void {
    for (const squad of this.squad.perm) {
        if (squad.name == squadName && squad.members.length > 0) {
            const newSquad: Squad = this.createGuessSquad();
            for (const member of squad.members) {
                newSquad.members.push(member);
            }
            sortSquad(newSquad);

            squad.members = [];
        }
    }

    this.squad.perm = this.squad.perm.filter(iter => iter.name != squadName);
}

Core.prototype.removeMemberFromSquad = function(charID: string): void {
    log.debug(`Remove ${charID} from their current squad into a new one`);

    const member: SquadMember | undefined = this.squad.members.get(charID);
    if (member == undefined) {
        log.warn(`Cannot remove ${charID} from their current squad, they are not tracked`);
        return;
    }

    const squad: Squad | null = this.getSquadOfMember(charID);
    if (squad == null) {
        log.warn(`Failed to find the squad that ${charID} is in`);
        return;
    }

    const newSquad: Squad = this.createGuessSquad();
    this.addMemberToSquad(charID, newSquad.ID);
}

Core.prototype.removeMember = function(charID: string): void {
    log.debug(`${charID} went offline`);

    if (this.squad.members.has(charID)) {
        const char: SquadMember = this.squad.members.get(charID)!
        char.online = false;
        char.state = "alive";
        char.whenDied = null;
        char.timeDead = 0;
    }
}

Core.prototype.printSquadInfo = function(): void {
    log.info(`Perm squads:`);
    for (const squad of this.squad.perm) {
        log.info(`\t${squad}`);
    }

    log.info(`Guess squads:`);
    for (const squad of this.squad.guesses) {
        log.info(`\t${squad}`);
    }

    log.info(`Members:`);
    for (const entry of this.squad.members) {
        const charID: string = entry[0];
        const member: SquadMember = entry[1];
        const squad: Squad | null = this.getSquadOfMember(charID);

        log.info(`\t${member.name}/${member.charID} is in ${squad?.name}/${squad?.ID} ${squad == null ? "Missing squad" : ""}`);
    }
}