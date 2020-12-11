

export class BaseFightEncounter {

    /**
     * In milliseconds
     */
    public timestamp: number = 0;

    public sourceID: string = "";

    public targetID: string = "";

    public outcome: "kill" | "death" | "revive" | "unknown" = "unknown";

}