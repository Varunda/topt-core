/**
 * Occurs when a player participates in the defense of a base
 */
export type TDefendEvent = {

    /**
     * Type of event
     */
    type: "defend";

    /**
     * Character ID of the character that produced the TEvent
     */
    sourceID: string;

    /**
     * Timestamp in UTC milliseconds of when this TEvent was produced
     */
    timestamp: number;

    /**
     * ID of the zone (continent) the source was on when the event was produced
     */
    zoneID: string;

    /**
     * ID of the outfit the source is a part of. Is "0" if no outfit
     */
    outfitID: string;

    /**
     * ID of the facility that was defended
     */
    facilityID: string;

}