let allowLog = true;

export function setLog(log: boolean) {
    allowLog = log;
}

export function info(message: string) {
    if (!allowLog) {
        return;
    }
    console.log(message);
}