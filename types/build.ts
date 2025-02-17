import { Board } from "./board";
import { Target } from "./target";
import { LUAFile } from "./luaFile";
export interface Build {
    name?: string; //The name of the build
    board: Board; //--board
    target: Target | string; //--target

    //What to perform once the build has completed successfully
    finalSteps?: {
        copyBinaries?: string; //Copy the binaries to a folder. Path can be relative or absolute (./output or /output)

        //Upload the binaries to a board
        uploadToBoard?: {
            uploadDest?: string; //The destination to upload to. Default is to find a connected board via usb
            binary: string; //The binary to upload from the build folder
            extraParams?: string[]; //Extra parameters to pass to the upload command
        }

        openMAVProxy?: {  //The destination to open MAVProxy to. Default is to find a connected board via usb
            master?: string; //The --master to connect to
            baudRate?: number; //The baud rate to connect to
            extraParams?: string[]; //Extra parameters to pass to MAVProxy
        } | boolean;
    }

    buildOptions?: {
        static?: boolean; //--static. Default false
        upload?: boolean; //--upload. Default false
        uploadDest?: string; //--rsync-dest root@192.168.1.2:/. Default false
        debug?: boolean; //--debug. Default false
        distClean?: boolean; ///Run distclean before building. Default false
        extraWafConfigureArgs?: string[]; //Extra arguments to pass to waf configure
        extraWafBuildArgs?: string[]; //Extra arguments to pass to waf build
        preBuildCommands?: string[]; //Commands to run before building (will run after configure)
        postBuildCommands?: string[]; //Commands to run after building
        logEvents?: boolean; //Should the output be logged to the event emitter. Default true
        logConsole?: boolean; //Should the output be logged directly into console. Default false
    }

    //Git options. Default is to use a folder called "ardupilot" where this script was ran, if it doesn't exist it will clone the repo
    gitRepo?: {
        remote?: {
            repo: string;
            branch: string;
        }

        //Use a local git repository
        local?: {
            location: string; //The location. Can be relative using ./repo or exact using /repo
        }

        reset?: boolean; //Should the git repo be reset before building. Default false
        useBuildFolder?: boolean; //Should we copy the repo into a temporary location to build from. Default true
    }

    //Parameter options
    parameter?: {
        clear?: boolean; //Clear the defaults param file. Default false
        replaceFile?: string; //Replace the defaults param file with another
        append?: Record<string, string>; //Append to the defaults param file
    }

    //LUA options
    lua?: {
        include?: boolean; //Should we include the LUA files. Default true
        enableScripting?: boolean; //Should scripting be enabled (Will set/unset SCR_ENABLED). Default is true (if this object is included)
        luaFiles?: LUAFile[]; //The LUA files to include
    }

    //Add custom lua bindings
    luaBindings?: {
        clear?: boolean; //Clear the lua bindings file. Default false
        replaceFile?: string; //Replace the lua bindings file with another
        append?: string[]; //Append options to the lua bindings file
    }

    //HWDef options
    hwDef?: {
        clear?: boolean; //Clear the HWDef file. Default false
        replaceFile?: string; //Replace the HWDef file with another (The filename in the hwdef directory will not be this file, it will be named hwdef.dat)
        append?: string[]; //Append options to the HWDef file
    }
}