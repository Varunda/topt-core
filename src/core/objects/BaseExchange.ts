
export class BaseExchange {

    /**
     * ID of the facility that was captured
     */
    facilityID: string = "";

    /**
     * ID of the zone the capture took place
     */
    zoneID: string = "";

    /**
     * Timestamp of when the capture too place
     */
    timestamp: Date = new Date();

    /**
     * How many ms the base was held before it was captured
     */
    timeHeld: number = 0;

    /**
     * ID of the faction that captured the base
     */
    factionID: string = "";

    /**
     * ID of the outfit that captured the base
     */
    outfitID: string = "";

    /**
     * ID of the previous faction that held the base before it was captured
     */
    previousFaction: string = "";

}