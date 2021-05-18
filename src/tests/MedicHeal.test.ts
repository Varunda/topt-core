import logger from "loglevel";
import * as prefix from "loglevel-plugin-prefix";

beforeAll(() => {
    prefix.reg(logger);

    const a = logger.getLoggers();
    for (const b in a) {
        if (b == "Core.Squad") {
            continue;
        }
        a[b].trace = console.log;
        a[b].enableAll();
        prefix.apply(a[b], {
            format(level, name, timestamp) {
                return `${name} ${level}>`;
            }
        });
    }
});

import * as fs from "fs";
import Core, { ApiResponse, CharacterEventAPI, OutfitAPI, Character, Playback, PlaybackOptions } from "../core/index";

test("Deso", () => {
    jest.setTimeout(1000000);
    const prom = new Promise<void>(async (resolve, reject) => {
        const core: Core = new Core("asdf", "1");

        const r18members: Character[] = await OutfitAPI.getCharactersByTag("R18");
        console.log(`Loaded ${r18members.length} r18 members`);

        const OOmembers: Character[] = await OutfitAPI.getCharactersByTag("0O");
        console.log(`Loaded ${OOmembers.length} 00 members`);

        const set: Set<string> = new Set();

        const when: Map<string, number> = new Map();

        for (const member of OOmembers) {
            const kills = await CharacterEventAPI.getKillsByCharacterID(member.ID);

            console.log(`Got ${kills.length} kills for ${member.name}`);

            for (const kill of kills) {
                if (kill.zoneID != "590185") {
                    continue;
                }

                const r18 = r18members.find(iter => iter.ID == kill.characterID);
                if (r18) {
                    set.add(r18.name);

                    if (when.has(r18.name) == false) {
                        when.set(r18.name, kill.timestamp);
                    }

                    const entry: number = when.get(r18.name)!;
                    if (entry > kill.timestamp) {
                        when.set(r18.name, kill.timestamp);
                    }
                }
            }

            console.log(`${set.size}: ${Array.from(set).join(" ")}`);
        }

        console.log(`${Array.from(when.entries()).map(iter => `${iter[0]} => ${new Date(iter[1])}`).join("\n")}`);
        resolve();

    });

    return prom;

});

test("MedicHealStreak", () => {
    /*
    const promise = new Promise<void>((resolve, reject) => {
        const core: Core = new Core("asdf", "1");
        core.connect().ok(() => {
            Playback.setCore(core);

            fs.readFile("./src/tests/test-data.json", async (err, data: Buffer) => {
                await Playback.loadFile(data.toString());
                Playback.start({
                    speed: 0
                });

                expect(true);

                core.disconnect();
                return resolve();
            });
        });
    });

    return promise
    */
   return true;
});