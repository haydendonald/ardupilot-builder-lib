export interface LUAFile {
    helperFunctions?: string[]; //Functions to append to the top of the LUA file
    validateSyntax?: boolean; //Validate the syntax of the file. Default true
    file?: string | string[]; //The file(s) to include in this file. Multiple files will be combined into one
    outputName?: string //Rename the lua file (output.lua)
    injectMethods?: {
        buildDate?: boolean; //Inject a build_date() method into the LUA file
        ardupilotSha?: boolean; //Inject a ardupilot_sha() method into the LUA file
    },
    copyOutput?: string; //Should we copy the LUA file generated to another location? Default is to not copy
    MAVLinkModule?: {
        includeMessages?: string[]; //The message types to include typed as "COMMAND_ACK" for example. See AP_Scripting/modules/MAVLink/mavlink_msg_COMMAND_ACK.lua for example. They can be got using local msg = get_mavlink_msg("COMMAND_ACK") for example
        includeMavlink_msgs?: boolean; //Should we include the mavlink_msgs object. It can be created using local mavlink_msgs = mavlink_msgs() for example. Default is false
    },
    replaceVariables?: {
        name: string;
        value: string;
    }[]; //Replace variables in the LUA file surrounded by --%%VARIABLE%%--. For example to replace --%%VERSION%%-- with 1.0.0
    cleanCode?: boolean | { //Run the LUA cleaner over the generated file to remove unused declarations and strip comments. Default false. Pass an object for finer control
        stripComments?: boolean; //Strip comments from the generated file. Default true
        maxIterations?: number; //Cap iterations of unused-removal passes. Default 50
        removeUnusedGlobals?: boolean; //Also remove top-level global functions whose name is referenced nowhere else in the file. Default true
        entryPoints?: string[]; //Global function names that must always be kept (e.g. callbacks the binding code looks up by string)
    };
}