import * as log from "loglevel";
import * as prefix from "loglevel-plugin-prefix";

prefix.reg(log);

export class Logger {

    public static loggers: Map<string, log.Logger> = new Map();

    /**
     * Get a logger by it's name, creating a new one in the process if needed
     * 
     * @param name Name of the logger to get
     */
    public static getLogger(name: string): log.Logger {
        if (this.loggers.has(name) == false) {
            const logger: log.Logger = log.getLogger(name);

            logger.setLevel("info");

            prefix.apply(logger, {
                format(level, name, timestamp) {
                    return `[${level}] ${name}>`;
                }
            })
            this.loggers.set(name, logger);
        }
        return this.loggers.get(name)!;
    }

    /**
     * Get the names of all loggers used
     */
    public static getLoggerNames(): string[] {
        return Array.from(this.loggers.keys());
    }

}