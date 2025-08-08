import { Utility } from "../utility";

export interface BuildArguments {
    buildBootloader?: boolean; //Should the bootloader be built?
    resetRepo?: boolean; //Should the git repo be reset before building
    parameters?: Record<string, string>; //Extra parameters to pass to the build command
    enableLUA?: boolean; //Should LUA be enabled?
    hwDef?: string[]; //Add more hwdef lines
    uploadToBoard?: {
        uploadDest?: string; //The destination to upload to
        binary?: string; //The binary to upload from the build folder
        extraParams?: string[]; //Extra parameters to pass to the upload command
    } | boolean;
    openMAVProxy?: {
        master?: string; //The --master to connect to
        baudRate?: number; //The baud rate to connect to
        extraParams?: string[]; //Extra parameters to pass to MAVProxy
    } | boolean;
}

/**
 * Get a build argument object from the command line arguments.
 * @returns The build argument object
 */
export function BuildArgumentsFromArgs(): BuildArguments {
    if (Utility.booleanProcessArgument("help") || Utility.booleanProcessArgument("h")) {
        const exampleArgs: Record<string, string> = {}
        exampleArgs["--buildBootloader=[true|false]"] = "Should the bootloader be built?";
        exampleArgs["--resetRepo=[true|false]"] = "Should the repository be reset when it's copied to the build folder. Set to false if you are editing files within the repo directory";
        exampleArgs["--parameters=param1,value,param2,value..."] = "Add baked default parameters to the build";
        exampleArgs["--enableLUA=[true|false]"] = "Should LUA be enabled?";
        exampleArgs["--hwdef=\"hwdef1,hwdef2\""] = "Add extra HWDef lines to the build";
        exampleArgs["--uploadToBoard=[true|false] or --uploadToBoard=dest,binary,uploadParam1,uploadParam2,..."] = "Upload to the board";
        exampleArgs["--openMAVProxy=[true|false] or --openMAVProxy=master,baudRate,extraParams"] = "Open MAVProxy to the board after flashing";

        console.log(`The following build arguments are available:\n\n${Object.entries(exampleArgs).map(([arg, desc]) => `${arg}\n${desc}`).join("\n\n")}`);
        process.exit(0);
    }

    return {
        buildBootloader: Utility.booleanProcessArgument("buildBootloader"),

        resetRepo: Utility.booleanProcessArgument("resetRepo"),

        parameters: (() => {
            let ret: Record<string, string> = {};
            const value = Utility.getProcessArgument("parameters");
            let param: string | undefined;
            for (const val of value?.split(",") || []) {
                if (!param) { param = val; continue; }
                ret[param] = val;
                param = undefined;
            }
            return ret;
        })(),

        enableLUA: Utility.booleanProcessArgument("enableLUA"),

        hwDef: Utility.getProcessArgument("hwdef")?.split(",") || undefined,

        uploadToBoard: (() => {
            const uploadToBoardBool = Utility.booleanProcessArgument("uploadToBoard");
            const uploadToBoardArg = Utility.getProcessArgument("uploadToBoard");

            if (uploadToBoardBool !== undefined) { return uploadToBoardBool; }
            if (!uploadToBoardArg) { return undefined; }

            const ret: { uploadDest?: string; binary?: string; extraParams?: string[] } = {};
            const args = uploadToBoardArg.split(",");
            if (args.length > 0) { ret.uploadDest = args[0]; }
            if (args.length > 1) { ret.binary = args[1]; }
            if (args.length > 2) { ret.extraParams = args.slice(2); }
            return ret;
        })(),

        openMAVProxy: (() => {
            const openMAVProxyBool = Utility.booleanProcessArgument("openMAVProxy");
            const openMAVProxyArg = Utility.getProcessArgument("openMAVProxy");

            if (openMAVProxyBool !== undefined) { return openMAVProxyBool; }
            if (!openMAVProxyArg) { return undefined; }

            const ret: { master?: string; baudRate?: number; extraParams?: string[] } = {};
            const args = openMAVProxyArg.split(",");
            if (args.length > 0) { ret.master = args[0]; }
            if (args.length > 1) { ret.baudRate = parseInt(args[1]); }
            if (args.length > 2) { ret.extraParams = args.slice(2); }
            return ret;
        })()
    };
}