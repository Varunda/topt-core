
export type SubscribeEvents = "GainExperience" | "AchievementEarned" | "Death" | "FacilityControl" | "ItemAdded" | "VehicleDestroy" | "PlayerLogin" | "PlayerLogout" | "PlayerFacilityCapture" | "PlayerFacilityDefend";

export class SubscribeOptions {

    public characters: string[] = [];

    public events: (SubscribeEvents | string)[] = [];

    public socket: string = "logistics";

    public worlds: string[] = [];

    public charactersWorldAnd: boolean = false;

    public toObject(): object {
        let obj: any = {
            action: "subscribe",
            service: "event"
        };

        if (this.characters.length > 0) {
            obj.characters = this.characters;
        }

        if (this.worlds.length > 0) {
            obj.worlds = this.worlds;
        }

        if (this.charactersWorldAnd == true) {
            obj.logicalAndCharactersWithWorlds = true;
        }

        return obj;
    }

}