import { ApiResponse } from "../core/index";
import * as axios from "axios";

test("ApiResponse.Empty.200", () => {
    const response: ApiResponse = new ApiResponse();

    let flag: boolean = false;
    response.ok(() => {
        flag = true;
    });

    response.resolveOk();

    expect(flag = true);
    expect(response.status == 200);
});

test("ApiResponse.Axios.200", () => {
    const promise: Promise<void> = new Promise<void>((resolve, reject) => {
        const response: ApiResponse = new ApiResponse(
            axios.default.request({
                url: `https://census.daaybreakgames.com/s:asdf/get/ps2:v2`,
                validateStatus: null
            })
        )

        response.ok(() => {
            resolve();
        }).always(() => {
            if (response.status != 200) {
                reject();
            }
        });
    });

    return promise;
});