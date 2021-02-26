import * as axios from "axios";

import { Logger } from "../Loggers";
const log = Logger.getLogger("ApiWrapper");

export type ResponseContent<T> =
    { code: 200, data: T } // OK
    | { code: 201, data: string | number } // Created
    | { code: 204, data: null } // No content
    | { code: 400, data: string } // Bad request
    | { code: 401, data: null } // Unauthorized
    | { code: 403, data: string } // Forbidden
    | { code: 404, data: string } // Not found
    | { code: 413, data: string } // Payload too large
    | { code: 500, data: string } // Internal server error
    | { code: 501, data: string }; // Not implemented

export interface ErrorDetails {
    type: string;
    title: string;
    detail: string;
    instance: string;
}

// I'd like a way to pick the possible codes if more are added down the road, but I can't
// figure out the syntax.
// Using Pick produces:
//      { code: 200 | 201 | ... | 500 | 501 }, not 200 | 201 | ... | 500 | 501 like I'd want
export type ResponseCodes = 200 | 201 | 204 | 400 | 401 | 403 | 404 | 413 | 500 | 501;

type ApiResponseCallback = (data: any) => void;

/**
 * Different states a step can have
 */
export type StepState = "done" | "working" | "errored";

// Default to void as undefined is assignable to void. Would prefer to use never, but there is
// no default value for never, and never cannot be assigned
/**
 * Promise-ish class that is returned from an API request. Use the callback functions .ok(), etc. to handle
 * the result of the request. Unhandles responses will throw an exception
 */
export class ApiResponse<T = void> {

    /**
     * Array of possible status codes from a request
     */
    public static codes: ResponseCodes[] = [200, 201, 204, 400, 401, 403, 404, 413, 500, 501];

    /**
     * Status code returned from the API endpoint
     */
    public status: number = 0;

    /**
     * Data returned from the API endpoint
     */
    public data: T | string | number | null = null;

    /**
     * Callbacks to call when specific status code response is resolved from the API call.
     * If no callbacks are defined for a status code an exception is thrown
     */
    private _callbacks: Map<number, ApiResponseCallback[]> = new Map([ ]);

    /**
     * Has this API response already been resolved? If so, any additional callbacks added after the
     * constructor is called (due to the late timeout) will immediately be ran
     */
    private _resolved: boolean = false;

    public isResolved(): boolean { return this._resolved; }

    public _steps: Map<string, StepState> | null = null;

    /**
     * Statically resolve an ApiResponse, similar to how Promise.resolve works. This is useful when creating
     *      an ApiResponse from data that already exists
     *
     * @param status    Status code to resolve the response with
     * @param data      Data to resolve the response with
     * 
     * @returns An ApiResponse that has been resolved with the parameters passed
     */
    public static resolve<T = void>(content: ResponseContent<T>): ApiResponse<T> {
        const response: ApiResponse<T> = new ApiResponse(null, null);
        response.resolve(content);

        return response;
    }

    /**
     * Constructor for an ApiResponse
     * 
     * @param responseData  Request that is being performed, and will produce a response
     * @param reader        Function that will read the data from a successful request into the type param T
     */
    public constructor(responseData: Promise<axios.AxiosResponse> | null = null, reader: ((iter: any) => T) | null = null) {
        if (responseData == null) {
            return;
        }

        responseData.then((data: axios.AxiosResponse<any>) => {
            let localStatus: number = data.status;
            let localData: any = data.data;

            // Handle errors from the API, which aren't request errors
            if (localStatus == 200 && reader != null) {
                if (localData.error != undefined || localData.errorCode != undefined || localData == "") {
                    localStatus = 500;
                }
            }

            // TODO: Get rid of this any
            // I need to figure out a way to remove this any. Because the type of each element in codes is
            //      a ResponseCode, not a number, and localStatus is a number, TS assumes that this can't be possible,
            //      when in fact it is
            if (ApiResponse.codes.indexOf(localStatus as any) == -1) {
                throw `Unhandle status code: ${localStatus}`;
            }

            // TODO: AHHHH, it's an any!
            // I need to find a better way to do this. Because the type of data is not known, Typescript rightly
            //      assumes that code could be 204 and data is a string, which doesn't meet the requirements of a
            //      ResponseContent. Maybe use a switch on localStatus?
            this.resolve({ code: localStatus as ResponseCodes, data: localData } as any);
        }).catch((error: any) => {
            throw `Don't expect this: ${error}`;
        });
    }

    /**
     * Resolve ApiResponse with specific data, calling the callback setup and setting it as resolved
     * 
     * @param status    Status code the response will be resolved with
     * @param data      Data the response will be resolved with
     */
    public resolve(content: ResponseContent<T>): void {
        if (this._resolved == true) {
            throw `This response has already been resolved`;
        }

        this.status = content.code;
        this.data = content.data;

        let callbacks: ApiResponseCallback[] = this._callbacks.get(this.status) || [];

        for (const callback of callbacks) {
            callback(content.data);
        }

        this._resolved = true;
    }

    /**
     * Resolving with an Ok is done a lot, this just saves some typing
     * 
     * @param data Data to resolve this response with
     */
    public resolveOk(data: T): void {
        if (this._steps != null) {
            const steps: string[] = this.getSteps();
            let notDone: string[] = [];

            for (const step of steps) {
                if (this.getStepState(step) != "done") {
                    notDone.push(step);
                }
            }

            if (notDone.length > 0) {
                log.warn(`The following steps are not done: [${notDone.join(", ")}]`);
            }
        }
        this.resolve({ code: 200, data: data });
    }

    /**
     * Add a new step to be tracked
     * 
     * @param step Step being completed
     */
    public addStep(step: string): this {
        if (this._steps == null) {
            this._steps = new Map<string, StepState>();
        }

        if (this._steps.has(step)) {
            log.warn(`Duplicate step '${step}' in ApiResponse. Current steps: ${Array.from(this._steps.keys()).join(", ")}`);
        }

        this._steps.set(step, "working");

        return this;
    }

    /**
     * Update the state a step has
     * 
     * @param step  Step to update
     * @param state New state of the step being updated
     */
    public updateStep(step: string, state: StepState): void {
        if (this._steps == null) {
            log.warn(`Cannot update setp '${step}' to ${state}: No steps have been created`);
            return;
        }

        if (!this._steps.has(step)) {
            log.warn(`Cannot update step '${step}' to ${state}: Step not found`);
        }

        this._steps.set(step, state);
    }

    /**
     * Shortcut method to mark a step as done
     * 
     * @param step Step to mark as done
     */
    public finishStep(step: string): void {
        this.updateStep(step, "done");
    }

    /**
     * Get the steps in this ApiResponse
     */
    public getSteps(): string[] {
        if (this._steps == null) {
            throw `No steps defined. Cannot get steps`;
        }

        return Array.from(this._steps.keys());
    }

    /**
     * Get the state of a specific step. If no steps have been defined, an error is thrown
     * 
     * @param step Step to get the state of
     */
    public getStepState(step: string): StepState | null {
        if (this._steps == null) {
            throw `Not steps defined. Cannot get step state`;
        }

        return this._steps.get(step) || null;
    }

    /**
     * Forward the resolution of a response to a different ApiResponse. If a callback for the status code has already
     *      been set, an error will be thrown
     * 
     * @param code      Status code that will be forwarded to response
     * @param response  ApiResponse that will be resolved instead of this ApiResponse
     * 
     * @returns The F-bounded polymorphic this
     */
    public forward(code: ResponseCodes, response: ApiResponse<T>): this {
        if (this._callbacks.has(code)) {
            throw `Cannot forward ${code}, a callback has already been set`;
        }
        this.addCallback(code, (data: any) => {
            // This any cast is safe, there is no way that an ApiResponse can be resolved with the wrong type thanks to TS
            response.resolve({ code: code, data: data } as any);
        });

        return this;
    }

    /**
     * Forward all callbacks that haven't been set to a different response
     * 
     * @param response ApiResponse to forward all callbacks to
     */
    public forwardUnset(response: ApiResponse<T>): void {
        for (const code of ApiResponse.codes) {
            if (!this._callbacks.has(code)) {
                this.forward(code, response);
            }
        }
    }

    /**
     * Remove all callbacks for resolution. Useful for when an ApiResponse is cached
     */
    public resetCallbacks(): this {
        this._callbacks.clear();
        return this;
    }

    /**
     * Add a new callback when the API request has resolved
     * 
     * @param status    Status code to call parameter func for
     * @param func      Callback to execut when the API request has resolved
     */
    private addCallback(status: number, func: (data: any) => void) {
        if (!this._callbacks.has(status)) {
            this._callbacks.set(status, []);
        }
        this._callbacks.get(status)!.push(func); // TS doesn't see the .set() above making this not undefined
    }

    public promise(): Promise<ResponseContent<T>> {
        return new Promise<ResponseContent<T>>((resolve, reject) => {
            this.always(() => {
                if (this.status == 200) {
                    return resolve({ code: 200, data: this.data as T });
                } else if (this.status == 500) {
                    return resolve({ code: 500, data: this.data as string });
                } else if (this.status == 201) {
                    return resolve({ code: 201, data: this.data as number });
                } else if (this.status == 204) {
                    return resolve({ code: 204, data: null });
                } else if (this.status == 400) {
                    return resolve({ code: 400, data: this.data as string });
                } else if (this.status == 404) {
                    return resolve({ code: 404, data: this.data as string });
                } else {
                    return reject(`Unchecked status ${this.status}`);
                }
            });
        });
    }

    /**
     * Add a new callback that is always executed
     * 
     * @param func Callback to call
     * 
     * @returns The F-bounded polymorphic this
     */
    public always(func: () => void): this {
        if (this._resolved == true) {
            func();
        }

        for (const code of ApiResponse.codes) {
            this.addCallback(code, func);
        }

        return this;
    }

    /**
     * Add a new callback when the API request resolves with a 200 OK
     * 
     * @param func Callback to call. Will take in the the parameter passed
     * 
     * @returns The F-bounded polymorphic this
     */
    public ok(func: (data: NonNullable<T>) => void): this {
        if (this._resolved == true && this.status == 200) { func(this.data as NonNullable<T>); }
        this.addCallback(200, func);
        return this;
    }

    /**
     * Add a new callback when the API request resolves with a 201 created
     * 
     * @param func Callback to call. Will take in the ID returned from the API endpoint
     * 
     * @returns The F-bounded polymorphic this
     */
    public created(func: (data: number) => void): this {
        if (this._resolved == true && this.status == 201) { func(this.data as number); }
        this.addCallback(201, func);
        return this;
    }

    /**
     * Add a new callback when the API request resolves with a 204 No content
     * 
     * @param func Callback to call. Takes in no parameters
     * 
     * @returns The F-bounded polymorphic this
     */
    public noContent(func: () => void): this {
        if (this._resolved == true && this.status == 204) { func(); }
        this.addCallback(204, func);
        return this;
    }

    /**
     * Add a new callback when the API request resolves with a 400 Bad request
     * 
     * @param func Callback to call. Takes in a string representing the bad request's error
     * 
     * @returns The F-bounded polymorphic this
     */
    public badRequest(func: (err: string) => void): this {
        if (this._resolved == true && this.status == 400) { func(this.data as string); }
        this.addCallback(400, func);
        return this;
    }

    /**
     * Add a new callback when the API request resolves with a 403 Forbidden
     * 
     * @param func Callback to call. Takes in a string respresenting the string returned from the API
     * 
     * @returns The F-bounded polymorphic this
     */
    public forbidden(func: (err: string) => void): this {
        if (this._resolved == true && this.status == 403) { func(this.data as string); }
        this.addCallback(403, func);
        return this;
    }

    /**
     * Add a new callback when the API request resolves with a 404 Not found. Different from noContent,
     * as noContent is usually when a GET request does not find the object, where notFound is returned
     * during validation errors (typically validation object IDs not found)
     * 
     * @param func Callback to call. Takes in the resource ID that was not found
     * 
     * @returns The F-bounded polymorphic this
     */
    public notFound(func: (err: string) => void): this {
        if (this._resolved == true && this.status == 404) { func(this.data as string); }
        this.addCallback(404, func);
        return this;
    }

    /**
     * Add a new callback when the API request resolves with a 500 Internal server error
     * 
     * @param func Callback to call. Takes in the error returned from the server
     * 
     * @returns The F-bounded polymorphic this
     */
    public internalError(func: (err: string) => void): this {
        if (this._resolved == true && this.status == 500) { func(this.data as string); }
        this.addCallback(500, func);
        return this;
    }

}

/**
 * Abstract wrapper class used by API wrappers
 */
export abstract class APIWrapper<T> {

    /**
     * Abstract method used to read a single element of the type T. Each APIWrapper must override
     * this to be able to read from its own endpoints.
     *
     * @param elem A single element from the API endpoint
     *
     * @returns A value of type T
     */
    public abstract readEntry(elem: any): T;

    /**
     * Read an array of objects from the endpoint into an array of the wrapped object
     * 
     * @param elem An array of elements from an API endpoint
     * 
     * @returns An array of type T
     */
    public readList(elem: any): T[] {
        let result: T[] = [];
        if (Array.isArray(elem)) {
            elem.forEach((item: any) => {
                result.push(this.readEntry(item));
            });
        }

        return result;
    }

    /**
     * Get an array of data from an API endpoint
     *
     * @param url   URL the API endpoint is located at
     * @param data  Optional data to pass to the API endpoint
     *
     * @returns The ApiResponse that is being performed. Add callbacks using .ok(), etc.
     */
    protected get(url: string, data?: any): ApiResponse<T[]> {
        if (data != undefined) {
            for (const name in data) {
                const val = data[name];
                // Convert dates into ISO strings, which is what c# uses for DateTime binding
                if (val instanceof Date) {
                    data[name] = val.toISOString();
                }
            }
        }

        const promise = axios.default.request({
            url: url,
            data: JSON.stringify(data),
            validateStatus: () => true,
            method: "GET"
        });

        // Bind this to ensure that .readEntry by binding the inherited class instead of
        // the base class APIWrapper
        let result: ApiResponse<T[]> = new ApiResponse<T[]>(promise, this.readList.bind(this));

        return result;
    }

    /**
     * Read a single entry from the API endpoint. If multiple entries are returned, only the first
     * entry will be returned. A 404 does not return null, instead it will throw. For a null to
     * be returned, the response must reply 204NoContent
     *
     * @param url   URL the API endpoint is located at
     * @param data  Optional data to pass to the API endpoint
     *
     * @returns The ApiResponse that is being performed. Add callbacks using .ok(), etc.
     */
    protected single(url: string, data?: any): ApiResponse<T | null> {
        const promise = axios.default.request({
            url: url,
            data: JSON.stringify(data),
            validateStatus: () => true,
            method: "GET"
        });

        let result: ApiResponse<T | null> = new ApiResponse<T | null>(promise, this.readEntry);

        return result;
    }

    /**
     * Perform a post request. Typically used for inserting new data, or other operations that are
     * not idempotent
     * 
     * @param url   URL to perform the post request on
     * @param data  Data to be passed when performing the post request. This data is JSONified before sent
     *              
     * @returns The ApiResponse that is being performed. Add callbacks using .ok(), etc.
     */
    protected post(url: string, data?: any): ApiResponse {
        const promise = axios.default.request({
            url: url,
            responseType: "json",
            data: JSON.stringify(data),
            validateStatus: () => true,
            method: "POST"
        });

        let result: ApiResponse = new ApiResponse(promise, null);

        return result;
    }

    /**
     * Post a message which expects a reply from the API
     * 
     * @param url   URL to perform the POST request on
     * @param data  Data to be passed to the POST request. this data is JSONified before being sent in the body
     * 
     * @returns The ApiResponse that is being performed. Add callbacks using .ok(), etc.
     */
    protected postReply<U>(url: string, data?: any): ApiResponse<U | null> {
        const promise = axios.default.request({
            url: url,
            data: JSON.stringify(data),
            validateStatus: () => true,
            method: "POST"
        });

        let result: ApiResponse<U | null> = new ApiResponse<U | null>(promise, null);

        return result;
    }

    /**
     * Perform a PUT request. Operations perform with this method should be idempotent, which means this request
     * can be repeated as many times as the client needs to (if say the network is botched and the client isn't
     * sure if the request was successfully completed). This means it is not appropriate for creating objects
     * (which is why creating is done through POSTing), but could also not be appropriate for updating certain
     * objects
     * 
     * @param url   URL to PUT to
     * @param data  Option data to be passed when performing the PUT request
     * 
     * @returns The ApiResponse that is being performed. Add callbacks using .ok(), etc.
     */
    protected put(url: string, data?: any): ApiResponse {
        const promise = axios.default.request({
            url: url,
            data: JSON.stringify(data),
            validateStatus: () => true,
            method: "PUT"
        });

        let result: ApiResponse = new ApiResponse(promise, null);

        return result;
    }

    /**
     * Perform a DELETE request. Typically DELETE endpoints just take in a single value, which is the
     * ID of the resource to delete
     * 
     * @param url   URL to DELETE to
     * @param data  Data to pass to the API endpoint. This data will be JSONified in the body when passed
     * 
     * @returns The ApiResponse that is being performed. Add callbacks using .ok(), etc.
     */
    protected delete(url: string, data?: any): ApiResponse {
        const promise = axios.default.request({
            url: url,
            data: JSON.stringify(data),
            validateStatus: () => true,
            method: "DELETE"
        });

        let result: ApiResponse = new ApiResponse(promise, null);

        return result;
    }

}
