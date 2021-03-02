
import { Core } from "./Core";

import { OutfitAPI, Outfit } from "./census/OutfitAPI";
import { Character, CharacterAPI } from "./census/CharacterAPI";
import { ApiResponse } from "./census/ApiWrapper";

import { Logger } from "./Loggers";
const log = Logger.getLogger("Playback");

export class PlaybackOptions {

    public speed: number = 0;

}

export class Playback {

    private static _core: Core | null = null;

    private static _events: any[] = [];
    private static _parsed: any[] = [];

    public static setCore(core: Core): void {
        Playback._core = core;
    }

    public static loadFile(file: File | string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            if (Playback._core == null) {
                return reject(`Cannot load file: Core has not been set. Did you forget to use Playback.setCore()?`);
            }

            if (typeof(file) == "string") {
                log.debug(`using a string`);
                await this.process(file);
                return resolve();
            } else {
                log.debug(`using a file`);
                const reader: FileReader = new FileReader();

                reader.onload = (async (ev: ProgressEvent<FileReader>) => {
                    await this.process(reader.result as string)
                    return resolve();
                });
                reader.onabort = (async (ev: ProgressEvent<FileReader>) => {
                    return reject(`reader aborted`);
                });
                reader.onerror = (async (ev: ProgressEvent<FileReader>) => {
                    return reject(`reader errored`);
                });

                reader.readAsText(file);
            }
        });
    }

    private static async process(str: string): Promise<void> {
        const data: any = JSON.parse(str);

        if (!data.version) {
            log.error(`Missing version from import`);
            throw `Missing version from import`;
        } else if (data.version == "1") {
            const nowMs: number = new Date().getTime();

            log.debug(`Exported data uses version 1`);
            const chars: Character[] = data.players;
            const outfits: (string | object)[] = data.outfits;
            const events: any[] = data.events;

            if (data.characters != undefined) {
                CharacterAPI.setCache(data.characters);
            }

            // Force online for squad tracking
            this._core!.subscribeToEvents(chars.map(iter => { iter.online = iter.secondsPlayed > 0; return iter; }));

            if (events != undefined && events.length != 0) {
                Playback._events = events;

                const parsedData = events.map(iter => JSON.parse(iter));
                Playback._parsed = parsedData;
            }

            if (outfits.length > 0) {
                const item: string | object = outfits[0];

                let outfitIDs: string[] = [];
                if (typeof(item) == "string") {
                    outfitIDs = outfits as string[];
                } else {
                    outfitIDs = (outfits as Outfit[]).map(iter => iter.ID);
                }

                const data: Outfit[] = await OutfitAPI.getByIDs(outfitIDs);
                this._core!.outfits = data;
                log.info(`From [${outfitIDs.join(", ")}] loaded: ${JSON.stringify(data)}`);
            }

            log.debug(`Took ${new Date().getTime() - nowMs}ms to import data`);
        } else {
            log.error(`Unchecked version: ${data.version}`);
        }
    }

    public static start(parameters: PlaybackOptions): void {
        if (this._core == null) {
            throw `Cannot start playback, core is null. Did you forget to call Playback.setCore()?`;
        }

        // Instant playback
        if (parameters.speed <= 0) {
            log.debug(`Doing instant playback`);

            const nowMs: number = new Date().getTime();

            const timestamps: number[] = Playback._parsed.map((iter: any) => {
                const ts: number | string = iter.payload.timestamp;
                if (typeof(ts) == "number") { // An old bugged version of expo uses numbers not strings
                    return ts;
                }

                if (ts.length == 10) {
                    return Number.parseInt(ts) * 1000;
                } else if (ts.length == 13) { // Expo exports with the MS part, Census does not
                    return Number.parseInt(ts);
                } else {
                    log.warn(`Unchecked length of timestamp: ${ts.length} '${ts}'`);
                    throw ``;
                }
            });

            this._core.tracking.startTime = Math.min(...timestamps);
            this._core.tracking.endTime = Math.max(...timestamps);

            for (const ev of Playback._events) {
                this._core.processMessage(ev, true);
            }
            this._core.stop();

            log.debug(`Took ${new Date().getTime() - nowMs}ms to process data`);
        } else {
            const start: number = Math.min(...Playback._parsed.map(iter => (Number.parseInt(iter.payload.timestamp) * 1000) || 0));
            const end: number = Math.max(...Playback._parsed.map(iter => (Number.parseInt(iter.payload.timestamp) * 1000) || 0));

            this._core.tracking.startTime = start;

            const slots: Map<number, object[]> = new Map();

            for (const ev of Playback._parsed) {
                const time: number = Number.parseInt(ev.payload.timestamp) * 1000;
                if (Number.isNaN(time)) {
                    log.warn(`Failed to get a timestamp from ${ev}`);
                }

                const diff: number = time - start;

                if (!slots.has(diff)) {
                    slots.set(diff, []);
                }

                slots.get(diff)!.push(ev);
            }

            let index: number = 0;

            const intervalID = setInterval(() => {
                if (!slots.has(index)) {
                    log.debug(`Index ${index} has no events, skipping`);
                } else {
                    const events: object[] = slots.get(index)!;
                    for (const ev of events) {
                        this._core!.processMessage(JSON.stringify(ev), true);
                    }
                }

                index += 1000;
                if (index > end) {
                    log.debug(`Ended on index ${index}`);
                    clearInterval(intervalID);
                }
            }, 1000 * parameters.speed);
        }
    }
}