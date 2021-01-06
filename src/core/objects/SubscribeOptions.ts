
export type SubscribeEvents = "GainExperience" | "AchievementEarned" | "Death" | "FacilityControl" | "ItemAdded" | "VehicleDestroy" | "PlayerLogin" | "PlayerLogout" | "PlayerFacilityCapture" | "PlayerFacilityDefend";

export class SubscribeOptions {

    public characters?: string[] = [];

    public events?: (SubscribeEvents | string)[] = [];

    public socket?: string = "added";

    public worlds?: string[] = [];

    public charactersWorldAnd?: boolean = false;

}