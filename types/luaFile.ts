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
    }
}