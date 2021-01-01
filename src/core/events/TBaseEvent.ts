

export type TBaseEvent = {

    type: "base";

    sourceID: string;

    facilityID: string;

    zoneID: string;

    timestamp: number;

    factionID: string;

    timeHeld: number;

    previousFactionID: string;

    outfitID: string;

}