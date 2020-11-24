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
import Core, { ApiResponse, Playback, PlaybackOptions } from "../core/index";

test("MedicHealStreak", () => {
    const promise = new Promise((resolve, reject) => {
        const core: Core = new Core("asdf", "1");
        core.connect().ok(() => {
            Playback.setCore(core);

            fs.readFile("./src/tests/test-data.json", (err, data: Buffer) => {
                Playback.loadFile(data.toString()).ok(() => {
                    Playback.start({
                        speed: 0
                    });

                    expect(true);

                    core.disconnect();
                    resolve();
                });
            });
        });
    });

    return promise;
});