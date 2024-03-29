import { WinterMetric } from "./WinterMetric";

import { TrackedPlayer } from "../objects/TrackedPlayer";

export class WinterReport {
    public start: Date = new Date();
    public end: Date = new Date();

    public essential: WinterMetric[] = [];
    public fun: WinterMetric[] = [];

    public players: TrackedPlayer[] = [];
}