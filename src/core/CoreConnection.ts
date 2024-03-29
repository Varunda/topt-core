import { Core } from "./Core";

import { ApiResponse } from "./census/ApiWrapper";

import { w3cwebsocket, IMessageEvent } from "websocket";

import { Logger } from "./Loggers";
const log = Logger.getLogger("Core:Connection");

declare module "./Core" {

    export interface Core {

        /**
         * Connect to the event stream
         * 
         * @returns An ApiResponse that will resolve once the core is connected to Census
         */
        connect(): ApiResponse;

        /**
         * Disconnect the sockets that are being used to listen
         */
        disconnect(): void;

        /**
         * Callback set on sockets when they throw an error
         * 
         * @param socketName Name of the socket that threw the error
         * @param ev Event containing more information
         */
        onSocketError(socketName: string, ev: Error): void;

    }
}

(Core as any).prototype.connect = function(): ApiResponse {
    const self: Core = (this as Core);

    const response: ApiResponse = new ApiResponse();

    self.disconnect();

    let opsLeft: number = 
        + 1 // Tracker
        + 1 // Logins
        + 1 // Logistics
        + 1 // Facilities
        + 1 // Debug

    // Common handler used when all sockets have connected
    const handler = () => {
        if (--opsLeft == 0) {
            self.connected = true;
            response.resolveOk();
        }
    }

    setupTrackerSocket(self).always(() => handler());
    setupLoginSocket(self).always(() => handler());
    setupLogisticsSocket(self).always(() => handler());
    setupFacilitySocket(self).always(() => handler());
    setupDebugSocket(self).always(() => handler());
    setupAddedSocket(self).always(() => handler());

    return response;
};

(Core as any).prototype.disconnect = function(): void {
    const self: Core = (this as Core);

    if (self.sockets.tracked != null) { self.sockets.tracked.close(); self.sockets.tracked = null; }
    if (self.sockets.logins != null) { self.sockets.logins.close(); self.sockets.logins = null; }
    if (self.sockets.logistics != null) { self.sockets.logistics.close(); self.sockets.logistics = null; }
    if (self.sockets.facility != null) { self.sockets.facility.close(); self.sockets.facility = null; }
    if (self.sockets.debug != null) { self.sockets.debug.close(); self.sockets.debug = null; }
    if (self.sockets.added != null) { self.sockets.added.close(); self.sockets.added = null; }

    self.connected = false;
};

Core.prototype.onSocketError = function(socketName: string, ev: Error): void {
    log.error(`Error on socket: ${socketName}> ${JSON.stringify(ev)}`);
}

function setupTrackerSocket(core: Core): ApiResponse {
    const response: ApiResponse = new ApiResponse();

    core.sockets.tracked = new w3cwebsocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${core.serviceID}`);
    core.sockets.tracked.onopen = () => {};
    core.sockets.tracked.onerror = () => {
        response.resolve({ code: 500, data: `` });
    };
    core.sockets.tracked.onmessage = () => {
        log.debug(`tracker socket connected`);
        core.sockets.tracked!.onmessage = core.onmessage.bind(core);
        response.resolveOk();
    };

    return response;
}

function setupDebugSocket(core: Core): ApiResponse {
    const response: ApiResponse = new ApiResponse();

    core.sockets.debug = new w3cwebsocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${core.serviceID}`);
    core.sockets.debug.onopen = () => { };
    core.sockets.debug.onerror = () => {
        response.resolve({ code: 500, data: `` });
    };
    core.sockets.debug.onmessage = () => {
        log.debug(`debug socket connected`);
        core.sockets.debug!.onmessage = (ev: IMessageEvent) => {
            core.debugSocketMessages.push(JSON.parse(ev.data as string));
        };
        response.resolveOk();
    };

    return response;
}

function setupAddedSocket(core: Core): ApiResponse { 
    const response: ApiResponse = new ApiResponse();

    core.sockets.added = new w3cwebsocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${core.serviceID}`);
    core.sockets.added.onopen = () => { response.resolveOk(); };
    core.sockets.added.onerror = () => {
        response.resolve({ code: 500, data: `` });
    };
    core.sockets.added.onmessage = core.onmessage.bind(core);

    return response;
}

function setupLogisticsSocket(core: Core): ApiResponse {
    const response: ApiResponse = new ApiResponse();

    core.sockets.logistics = new w3cwebsocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${core.serviceID}`);
    core.sockets.logistics.onopen = () => {
        if (core.sockets.logistics == null) {
            throw `Expected sockets.logistics to not be null`;
        }

        const msg: object = {
            service: "event",
            action: "subscribe",
            characters: ["all"],
            worlds: [
                core.serverID
            ],
            eventNames: [
                "GainExperience_experience_id_1409",    // Router kill
                "GainExperience_experience_id_60",      // Galaxy kill
                "GainExperience_experience_id_68",      // Sundy kill
            ],
            logicalAndCharactersWithWorlds: true
        };

        core.sockets.logistics.send(JSON.stringify(msg));

        log.debug(`logistics socket connected`);

        response.resolveOk();
    };
    core.sockets.logistics.onerror = (ev: Error) => core.onSocketError("logistics", ev);
    core.sockets.logistics.onmessage = core.onmessage.bind(core);

    return response;
}

function setupLoginSocket(core: Core): ApiResponse {
    const response: ApiResponse = new ApiResponse();

    core.sockets.logins = new w3cwebsocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${core.serviceID}`);
    core.sockets.logins.onopen = () => {
        if (core.sockets.logins == null) {
            throw `Expected sockets.login to not be null`;
        }

        const msg: object = {
            service: "event",
            action: "subscribe",
            characters: ["all"],
            worlds: [
                core.serverID
            ],
            eventNames: [
                "PlayerLogin",
                "PlayerLogout"
            ],
            logicalAndCharactersWithWorlds: true
        };

        core.sockets.logins.send(JSON.stringify(msg));

        log.debug(`login socket connected`);

        response.resolveOk();
    };
    core.sockets.logins.onerror = (ev: Error) => core.onSocketError("login", ev);
    core.sockets.logins.onmessage = core.onmessage.bind(core);

    return response;
}

function setupFacilitySocket(core: Core): ApiResponse {
    const response: ApiResponse = new ApiResponse();

    core.sockets.facility = new w3cwebsocket(`wss://push.planetside2.com/streaming?environment=ps2&service-id=s:${core.serviceID}`);
    core.sockets.facility.onopen = () => {
        if (core.sockets.facility == null) {
            throw `sockets.facility is null`;
        }

        const msg: object = {
            service: "event",
            action: "subscribe",
            characters: ["all"],
            worlds: [
                core.serverID
            ],
            eventNames: [
                "PlayerFacilityCapture",
                "PlayerFacilityDefend",
                "FacilityControl"
            ],
            logicalAndCharactersWithWorlds: true
        };

        core.sockets.facility.send(JSON.stringify(msg));
        log.debug(`facility socket connected`);

        response.resolveOk();
    };
    core.sockets.facility.onmessage = core.onmessage.bind(core);
    core.sockets.facility.onerror = (ev: Error) => core.onSocketError("facility", ev);

    return response;
}
