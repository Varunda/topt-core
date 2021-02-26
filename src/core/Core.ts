import { ApiResponse, ResponseContent } from "./census/ApiWrapper";

import CensusAPI from "./census/CensusAPI";
import { OutfitAPI, Outfit } from "./census/OutfitAPI";
import { CharacterAPI, Character } from "./census/CharacterAPI";

import { TrackedPlayer, BaseExchange } from "./objects/index";

import { FacilityCapture, TimeTracking, TrackedRouter } from "./InvididualGenerator";

import {
    TEvent, TEventType, 
    TExpEvent, TKillEvent, TDeathEvent, TTeamkillEvent,
    TCaptureEvent, TDefendEvent,
    TVehicleKillEvent,
    TEventHandler,
    TMarkerEvent
} from "./events/index";

import { SubscribeOptions } from "./objects/SubscribeOptions";

import { Squad } from "./squad/Squad";
import { SquadMember } from "./squad/SquadMember"

import { w3cwebsocket, IMessageEvent } from "websocket";

import { Logger } from "./Loggers";
const log = Logger.getLogger("Core");

/**
 * Core class that manages all tracking, sockets, event processing, etc.
 */
export class Core {

    /**
     * Collection of sockets used for tracking
     */
    public sockets = {
        tracked: null as w3cwebsocket | null,
        logistics: null as w3cwebsocket | null,
        logins: null as w3cwebsocket | null,
        facility: null as w3cwebsocket | null,
        debug: null as w3cwebsocket | null,
        added: null as w3cwebsocket | null
    };

    /**
     * Collection of variables used to track router placements
     */
    public routerTracking = {
        // key - Who placed the router
        // value - Lastest npc ID that gave them a router spawn tick
        routerNpcs: new Map() as Map<string, TrackedRouter>, // <char ID, npc ID>

        routers: [] as TrackedRouter[] // All routers that have been placed
    };

    /**
     * Collection of squad related vars
     */
    public squad = {
        debug: false as boolean, // Debug flag to print and include more info
        autoadd: false as boolean, // Auto add people to the tracker when they're found in the squad

        perm: [] as Squad[], // Permanent squads that will always exist, alpha, bravo, etc.
        guesses: [] as Squad[], // The possible squads that are being put together

        members: new Map() as Map<string, SquadMember>, // Members being tracked in squads
    };

    /**
     * Queue of messages to prevent duplicate messages from being processed
     */
    public socketMessageQueue: string[] = [];
    
    /**
     * All messages collected in the debug socket
     */
    public debugSocketMessages: string[] = [];

    /**
     * service ID used to connect to Census
     */
    public serviceID: string;

    /**
     * ID of the server that server-wide tracking will be done on
     */
    public serverID: string;

    /**
     * Collection of players who are being tracked, with the key being the character ID,
     *      and value being where player specific stats are stored
     */
    public stats: Map<string, TrackedPlayer> = new Map<string, TrackedPlayer>();

    /**
     * List of outfits being tracked
     */
    public outfits: Outfit[] = [];

    /**
     * List of characters being tracked
     */
    public characters: Character[] = [];

    /**
     * Misc events that are needed for processing, but are not attached to a single player, such as a FacilityCapture
     */
    public miscEvents: TEvent[] = [];

    /**
     * List of PlayerFacilityCapture and PlayerFacilityDefend events, including those who are not tracked
     */
    public playerCaptures: (TCaptureEvent | TDefendEvent)[] = [];

    /**
     * List of all base captures that have occure
     */
    public captures: BaseExchange[] = [];

    /**
     * List of all events in raw unprocessed form, used to export data
     */
    public rawData: any[] = [];

    /**
     * Tracking tracking
     */
    public tracking: TimeTracking = new TimeTracking();

    /**
     * If core is corrently connected to Census or not
     */
    public connected: boolean = false;

    /**
     * If only include desolation events from the event stream
     */
    public desolationFilter: boolean = false;

    private markerCount: number = 0;

    public constructor(serviceID: string, serverID: string) {
        this.serviceID = serviceID;
        this.serverID = serverID;

        this.socketMessageQueue.length = 5;

        CensusAPI.init(this.serviceID);

        this.squadInit();

        log.info(`Using Promise core`);
    }

    /**
     * Event handlers that can be added onto
     */
    public handlers = {
        exp: [] as TEventHandler<"exp">[],
        kill: [] as TEventHandler<"kill">[],
        death: [] as TEventHandler<"death">[],
        teamkill: [] as TEventHandler<"teamkill">[],
        capture: [] as TEventHandler<"capture">[],
        defend: [] as TEventHandler<"defend">[],
        vehicle: [] as TEventHandler<"vehicle">[],
        login: [] as TEventHandler<"login">[],
        logout: [] as TEventHandler<"logout">[],
        marker: [] as TEventHandler<"marker">[],
        base: [] as TEventHandler<"base">[]
    };

    /**
     * Emit an event and execute all handlers on it
     * 
     * @param event Event being emitted to all handlers
     */
    public emit(event: TEvent): void {
        this.handlers[event.type].forEach((callback: any) => { callback(event); });
    }

    /**
     * Add an event handler that will occur when a specific event is created from the core
     * 
     * @param type      Event to attach the handler to
     * @param handler   Handler that will be executed when that event is emitted
     */
    public on<T extends TEventType>(type: T, handler: TEventHandler<T>): void {
        switch (type) {
            case "exp": this.handlers.exp.push(handler as TEventHandler<"exp">); break;
            case "kill": this.handlers.kill.push(handler as TEventHandler<"kill">); break;
            case "death": this.handlers.death.push(handler as TEventHandler<"death">); break;
            case "teamkill": this.handlers.death.push(handler as TEventHandler<"teamkill">); break;
            case "capture": this.handlers.capture.push(handler as TEventHandler<"capture">); break;
            case "defend": this.handlers.defend.push(handler as TEventHandler<"defend">); break;
            case "vehicle": this.handlers.vehicle.push(handler as TEventHandler<"vehicle">); break;
            case "login": this.handlers.login.push(handler as TEventHandler<"login">); break;
            case "logout": this.handlers.logout.push(handler as TEventHandler<"logout">); break;
            case "marker": this.handlers.marker.push(handler as TEventHandler<"marker">); break;
            case "base": this.handlers.base.push(handler as TEventHandler<"base">); break;
            default: throw `Unchecked event type ${type}`;
        }
    }

    /**
     * Remove handlers and no longer emit events to them
     * 
     * @param type Optional type of handler to clear. If not given, all handlers are cleared
     */
    public clearHandlers(type?: TEventType): void {
        if (type == undefined) {
            this.handlers.exp.length = 0;
            this.handlers.kill.length = 0;
            this.handlers.death.length = 0;
            this.handlers.teamkill.length = 0;
            this.handlers.capture.length = 0;
            this.handlers.defend.length = 0;
            this.handlers.vehicle.length = 0;
            this.handlers.login.length = 0;
            this.handlers.logout.length = 0;
            this.handlers.marker.length = 0;
            this.handlers.base.length = 0;
        } else {
            this.handlers[type].length = 0;
        }
    }

    /**
     * Start the tracking and begin saving events, the core must be connected for this to work
     */
    public start(): void {
        if (this.connected == false) {
            throw `Cannot start TOPT: core is not connected`;
        }

        this.tracking.running = true;

        const nowMs: number = new Date().getTime();
        this.tracking.startTime = nowMs;
        this.stats.forEach((char: TrackedPlayer, charID: string) => {
            char.joinTime = nowMs;
        });

        log.info(`Started core`);
    }

    /**
     * Stop running the tracker
     */
    public stop(): void {
        if (this.tracking.running == true) {
            const nowMs: number = new Date().getTime();
            this.tracking.endTime = nowMs;
        }

        this.tracking.running = false;

        this.stats.forEach((char: TrackedPlayer, charID: string) => {
            if (char.events.length > 0) {
                const first = char.events[0];
                const last = char.events[char.events.length - 1];

                char.joinTime = first.timestamp;
                char.secondsOnline = (last.timestamp - first.timestamp) / 1000;

                const character: Character | undefined = this.characters.find(iter => iter.ID == char.characterID);
                if (character != undefined) {
                    character.secondsPlayed = char.secondsOnline;
                    if (character.secondsPlayed > 0) {
                        character.online = true;
                    }
                }
            } else {
                char.secondsOnline = 0;
            }
        });
    }

    /**
     * Begin tracking all members of an outfit. The core must be connected before this is called
     * 
     * @param tag Tag of the outfit to track. Case-insensitive
     * 
     * @returns An ApiResponse that will resolve when the outfit has been loaded
     */
    public async addOutfit(tag: string): Promise<void> {
        if (this.connected == false) {
            throw `Cannot track outfit ${tag}: Core is not connected`;
        }

        try {
            const outfit: Outfit | null = await OutfitAPI.getByTag(tag);
            if (outfit != null) {
                this.outfits.push(outfit);
            }

            const chars: Character[] = await OutfitAPI.getCharactersByTag(tag);
            this.subscribeToEvents(chars);
        } catch (err: any) {
            log.error(err);
        }
    }

    /**
     * Begin tracking a new player. The core must be connected before calling
     * 
     * @param name Name of the player to track. Case-insensitive
     * 
     * @returns An ApiResponse that will resolve when the character has been loaded and tracked
     */
    public async addPlayer(name: string): Promise<void> {
        if (this.connected == false) {
            throw `Cannot track character ${name}: Core is not connected`;
        }

        if (name.trim().length > 0) {
            const char: Character | null = await CharacterAPI.getByName(name);
            if (char != null) {
                this.subscribeToEvents([char]);
            }
        }
    }

    /**
     * Being tracking a character by the character ID. Core must be connected before calling
     * 
     * @param charID Character ID of the player to begin tracking
     * 
     * @returns An ApiResponse that will resolve when the character has been loaded and tracked
     */
    public async addPlayerByID(charID: string): Promise<void> {
        if (this.connected == false) {
            throw `Cannot track character ${charID}: Core is not connected`;
        }

        if (charID.trim().length > 0) {
            const char: Character | null = await CharacterAPI.getByID(charID);
            if (char != null) {
                this.subscribeToEvents([char]);
            } else {
                log.warn(`Failed to get ${charID} from CharacterAPI`);
            }
        }
    }

    /**
     * Insert a new marker event at the current time. Calling this while the tracker is not running can be dangerous as it 
     *      modifies the event collection
     * 
     * @param mark Mark to be made
     */
    public addMarker(mark: string): void {
        if (this.tracking.running == false) {
            log.warn(`A new marker for ${mark} is being added, adding a marker while not running is not recommended`);
        }

        const ev: TMarkerEvent = {
            type: "marker",
            sourceID: "7103",
            timestamp: new Date().getTime(),
            mark: mark,
        };

        this.rawData.push(JSON.stringify({
            payload: {
                type: ev.type,
                sourceID: ev.sourceID,
                timestamp: ev.timestamp.toString(), // Census events have timestamp as a string
                mark: mark
            },
            service: "event",
            type: "toptMarker"
        }));

        this.miscEvents.push(ev);

        this.emit(ev);
    }

    public subscribe(options: SubscribeOptions): void {
        let obj: any = {
            action: "subscribe",
            service: "event"
        };

        if (options.characters && options.characters.length > 0) {
            obj.characters = options.characters;
        }

        if (options.worlds && options.worlds.length > 0) {
            obj.worlds = options.worlds;
        }

        if (options.events && options.events.length > 0) {
            obj.eventNames = options.events;
        }

        if (options.charactersWorldAnd == true) {
            obj.logicalAndCharactersWithWorlds = true;
        }

        const json: string = JSON.stringify(obj);
        log.debug(`Sending on ${options.socket}: ${json}`);

        if (options.socket == undefined || options.socket == "added") {
            this.sockets.added!.send(json);
        } else if (options.socket == "login") {
            this.sockets.logins!.send(json);
        } else if (options.socket == "tracked") {
            this.sockets.tracked!.send(json);
        } else {
            throw `Unknown socket to subscribe: ${options.socket}`;
        }
    }

    public promiseTest(): void {
        const t: ApiResponse<string> = new ApiResponse();
        const p: Promise<ResponseContent<string>> = t.promise();

        setTimeout(async () => {
            const contents: ResponseContent<string> = await p;
            if (contents.code == 200) {
                console.log(`200: ${contents.data}`);
            } else if (contents.code == 500) {
                console.error(`500: ${contents.data}`);
            }
        });

        setTimeout(() => {
            t.resolve({ code: 200, data: `Hello from the other side` });
        }, 3000);
    }

    /**
     * Subscribe to the events in the event stream and begin tracking them in the squad tracker
     * 
     * @param chars Characters to subscribe to
     */
    public subscribeToEvents(chars: Character[]): void {
        if (this.sockets.tracked == null) {
            log.warn(`Cannot subscribe to events, tracked socket is null`);
            return;
        }

        // No duplicates
        chars = chars.filter((char: Character) => {
            return this.characters.map((c) => c.ID).indexOf(char.ID) == -1;
        });

        if (chars.length == 0) {
            return;
        }

        this.characters = this.characters.concat(chars).sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

        chars.forEach((character: Character) => {
            const player: TrackedPlayer = new TrackedPlayer();
            player.characterID = character.ID;
            player.faction = character.faction;
            player.outfitTag = character.outfitTag;
            player.name = character.name;
            if (character.online == true) { // Begin squad tracking if they're online
                player.joinTime = new Date().getTime();
                this.addMember({ ID: player.characterID, name: player.name, outfitTag: character.outfitTag });
            }
            this.stats.set(character.ID, player);
        });

        // Large outfits like SKL really stress the websockets out if you try to subscribe to 12k members
        //      at once, instead breaking them into chunks works nicely
        const subscribeSetSize: number = 200;
        for (let i = 0; i < chars.length; i += subscribeSetSize) {
            //log.trace(`Slice: ${chars.slice(i, i + subscribeSetSize).map(iter => iter.ID).join(", ")}`);
            const subscribeExp: object = {
                "action": "subscribe",
                "characters": [
                    ...(chars.slice(i, i + subscribeSetSize).map(iter => iter.ID))
                ],
                "eventNames": [
                    "GainExperience",
                    "AchievementEarned",
                    "Death",
                    "FacilityControl",
                    "ItemAdded",
                    "VehicleDestroy"
                ],
                "service": "event"
            };

            this.sockets.tracked.send(JSON.stringify(subscribeExp));
        }
    }

    /**
     * Method called when a socket receives a new message
     * 
     * @param ev Event from a websocket
     */
    public onmessage(ev: IMessageEvent): void {
        for (const message of this.socketMessageQueue) {
            if (ev.data == message) {
                //log.warn(`Duplicate message found: ${ev.data}`);
                return;
            }
        }

        if (typeof(ev.data) != "string") {
            log.error(`Invalid type received from socket: ${typeof(ev.data)}`);
            return;
        }

        this.socketMessageQueue.push(ev.data);
        this.socketMessageQueue.shift();

        this.processMessage(ev.data, false);
    }

}