
/**
 * What type of NPC is being tracked
 */
export type TrackedNpcType = "router" | "sundy" | "unknown";

/**
 * An NPC that's being tracked
 */
export class TrackedNpc {
    /**
     * ID of the NPC
     */
    public ID: string = "";

    /**
     * What type of NPC is being tracked
     */
    public type: TrackedNpcType = "unknown";

    /**
     * Char ID of the owner of the NPC
     */
    public ownerID: string = "";

    /**
     * MS timestamp of when the NPC was created
     */
    public pulledAt: number = 0;

    /**
     * MS timestamp of when the first spawn from the NPC was done
     */
    public firstSpawnAt: number | null = null;

    /**
     * MS timestamp of when the NPC was destroyed
     */
    public destroyedAt: number | null = null;

    /**
     * Char ID of the character that destroyed the NPC
     */
    public destroyedByID: string | null = null;

    /**
     * MS timestamps of when this NPC was used as a spawn
     */
    public spawns: number[] = [];

    /**
     * How many spawns the NPC created
     */
    public count: number = 0;
}