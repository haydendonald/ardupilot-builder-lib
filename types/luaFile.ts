export interface LUAFile {
    helperFunctions?: string[]; //Functions to append to the top of the LUA file
    validateSyntax?: boolean; //Validate the syntax of the file
    file?: string | string[]; //The file(s) to include in this file. Multiple files will be combined into one
    outputName?: string //Rename the lua file (output.lua)
    injectMethods?: {
        buildDate?: boolean; //Inject a build_date() method into the LUA file
        gitSha?: boolean; //Inject a git_sha() method into the LUA file
        applicationSha?: boolean; //Inject a application_sha() method into the LUA file
    }
}