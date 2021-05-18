import { ApiResponse, ResponseContent } from "./ApiWrapper";
import { CensusAPI } from "./CensusAPI";

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

    public static async getByCharacterID(charID: string): Promise<CharacterItem[]> {
        const url: string = `characters_item?character_id=${charID}`;

        return new Promise<CharacterItem[]>(async (resolve, reject) => {
            try {
                const request: ResponseContent<any> = await CensusAPI.get(url).promise();

                if (request.code == 200) {
                    if (request.data.returned != 1) {
                    }

                    const arr: CharacterItem[] = [];
                    for (const elem of request.data.characters_item_list) {
                        arr.push(CharacterItemAPI.parse(elem));
                    }

                    return resolve(arr);
                } else {
                    return reject(`API call failed>\n\t${url}\n\t${request.code} ${request.data}`);
                }
            } catch (err: any) {
                return reject(err);
            }
        });
    }

}