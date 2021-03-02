
export type ProgressSteps = {
    type: "steps";

    steps: string[];
}

export type ProgressUpdate = {
    type: "update";

    step: string;

    state: "started" | "errored" | "done";
}

export type ProgressNotification = ProgressSteps | ProgressUpdate;

export type ProgressCallback = (notif: ProgressNotification) => void;