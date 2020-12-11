import { TEvent } from "../events/index";
import { BaseFightEncounter } from "./BaseFightEncounter";
import { BaseFightEntry } from "./BaseFightEntry";
import { BaseStatus } from "./BaseStatus";

export class BaseOverview {

    public facilityID: string = "";

    public facilityName: string = "";

    public facilityType: string = "";

    public fightDuration: number = 0;

    public participants: BaseFightEntry[] = [];

    public events: TEvent[] = [];

    public encounters: BaseFightEncounter[] = [];

    public enc: BaseStatus[] = [];

    public top = {
        kills: ["", 0] as [string, number],
        heals: ["", 0] as [string, number],
        revives: ["", 0] as [string, number],
        resupplies: ["", 0] as [string, number],
    }

}