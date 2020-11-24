import { ApiResponse } from "./ApiWrapper";
import CensusAPI from "./CensusAPI";

export class CharacterItem {
    public characterID: string = "";
    public itemID: string = "";
    public accountLevel: boolean = false;
}

export class CharacterItemAPI {

    public static parse(elem: any): CharacterItem {
        return {
            characterID: elem.character_id,
            itemID: elem.item_id,
            accountLevel: !!elem.account_level
        };
    }

    public static getByCharacterID(charID: string): ApiResponse<CharacterItem[]> {
        const response: ApiResponse<CharacterItem[]> = new ApiResponse();

        const request: ApiResponse = CensusAPI.get(`characters_item?character_id=${charID}`);

        request.ok((data: any) => {
            const arr: CharacterItem[] = [];
            for (const elem of data.characters_item_list) {

            }

        });

        return response;
    }

}