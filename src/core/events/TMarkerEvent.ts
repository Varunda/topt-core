
/**
 * Marker events mark some sort of event that the API cannot generate. For example, when a fight for a base starts,
 *      a marker can be used to indicate that this is the start of an event
 */
export type TMarkerEvent = {

    /**
     * Type of event
     */
    type: "marker";

    /**
     * Included for compatibility, not useful 
     */
    sourceID: string;

    /**
     * Timestamp in UTC milliseconds of when the marker was placed
     */
    timestamp: number;

    /**
     * What was marked
     */
    mark: string;

}