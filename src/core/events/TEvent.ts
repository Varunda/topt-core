import {
    TKillEvent, TDeathEvent, TTeamkillEvent,
    TCaptureEvent, TDefendEvent,
    TLoginEvent, TLogoutEvent,
    TExpEvent, TVehicleKillEvent,
    TMarkerEvent
} from "./index";

export type TEventType = "exp" | "kill" | "death" | "capture" | "defend" | "vehicle" | "teamkill" | "login" | "logout" | "marker";

export type TEvent = TKillEvent | TDefendEvent | TDeathEvent | TTeamkillEvent | TLoginEvent | TLogoutEvent | TCaptureEvent | TExpEvent | TVehicleKillEvent | TMarkerEvent;

export type TLoadoutEvent = TKillEvent | TDeathEvent | TTeamkillEvent | TExpEvent | TVehicleKillEvent;