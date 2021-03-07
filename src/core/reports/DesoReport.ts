import { TEvent, TCaptureEvent, TDefendEvent } from "../events/index";
import { TrackedPlayer, TrackedNpcType, TrackedNpc } from "../objects/index";

import EventReporter, {
    Breakdown, BreakdownArray, BreakdownTimeslot,
    statMapToBreakdown, defaultVehicleMapper,
    OutfitVersusBreakdown, ClassCollection, classCollectionNumber, BaseCapture,
    defaultCharacterMapper, defaultCharacterSortField, defaultWeaponMapper
} from "../EventReporter";
import { IndividualReporter, Playtime, TimeTracking } from "../InvididualGenerator";
import { Facility, FacilityAPI } from "../census/FacilityAPI";
import { PsLoadout, PsLoadouts } from "../census/PsLoadout";
import { Character, CharacterAPI } from "../census/CharacterAPI";
import { VehicleAPI, VehicleTypes, Vehicle, Vehicles } from "../census/VehicleAPI";
import StatMap from "../StatMap";
import { PsEventType, PsEvent, PsEvents } from "../PsEvent";

import { Logger } from "../Loggers";
const log = Logger.getLogger("DesoReport");

export class VehicleVersusEntry {
    public name: string = "";
    public kills: number = 0;
    public deaths: number = 0;
}

export class VehicleVersus {
    public flash: VehicleVersusEntry = { name: "Flash", kills: 0, deaths: 0 };
    public sundy: VehicleVersusEntry = { name: "Sunderer", kills: 0, deaths: 0 };
    public lightning: VehicleVersusEntry = { name: "Lightning", kills: 0, deaths: 0 };
    public magrider: VehicleVersusEntry = { name: "Magrider", kills: 0, deaths: 0 };
    public vanguard: VehicleVersusEntry = { name: "Vanguard", kills: 0, deaths: 0 };
    public prowler: VehicleVersusEntry = { name: "Prowler", kills: 0, deaths: 0 };
    public scythe: VehicleVersusEntry = { name: "Scythe", kills: 0, deaths: 0 };
    public reaver: VehicleVersusEntry = { name: "Reaver", kills: 0, deaths: 0 };
    public mossie: VehicleVersusEntry = { name: "Mosquito", kills: 0, deaths: 0 };
    public lib: VehicleVersusEntry = { name: "Liberator", kills: 0, deaths: 0 };
    public galaxy: VehicleVersusEntry = { name: "Galaxy", kills: 0, deaths: 0 };
    public harasser: VehicleVersusEntry = { name: "Harasser", kills: 0, deaths: 0 };
    public valk: VehicleVersusEntry = { name: "Valkyrie", kills: 0, deaths: 0 };
    public ant: VehicleVersusEntry = { name: "ANT", kills: 0, deaths: 0 };
    public colossus: VehicleVersusEntry = { name: "Colussus", kills: 0, deaths: 0 };
}

export class VehicleTable {
    public flash: VehicleVersus = new VehicleVersus();
    public sundy: VehicleVersus = new VehicleVersus();
    public lightning: VehicleVersus = new VehicleVersus();
    public magrider: VehicleVersus = new VehicleVersus();
    public vanguard: VehicleVersus = new VehicleVersus();
    public prowler: VehicleVersus = new VehicleVersus();
    public scythe: VehicleVersus = new VehicleVersus();
    public reaver: VehicleVersus = new VehicleVersus();
    public mossie: VehicleVersus = new VehicleVersus();
    public lib: VehicleVersus = new VehicleVersus();
    public galaxy: VehicleVersus = new VehicleVersus();
    public harasser: VehicleVersus = new VehicleVersus();
    public valk: VehicleVersus = new VehicleVersus();
    public ant: VehicleVersus = new VehicleVersus();
    public colussus: VehicleVersus = new VehicleVersus();
}

export class DesoReport {

    public startTime: Date = new Date();
    public endTime: Date = new Date();

    public sundies: TrackedNpc[] = [];
    public routers: TrackedNpc[] = [];

    public spawnType: BreakdownArray = new BreakdownArray();
    public spawnProviders: BreakdownArray = new BreakdownArray();

    public versus: VehicleTable = new VehicleTable();

    public baseCaptures: BaseCapture[] = [];

    public classStats: Map<string, ClassCollection<number>> = new Map();

    public players: ({ name: string } & Playtime)[] = [];

    public vehicleKills = {
        type: new BreakdownArray() as BreakdownArray,
        players: new BreakdownArray() as BreakdownArray
    };

    public vehicleDeaths = {
        type: new BreakdownArray() as BreakdownArray,
        players: new BreakdownArray() as BreakdownArray
    };
}

export class DesoReportParameters {
    public events: TEvent[] = [];
    public players: TrackedPlayer[] = [];
    public npcs: TrackedNpc[] = [];
    public tracking: TimeTracking = new TimeTracking();
}

export class DesoReportGenerator {

    public static async generate(parameters: DesoReportParameters): Promise<DesoReport> {
        const report: DesoReport = new DesoReport();
        report.startTime = new Date(parameters.tracking.startTime);
        report.endTime = new Date(parameters.tracking.endTime);

        const npcCharIDs: string[] = parameters.npcs.filter(iter => iter.destroyedByID != null).map(iter => iter.destroyedByID!);
        npcCharIDs.push(...parameters.npcs.map(iter => iter.ownerID));

        const npcChars: Character[] = await CharacterAPI.getByIDs(npcCharIDs);

        for (const iter of parameters.npcs) {
            const npc: TrackedNpc = {...iter};
            npc.destroyedByID = npcChars.find(iter => iter.ID == npc.destroyedByID)?.name ?? ``;
            npc.ownerID = npcChars.find(iter => iter.ID == npc.ownerID)?.name ?? ``;

            if (npc.type == "sundy") {
                report.sundies.push(npc);
            } else if (npc.type == "router") {
                report.routers.push(npc);
            }
        }
        report.sundies.sort((a, b) => a.pulledAt - b.pulledAt);
        report.routers.sort((a, b) => a.pulledAt - b.pulledAt);

        // Track how many headshots each class got
        const headshots: ClassCollection<number> = classCollectionNumber();
        for (const ev of parameters.events) {
            if (ev.type != "kill" || ev.isHeadshot == false) {
                continue;
            }

            const loadout: PsLoadout | undefined = PsLoadouts.get(ev.loadoutID);
            if (loadout == undefined) { continue; }

            if (loadout.type == "infil") { ++headshots.infil; }
            else if (loadout.type == "lightAssault") { ++headshots.lightAssault; }
            else if (loadout.type == "medic") { ++headshots.medic; }
            else if (loadout.type == "engineer") { ++headshots.engineer; }
            else if (loadout.type == "heavy") { ++headshots.heavy; }
            else if (loadout.type == "max") { ++headshots.max; }

            ++headshots.total;
        }
        report.classStats.set("Headshot", headshots);

        for (const ev of parameters.events) {
            let statName: string = "Other";

            if (ev.type == "kill") {
                statName = "Kill";
            } else if (ev.type == "death") {
                statName = (ev.revived == true) ? "Revived" : "Death";
            } else if (ev.type == "exp") {
                const event: PsEvent | undefined = PsEvents.get(ev.expID);
                if (event != undefined) {
                    if (event.track == false) { continue; }
                    statName = event.name;
                }
            } else {
                continue;
            }

            if (!report.classStats.has(statName)) {
                //log.debug(`Added stats for '${statName}'`);
                report.classStats.set(statName, classCollectionNumber());
            }

            const classCollection: ClassCollection<number> = report.classStats.get(statName)!;
            ++classCollection.total;

            const loadout: PsLoadout | undefined = PsLoadouts.get(ev.loadoutID);
            if (loadout == undefined) { continue; }

            if (loadout.type == "infil") { ++classCollection.infil; }
            else if (loadout.type == "lightAssault") { ++classCollection.lightAssault; }
            else if (loadout.type == "medic") { ++classCollection.medic; }
            else if (loadout.type == "engineer") { ++classCollection.engineer; } 
            else if (loadout.type == "heavy") { ++classCollection.heavy; } 
            else if (loadout.type == "max") { ++classCollection.max; }
        }

        parameters.players.forEach((player: TrackedPlayer) => {
            if (player.events.length == 0) { return; }

            const playtime = IndividualReporter.classUsage({
                player: player,
                events: [],
                routers: [],
                tracking: parameters.tracking
            });

            report.players.push({
                name: `${(player.outfitTag != '' ? `[${player.outfitTag}] ` : '')}${player.name}`,
                ...playtime 
            });
        });

        report.spawnType = this.getSpawnTypeBreakdown(parameters);
        report.spawnProviders = await this.getSpawnProviderBreakdown(parameters);

        report.vehicleKills.type = await this.getVehicleKills(parameters);
        report.vehicleKills.players = await this.getPlayerVehicleKills(parameters);

        report.vehicleDeaths.type = await this.getVehicleDeaths(parameters);
        report.vehicleDeaths.players = await this.getPlayerVehicleDeaths(parameters);

        report.versus = this.getVehicleVersus(parameters);

        return report;
    }

    private static getVehicleVersus(parameters: DesoReportParameters): VehicleTable {
        const table: VehicleTable = new VehicleTable();

        const players: string[] = parameters.players.map(iter => iter.characterID);

        for (const ev of parameters.events) {
            if (ev.type != "vehicle") {
                continue;
            }
            if (ev.sourceID == ev.targetID) {
                continue;
            }

            const isUs: boolean = players.indexOf(ev.sourceID) > -1;
            let entry: VehicleVersus | null = null;

            switch (ev.attackerVehicleID) {
                case "0": break;
                case Vehicles.flash: entry = table.flash; break;
                case Vehicles.sunderer: entry = table.sundy; break;
                case Vehicles.lightning: entry = table.lightning; break;
                case Vehicles.magrider: entry = table.magrider; break;
                case Vehicles.vanguard: entry = table.vanguard; break;
                case Vehicles.prowler: entry = table.prowler; break;
                case Vehicles.scythe: entry = table.scythe; break;
                case Vehicles.reaver: entry = table.reaver; break;
                case Vehicles.mosquito: entry = table.mossie; break;
                case Vehicles.liberator: entry = table.lib; break;
                case Vehicles.galaxy: entry = table.galaxy; break;
                case Vehicles.harasser: entry = table.harasser; break;
                case Vehicles.valkyrie: entry = table.valk; break;
                case Vehicles.ant: entry = table.ant; break;
                case "2007": entry = table.colussus; break;
                default:
                    log.warn(`Unchecked attackerVehicleID ${ev.attackerVehicleID}`);
                    break;
            }

            if (entry == null) {
                continue;
            }

            if (ev.vehicleID == Vehicles.flash) {
                if (isUs == true) { ++entry.flash.kills } else { ++entry.flash.deaths; }
            } else if (ev.vehicleID == Vehicles.sunderer) {
                if (isUs == true) { ++entry.sundy.kills } else { ++entry.sundy.deaths; }
            } else if (ev.vehicleID == Vehicles.lightning)  {
                if (isUs == true) { ++entry.lightning.kills } else { ++entry.lightning.deaths; }
            } else if (ev.vehicleID == Vehicles.magrider) {
                if (isUs == true) { ++entry.magrider.kills } else { ++entry.magrider.deaths; }
            } else if (ev.vehicleID == Vehicles.vanguard) {
                if (isUs == true) { ++entry.vanguard.kills } else { ++entry.vanguard.deaths; }
            } else if (ev.vehicleID == Vehicles.prowler) {
                if (isUs == true) { ++entry.prowler.kills } else { ++entry.prowler.deaths; }
            } else if (ev.vehicleID == Vehicles.scythe) {
                if (isUs == true) { ++entry.scythe.kills } else { ++entry.scythe.deaths; }
            } else if (ev.vehicleID == Vehicles.reaver) {
                if (isUs == true) { ++entry.reaver.kills } else { ++entry.reaver.deaths; }
            } else if (ev.vehicleID == Vehicles.mosquito) {
                if (isUs == true) { ++entry.mossie.kills } else { ++entry.mossie.deaths; }
            } else if (ev.vehicleID == Vehicles.liberator) {
                if (isUs == true) { ++entry.lib.kills } else { ++entry.lib.deaths; }
            } else if (ev.vehicleID == Vehicles.galaxy) {
                if (isUs == true) { ++entry.galaxy.kills } else { ++entry.galaxy.deaths; }
            } else if (ev.vehicleID == Vehicles.harasser) {
                if (isUs == true) { ++entry.harasser.kills } else { ++entry.harasser.deaths; }
            } else if (ev.vehicleID == Vehicles.valkyrie) {
                if (isUs == true) { ++entry.valk.kills } else { ++entry.valk.deaths; }
            } else if (ev.vehicleID == Vehicles.ant) {
                if (isUs == true) { ++entry.ant.kills } else { ++entry.ant.deaths; }
            } else if (ev.vehicleID == "2007") {
                if (isUs == true) { ++entry.colossus.kills } else { ++entry.colossus.deaths; }
            } else {
                log.warn(`Unchecked vehicleID: ${ev.vehicleID}`);
            }

        }

        return table;
    }

    private static async getVehicleDeaths(parameters: DesoReportParameters): Promise<BreakdownArray> {
        const vehKills: StatMap = new StatMap();

        for (const event of parameters.events) {
            if (event.type == "vehicle"
                && VehicleTypes.tracked.indexOf(event.vehicleID) > -1
                && event.weaponID != "0"
                && parameters.players.find(iter => iter.characterID == event.targetID) != null
            ) {

                vehKills.increment(event.vehicleID);
            }
        }

        return statMapToBreakdown(vehKills,
            VehicleAPI.getAll,
            (elem: Vehicle, ID: string) => elem.ID == ID,
            defaultVehicleMapper
        );
    }

    private static async getPlayerVehicleDeaths(parameters: DesoReportParameters): Promise<BreakdownArray> {
        const vehKills: StatMap = new StatMap();

        for (const event of parameters.events) {
            if (event.type == "vehicle"
                && VehicleTypes.tracked.indexOf(event.vehicleID) > -1
                && event.weaponID != "0"
                && parameters.players.find(iter => iter.characterID == event.targetID) != null
            ) {

                vehKills.increment(event.sourceID);
            }
        }

        return statMapToBreakdown(vehKills,
            CharacterAPI.getByIDs,
            (elem: Character, charID: string) => elem.ID == charID,
            defaultCharacterMapper,
            defaultCharacterSortField
        );
    }

    private static async getVehicleKills(parameters: DesoReportParameters): Promise<BreakdownArray> {
        const vehKills: StatMap = new StatMap();

        for (const event of parameters.events) {
            if (event.type == "vehicle"
                && VehicleTypes.tracked.indexOf(event.vehicleID) > -1
                && event.weaponID != "0"
                && parameters.players.find(iter => iter.characterID == event.sourceID) != null
            ) {

                vehKills.increment(event.vehicleID);
            }
        }

        return statMapToBreakdown(vehKills,
            VehicleAPI.getAll,
            (elem: Vehicle, ID: string) => elem.ID == ID,
            defaultVehicleMapper
        );
    }

    private static async getPlayerVehicleKills(parameters: DesoReportParameters): Promise<BreakdownArray> {
        const vehKills: StatMap = new StatMap();

        for (const event of parameters.events) {
            if (event.type == "vehicle"
                && VehicleTypes.tracked.indexOf(event.vehicleID) > -1
                && event.weaponID != "0"
                && parameters.players.find(iter => iter.characterID == event.sourceID) != null
            ) {

                vehKills.increment(event.sourceID);
            }
        }

        return statMapToBreakdown(vehKills,
            CharacterAPI.getByIDs,
            (elem: Character, charID: string) => elem.ID == charID,
            defaultCharacterMapper,
            defaultCharacterSortField
        );
    }

    private static async getSpawnProviderBreakdown(parameters: DesoReportParameters): Promise<BreakdownArray> {
        const arr: BreakdownArray = new BreakdownArray();

        const map: StatMap = new StatMap();

        for (const ev of parameters.events) {
            if (ev.type != "exp") {
                continue;
            }

            if (ev.expID == PsEvent.squadSpawn) {
                map.increment(ev.sourceID);
            } else if (ev.expID == PsEvent.constructionSpawn) {
                map.increment(ev.sourceID);
            } else if (ev.expID == PsEvent.sundySpawn) {
                map.increment(ev.sourceID);
            } else if (ev.expID == PsEvent.galaxySpawn) {
                map.increment(ev.sourceID);
            }
        }

        const charIDs: string[] = Array.from(map.getMap().keys());

        const chars: Character[] = await CharacterAPI.getByIDs(charIDs);

        map.getMap().forEach((count: number, charID: string) => {
            const breakdown: Breakdown = new Breakdown();
            breakdown.display = chars.find(iter => iter.ID == charID)?.name ?? `Bad ID ${charID}`;
            breakdown.amount = count;

            arr.data.push(breakdown);
            arr.total += count;
        });

        arr.data.sort((a, b) => {
            return b.amount - a.amount
                || b.display.localeCompare(a.display);
        });

        return arr;
    }

    private static getSpawnTypeBreakdown(parameters: DesoReportParameters): BreakdownArray {
        const arr: BreakdownArray = new BreakdownArray();

        const sundy: Breakdown = new Breakdown();
        sundy.display = "Sunderer spawns";

        const router: Breakdown = new Breakdown();
        router.display = "Router spawns";

        const beacon: Breakdown = new Breakdown();
        beacon.display = "Beacon spawns";

        const squad: Breakdown = new Breakdown();
        squad.display = "Squad vehicle spawns";

        for (const ev of parameters.events) {
            if (ev.type != "exp") {
                continue;
            }

            if (ev.expID == PsEvent.squadSpawn) {
                ++beacon.amount;
            } else if (ev.expID == PsEvent.constructionSpawn) {
                ++router.amount;
            } else if (ev.expID == PsEvent.sundySpawn) {
                ++sundy.amount;
            } else if (ev.expID == "355") {
                ++squad.amount;
            }
        }

        arr.total = sundy.amount + router.amount + beacon.amount + squad.amount;
        arr.data.push(sundy, router, beacon, squad);

        return arr;
    }

}