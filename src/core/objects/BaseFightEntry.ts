import { TEvent } from "../events/index";

export class BaseFightEntry {

    public charID: string = "";

    public name: string = "";
    
    public score: number = 0;

    public kills: string[] = [];

    public deaths: string[] = [];

    public events: TEvent[] = [];

}