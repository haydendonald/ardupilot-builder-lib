import path from "path";
import { Process, ProcessEvent } from "./process";
import { Utility } from "./utility";
import * as fs from "fs";
import { BuildArguments } from "./types/buildArguments";
import { Build } from "./types/build";
import EventEmitter from "events";
import { BuildLocation } from "./types/buildLocation";

export class BoardBuilder extends EventEmitter {
    /**
     * Info log message event
     * @param message The message
     * @event
     */
    static info = "info";
    /**
     * Warning log message event
     * @param message The message
     * @event
     */
    static warn = "warn";
    /**
     * Error log message event
     * @param message The message
     * @event
     */
    static error = "error";
    /**
     * Verbose log message event
     * @param message The message
     * @event
     */
    static verbose = "verbose";
    /**
     * Emitted when the build begins
     * @event
     */
    static begin = "begin";
    /**
     * Emitted when the build completes
     * @param success If the build was successful or not
     * @param failureReason Why the build failed
     * @event
     */
    static complete = "complete";

    static ardupilotRepo = {
        repo: "https://github.com/ArduPilot/ardupilot.git",
        branch: "master"
    };

    private buildFor: Build;
    private buildLocation: string;
    private repoLocation: string;
    private _ardupilotSha?: string;

    buildSuccess?: boolean;
    buildError?: string;

    /**
     * Constructor
     * @param buildFor What board to build for
     * @param args The build arguments
     * @param useConsole Should we send our log statements out to the console. Default is verbose
     */
    constructor(buildFor: Build, args?: BuildArguments, consoleChannel: "disabled" | "error" | "info" | "verbose" = "verbose") {
        super();
        this.buildFor = buildFor;

        //Print to console if enabled
        if (consoleChannel != "disabled") {
            function printToConsole(channel: string, color: string, message: string) {
                console.log(`\x1b[${color}m[${channel}][${buildFor.name}][${new Date().toISOString()}] ${message}\x1b[0m`);
            }

            if (consoleChannel == "info" || consoleChannel == "verbose") {
                this.on(BoardBuilder.begin, () => {
                    printToConsole("INFO", "34", "Begin building");
                });
                this.on(BoardBuilder.complete, (success, failureReason) => {
                    printToConsole("INFO", "32", `Build ${success ? "successful" : "failed"}`);
                    console.log({ success, failureReason });
                });
                this.on(BoardBuilder.info, (info) => {
                    printToConsole("INFO", "36", info);
                });
            }

            if (consoleChannel == "error" || consoleChannel == "info" || consoleChannel == "verbose") {
                this.on(BoardBuilder.error, (error) => {
                    printToConsole("ERROR", "31", error);
                });
                this.on(BoardBuilder.warn, (warning) => {
                    printToConsole("WARN", "33", warning);
                });
            }

            if (consoleChannel == "verbose") {
                this.on(BoardBuilder.verbose, (info) => {
                    printToConsole("VERBOSE", "35", info);
                });
            }
        }

        //Default the git repo to a folder called ardupilot in the working directory
        if (!this.buildFor.gitRepo?.remote && !this.buildFor.gitRepo?.local) {
            this.buildFor.gitRepo = {
                local: {
                    location: "./ardupilot"
                }
            }
        }

        //Set our locations based on the config
        if (this.buildFor.gitRepo?.remote) {
            this.repoLocation = `${Utility.repoDirectory}/${this.repoName}`;
        }
        else if (this.buildFor.gitRepo?.local) {
            const location = this.parseDirectory(this.buildFor.gitRepo.local.location);
            if (!location) { throw "Local git repo location is not defined"; }
            this.repoLocation = location;
        }
        else {
            throw "There is no repo remote or local defined, i don't have anything to build from!";
        }

        //If useBuildFolder is false use the repo location. Don't copy the repo into a build location
        if (this.buildFor.useBuildFolder != false) {
            this.buildLocation = `${Utility.buildDirectory}/${this.name}/${this.repoName}`;
        }
        else {
            this.buildLocation = this.repoLocation;
        }
    }

    private get repoName(): string {
        if (!this.buildFor.gitRepo?.remote) { return `local_${Utility.removeSpecialCharacters(this.repoLocation)}`; }
        return `${Utility.removeSpecialCharacters(this.buildFor.gitRepo.remote.repo)}:${this.buildFor.gitRepo.remote.branch}`;
    }

    private get binaryDirectory(): string {
        if (this.buildFor.binaryDirectory) {
            const directory = this.parseDirectory(this.buildFor.binaryDirectory);
            if (!directory) { throw "Binary directory is not defined"; }
            return directory;
        }
        return `${this.ardupilotDirectory}/build/${this.buildFor.board.board}/bin`;
    }


    get name(): string {
        return Utility.removeSpecialCharacters(this.buildFor.name || `${this.buildFor.board.friendlyName}-${this.buildFor.target}`);
    }

    get cloneRepoCommand(): string {
        if (!this.buildFor.gitRepo?.remote) {
            if (!this.buildFor.gitRepo) { this.buildFor.gitRepo = {}; }
            this.buildFor.gitRepo.remote = BoardBuilder.ardupilotRepo;
        }
        return `git clone --recursive -b ${this.buildFor.gitRepo.remote.branch} ${this.buildFor.gitRepo.remote.repo} ${this.repoLocation}`;
    }

    get ardupilotDirectory(): string {
        if (this.buildFor.ardupilotDirectory) {
            const directory = this.parseDirectory(this.buildFor.ardupilotDirectory);
            if (!directory) { throw "Ardupilot directory is not defined"; }
            return directory;
        }
        return this.buildLocation;
    }

    get wafDirectory(): string {
        if (this.buildFor.wafDirectory) {
            const directory = this.parseDirectory(this.buildFor.wafDirectory);
            if (!directory) { throw "Waf directory is not defined"; }
            return directory;
        }
        return this.buildLocation;
    }

    get libDirectory(): string {
        return `${this.ardupilotDirectory}/libraries`;
    }

    get hwDefDirectory(): string {
        const directory = this.parseDirectory(this.buildFor.board.hwDefDirectory);
        if (!directory) { throw "HWDef directory is not defined"; }
        return directory;
    }

    get hwDefFile(): string {
        return `${this.hwDefDirectory}/hwdef.dat`;
    }

    get hwDefBootloaderFile(): string {
        return `${this.hwDefDirectory}/hwdef-bl.dat`;
    }

    get luaBindingsFile(): string {
        return `${this.libDirectory}/AP_Scripting/generator/description/bindings.desc`;
    }

    get paramDefaultsFile(): string {
        return `${this.hwDefDirectory}/defaults.parm`;
    }

    /**
     * The directories for scripting
     * @param libDirectory The location of the AP_Scripting library
     * @param bindingsFile The location of the bindings.desc file
     * @param scriptingDirectory The location of the scripts folder in the board hwdef directory
     */
    get scriptingDirectories(): {
        libDirectory: string,
        bindingsFile: string,
        scriptingDirectory: string
    } {
        const libDirectory = `${this.libDirectory}/AP_Scripting`;
        return {
            libDirectory,
            bindingsFile: `${libDirectory}/generator/bindings.desc`,
            scriptingDirectory: `${this.hwDefDirectory}/scripts`
        }
    }

    get ardupilotSha(): string {
        return this._ardupilotSha || "unknown";
    }

    /**
     * Parse a directory and replace any variables with their values
     * @param directory The directory string
     * @returns The actual directory
     */
    private parseDirectory(directory?: string): string | undefined {
        if (!directory) { return; }

        let ret = directory;
        let regEx;

        //Replace ./ with the base directory
        if (ret.startsWith("./")) {
            ret = path.join(Utility.baseDirectory, ret);
        }

        //Replace the build directory
        regEx = new RegExp(BuildLocation.buildFolder, "g");
        if (ret.match(regEx)) {
            ret = ret.replace(regEx, this.buildLocation);
        }

        //Replace the ardupilot directory
        regEx = new RegExp(BuildLocation.ardupilotDirectory, "g");
        if (ret.match(regEx)) {
            ret = ret.replace(regEx, this.ardupilotDirectory);
        }

        //Replace the board name
        regEx = new RegExp(BuildLocation.boardName, "g");
        if (ret.match(regEx)) {
            ret = ret.replace(regEx, this.buildFor.board.board);
        }

        return ret;
    }

    /**
     * Emit an info message
     * @param message The message
     */
    private info(message: string): void {
        this.emit(BoardBuilder.info, message.replace(/\n$/, ""));
    }

    /**
     * Emit an error message
     * @param message The message
     */
    private error(message: string): void {
        this.emit(BoardBuilder.error, message.replace(/\n$/, ""));
    }

    /**
     * Emit a warning message
     * @param message The message
     */
    private warning(message: string): void {
        this.emit(BoardBuilder.warn, message.replace(/\n$/, ""));
    }

    /**
     * Emit an verbose message
     * @param message The message
     */
    private verbose(message: string): void {
        this.emit(BoardBuilder.verbose, message.replace(/\n$/, ""));
    }

    //Emit a begin event
    private begin(): void {
        this.emit(BoardBuilder.begin);
    }

    /**
     * Emit a complete event
     * @param success Was the build successful
     * @param buildError Set the build error if required
     */
    private complete(success: boolean, buildError?: string): void {
        this.buildSuccess = success;
        this.buildError = buildError;
        this.emit(BoardBuilder.complete, success, success == false ? this.buildError : undefined);
    }

    /**
     * Download our repo if it doesn't exist
     * @returns A promise
     */
    async downloadRepo() {
        if (!this.buildFor.gitRepo?.remote) { return; }

        return new Promise<void>(async (resolve) => {
            if (!this.buildFor.gitRepo?.remote) { throw "Cannot download the repo when the remote is undefined"; }

            const repo = this.buildFor.gitRepo.remote.repo;
            const branch = this.buildFor.gitRepo.remote.branch;

            //Start by checking if we have already downloaded the repo(s), if not download them
            if (fs.existsSync(this.repoLocation)) {
                this.info(`Repo ${repo} ${branch} already exists at ${this.repoLocation}`);
                resolve();
                return;
            }
            this.info(`Downloading repo from ${repo} ${branch} to ${this.repoLocation}`);
            let process = new Process("bash");
            process.on(ProcessEvent.data, (data: any) => { this.info(data.toString()); });
            process.on(ProcessEvent.error, (error: any) => { this.info(error.toString()); });
            process.on(ProcessEvent.close, (code: any) => { this.verbose(`Exited with code: ${code}`); resolve(); });
            await process?.executeWait(this.cloneRepoCommand, true);
            this.info(`Repo ${repo} ${branch} finished downloading to ${this.repoLocation}`);
        });
    }

    /**
     * Copy the repo to the build directory
     */
    async copyRepo() {
        if (this.buildFor.useBuildFolder == false) { return; }

        return new Promise<void>((resolve, reject) => {
            this.info(`Copying repo from ${this.repoLocation} to ${this.buildLocation}`);

            //Make sure the repo exists
            if (!fs.existsSync(this.repoLocation)) {
                this.error(`The repo folder at ${this.repoLocation} does not exist`);
                reject("Repo folder missing");
            }

            if (fs.existsSync(this.buildLocation)) { fs.rmSync(this.buildLocation, { recursive: true }); }
            if (!fs.existsSync(this.buildLocation)) { fs.mkdirSync(this.buildLocation, { recursive: true }); }
            fs.cpSync(`${this.repoLocation}`, `${this.buildLocation}`, { recursive: true });
            resolve();
        });
    }

    /**
     * Process any git changes
     */
    async processGit() {
        const git = this.buildFor.gitRepo;
        const process = new Process("bash", undefined, this.buildLocation);
        return new Promise<void>(async (resolve) => {
            process.on(ProcessEvent.data, (data: any) => { this.verbose(data.toString()); });
            process.on(ProcessEvent.error, (error: any) => { this.error(error.toString()); });
            process.on(ProcessEvent.close, (code: any) => { this.verbose(`Process exited with ${code}`); resolve(); });

            //Checkout to a specific SHA if provided
            if (git?.remote?.sha) {
                this.info(`Checking out to SHA ${git.remote.sha}`);
                await process?.executeWait(`git checkout ${git.remote.sha}`);
            }

            //Reset git
            if (git?.reset == true) {
                this.info(`Resetting git repository at ${this.buildLocation}`);
                await process?.executeWait(`git reset --hard`);

                //Update submodules
                this.info(`Updating git submodules at ${this.buildLocation}`);
                await process?.executeWait(`git submodule update --init --recursive`);
            }

            process?.exit();
        });
    }

    /**
     * Process the lua bindings.desc file adding information that's required
     */
    async processLUABindings() {
        const luaBindings = this.buildFor.luaBindings;

        if (!luaBindings) { return; }
        this.info(`Processing LUA bindings file`);

        const replaceFile = this.parseDirectory(luaBindings.replaceFile);

        //Should we remove everything in the bindings file
        if (luaBindings.clear == true || replaceFile) {
            this.verbose(`Removing file ${this.luaBindingsFile}`);
            if (fs.existsSync(this.luaBindingsFile)) { fs.unlinkSync(this.luaBindingsFile); }
            this.info(`Removed the lua bindings file`);
        }

        //Copy the desired hw def file into the directory
        if (replaceFile) {
            this.info(`Copied ${replaceFile} to ${this.luaBindingsFile}`);
            fs.copyFileSync(replaceFile, this.luaBindingsFile);
        }

        //Append any binding values
        if (luaBindings.append) {
            fs.appendFileSync(this.luaBindingsFile, Buffer.from(`\n`));
            for (let line of luaBindings.append) {
                this.info(`Adding "${line}" to the lua bindings file`);
                fs.appendFileSync(this.luaBindingsFile, Buffer.from(`${line}\n`));
            }
        }
    }

    /**
     * Process the LUA options
     */
    async processLUA() {
        if (!this.buildFor.lua) { return; }
        const directories = this.scriptingDirectories;
        //If scripting is enabled add the SCR_ENABLED parameter to defaults to enable it
        if (this.buildFor.lua.enableScripting != false) {
            this.info("Adding SCR_ENABLED=1 to parameter definition");
            if (!this.buildFor.parameter) { this.buildFor.parameter = {}; }
            if (!this.buildFor.parameter.append) { this.buildFor.parameter.append = {}; }
            this.buildFor.parameter.append["SCR_ENABLED"] = "1";
        }

        //If LUA is not included in this build remove the scripting directory from the board
        if (this.buildFor.lua.include == false) {
            this.info("Removed the scripting directory as LUA is not included");
            fs.rmSync(directories.scriptingDirectory, { recursive: true });
            return;
        }
        if (!this.buildFor.lua.luaFiles) { return; }

        //Make the scripting directory from the board if it doesn't already exist
        if (!fs.existsSync(`${directories.scriptingDirectory}`)) { fs.mkdirSync(`${directories.scriptingDirectory}`); }

        //Add our LUA files
        for (const fileIndex in this.buildFor.lua.luaFiles) {
            const file = this.buildFor.lua.luaFiles[fileIndex];
            const fileName = file.outputName || (Array.isArray(file.file) ? `output_${fileIndex}.lua` : file.file?.substring(file.file?.lastIndexOf("/") || 0));
            const outputLocation = `${directories.scriptingDirectory}/${fileName}`;
            const writeStream: fs.WriteStream = fs.createWriteStream(outputLocation)
            this.info(`Creating LUA file at ${outputLocation}`);

            //Make a singular file an array containing just the file
            if (!Array.isArray(file.file)) { file.file = [file.file as string]; }

            //Inject into the file
            const inject = (comment: string, data: Buffer): Promise<void> => {
                return new Promise<void>((resolve, reject) => {
                    const header: Buffer = Buffer.from(`--- ${comment}\n`);
                    const end: Buffer = Buffer.from("\n");
                    const buffer: Buffer = Buffer.concat([header, data, end]);
                    this.verbose(`Writing ${buffer.toString()} to LUA file`);
                    writeStream.write(buffer, (error: any) => { if (error) { reject(error); } else { resolve() } });
                });
            }

            //Add predefined helper functions
            if (file.injectMethods) {
                file.helperFunctions = file.helperFunctions || [];
                if (file.injectMethods.buildDate) {
                    let date = new Date();
                    let dateStr: string = ((date.getDate() > 9) ? date.getDate() : ('0' + date.getDate())) + '/' + ((date.getMonth() > 8) ? (date.getMonth() + 1) : ('0' + (date.getMonth() + 1))) + '/' + date.getFullYear();
                    file.helperFunctions.push(`function build_date() return '${dateStr}' end`);
                }
                if (file.injectMethods.ardupilotSha) { file.helperFunctions.push(`function ardupilot_sha() return '${this.ardupilotSha}' end`); }
            }

            //Inject the helper functions at the top of the file
            if (file.helperFunctions) {
                for (const i in file.helperFunctions) {
                    await inject(`Helper ${i}`, Buffer.from(file.helperFunctions[i]));
                }
            }

            //Add the MAVLink modules to the LUA file. Note: To access them use local mavlink_msgs = mavlink_msgs() instead of require() as require doesn't work here
            if (file.MAVLinkModule?.includeMessages) {
                this.info("Adding MAVLink messages to the LUA file");

                //Generate the MAVLink messages
                this.info(`Generating the MAVLink messages located in ${this.ardupilotDirectory}/modules/mavlink`);
                const process = new Process("bash", ["-e"], this.ardupilotDirectory);
                await process.executeWait(`python ${this.ardupilotDirectory}/modules/mavlink/pymavlink/tools/mavgen.py --lang Lua ${this.ardupilotDirectory}/modules/mavlink/message_definitions/v1.0/all.xml --out ${directories.libDirectory}/modules/MAVLink`, true);


                const messages: Record<string, string> = {};
                for (const message of file.MAVLinkModule?.includeMessages) {
                    try {
                        const contents = fs.readFileSync(`${directories.libDirectory}/modules/MAVLink/mavlink_msg_${message}.lua`).toString();
                        messages["mavlink_msg_" + message] = `(function ()\n${contents}\nend)()\n`;
                    }
                    catch (e) { }
                }

                let toWrite = "local MAVLINK_MSGS = {}\n";
                toWrite += "function get_mavlink_msg(message) return MAVLINK_MSGS[\"mavlink_msg_\" .. message] end\n";
                for (const [message, contents] of Object.entries(messages)) {
                    toWrite += `MAVLINK_MSGS["${message}"] = ${contents}\n`;
                }
                await inject(`MAVLink messages`, Buffer.from(toWrite));
            }

            //Add the mavlink_msgs.lua file
            if (file.MAVLinkModule?.includeMavlink_msgs) {
                //Add the required message files
                this.info("Adding MAVLink messages to the LUA file");
                try {
                    const contents = fs.readFileSync(`${directories.libDirectory}/modules/MAVLink/mavlink_msgs.lua`).toString();
                    let toWrite = `function mavlink_msgs()\n${contents}\nend\n`;
                    toWrite = toWrite.replace(/require\("MAVLink\/mavlink_msg_/g, "get_mavlink_msg(\"");
                    await inject("MAVLink messages", Buffer.from(toWrite));
                }
                catch (e) { this.error(`Failed to read mavlink_msgs.lua file: ${e}`); }
            }

            //Go through the file(s) and append add them to the output
            for (const currentFile of file.file) {
                const currentFileLocation = this.parseDirectory(currentFile);
                if (!currentFileLocation) { continue; }
                await inject(`File ${currentFileLocation}`, fs.readFileSync(currentFileLocation));
            }

            //Ok! Done :)
            writeStream.close();

            //Should we copy the output file?
            if (file.copyOutput) {
                const copyLocation = this.parseDirectory(file.copyOutput);
                if (!copyLocation) {
                    this.error(`Cannot copy LUA file to ${file.copyOutput} as it is not defined`);
                    continue;
                }
                else {
                    //Create the directory if it doesn't exist
                    fs.mkdirSync(path.dirname(copyLocation), { recursive: true });
                    fs.copyFileSync(outputLocation, copyLocation);
                    this.info(`Copied LUA file to ${copyLocation}`);
                }
            }

            //Validate the LUA syntax to check for basic problems before we send it to the board
            if (file.validateSyntax != false) {
                try { await this.validateLUASyntax(outputLocation); }
                catch (e) {
                    this.error(`LUA validation error! ${e}. Will not continue with build`);
                    throw e;
                }
            }
        }
    }

    async validateLUASyntax(file: string) {
        const process = new Process("bash", ["-e"], this.ardupilotDirectory);
        const command = `cd ${this.buildLocation} && luacheck ${file} --config libraries/AP_Scripting/tests/luacheck.lua`;
        return new Promise<void>(async (resolve, reject) => {
            this.info(`Validating LUA syntax with ${command}`);

            let erroredLines = new Map<number, string>();
            let warningLines = new Map<number, string>();
            let mode: "error" | "warning";
            process.on(ProcessEvent.data, (data: any) => {
                const stringData = data.toString();
                const lines = stringData.split("\n");
                if (lines.filter((line: string) => { return line.match(new RegExp(`Checking .* .* error`, "g")); }).length == 1) { mode = "error"; }
                if (lines.filter((line: string) => { return line.match(new RegExp(`Checking .* .* warning`, "g")); }).length == 1) { mode = "warning"; }

                //Store the error/warning lines
                lines.filter((line: string) => { return line.includes(file + ":") }).forEach((line: string) => {
                    const parts = line.split(":");
                    const lineNumber = parseInt(parts[parts.length - 3]);
                    const index = parts[parts.length - 2];
                    const error = `${lineNumber}:${index} ${parts[parts.length - 1].slice(1)}`;
                    const previous = erroredLines.get(lineNumber);
                    if (mode == "error") { erroredLines.set(lineNumber, previous ? `${previous}, ${error}` : error); }
                    else if (mode == "warning") { warningLines.set(lineNumber, previous ? `${previous}, ${error}` : error); }
                });
                this.info(stringData);
            });
            process.on(ProcessEvent.error, (data: any) => { this.error(data.toString()); });
            process.on(ProcessEvent.close, (code: any) => {
                this.verbose(`Process exited with ${code}`);
                if (code == 0) {
                    resolve();
                }
                else {
                    //Print the file with line numbers for reference
                    let lineNum: number = 1;
                    for (let line of fs.readFileSync(file).toString().split("\n")) {
                        if (erroredLines.has(lineNum)) {
                            this.error(`${lineNum}: ${line} >>ERROR>> ${erroredLines.get(lineNum)}`);
                            lineNum++;
                        }
                        else if (warningLines.has(lineNum)) {
                            this.warning(`${lineNum}: ${line} >>WARNING>> ${warningLines.get(lineNum)}`);
                            lineNum++;
                        }
                        else {
                            this.info(`${lineNum++}: ${line}`);
                        }
                    }

                    //Print a summary of the errors
                    if (erroredLines.size > 0) {
                        this.error(`LUA syntax validation failed with ${erroredLines.size} error(s)`);
                        for (let [line, error] of erroredLines.entries()) {
                            this.error(`Line ${line}: ${error}`);
                        }
                    }
                    if (warningLines.size > 0) {
                        this.warning(`LUA syntax validation had ${warningLines.size} warning(s)`);
                        for (let [line, warning] of warningLines.entries()) {
                            this.warning(`Line ${line}: ${warning}`);
                        }
                    }

                    //If there are any errors stop
                    if (erroredLines.size > 0) {
                        reject(`Build process failed with code ${code} running ${process.lastWrite}`);
                    }
                    else {
                        resolve();
                    }
                }
            });

            await process?.executeWait(command, true);
        });
    }

    /**
     * Process the HWDef file adding information that's required
     */
    async processHWDef() {
        const hwDef = this.buildFor.hwDef;

        if (!hwDef) { return; }
        this.info(`Processing HWDef file`);

        const replaceFile = this.parseDirectory(hwDef.replaceFile);

        //Should we remove everything in the HWDef file
        if (hwDef.clear == true || replaceFile) {
            this.verbose(`Removing file ${this.hwDefFile}`);
            if (fs.existsSync(this.hwDefFile)) { fs.unlinkSync(this.hwDefFile); }
            this.info(`Removed the HWDef file`);
        }

        //Copy the desired hw def file into the directory
        if (replaceFile) {
            this.verbose(`Copied ${replaceFile} to ${this.hwDefFile}`);
            fs.copyFileSync(replaceFile, this.hwDefFile);
        }

        //Append any HWDef values
        if (hwDef.append) {
            fs.appendFileSync(this.hwDefFile, Buffer.from(`\n`));
            for (let line of hwDef.append) {
                this.info(`Adding "${line}" to the HWDef file`);
                fs.appendFileSync(this.hwDefFile, Buffer.from(`${line}\n`));
            }
        }
    }

    /**
     * Process the HWDef file for the bootloader adding information that's required
     */
    async processHWDefBootloader() {
        const hwDef = this.buildFor.hwDefBootloader;

        if (!hwDef) { return; }
        if (this.buildFor.buildBootloader != true) { return; }
        this.info(`Processing HWDef file for the bootloader`);

        const replaceFile = this.parseDirectory(hwDef.replaceFile);

        //Should we remove everything in the HWDef file
        if (hwDef.clear == true || replaceFile) {
            this.verbose(`Removing file ${this.hwDefBootloaderFile}`);
            if (fs.existsSync(this.hwDefBootloaderFile)) { fs.unlinkSync(this.hwDefBootloaderFile); }
            this.info(`Removed the HWDef file`);
        }

        //Copy the desired hw def file into the directory
        if (replaceFile) {
            this.verbose(`Copied ${replaceFile} to ${this.hwDefBootloaderFile}`);
            fs.copyFileSync(replaceFile, this.hwDefBootloaderFile);
        }

        //Append any HWDef values
        if (hwDef.append) {
            fs.appendFileSync(this.hwDefBootloaderFile, Buffer.from(`\n`));
            for (let line of hwDef.append) {
                this.info(`Adding "${line}" to the HWDef file`);
                fs.appendFileSync(this.hwDefBootloaderFile, Buffer.from(`${line}\n`));
            }
        }
    }

    /**
     * Process the parameters file adding information that's required
     */
    async processParameters() {
        const params = this.buildFor.parameter;
        if (!params) { return; }
        this.info(`Processing the parameters`);

        const replaceFile = this.parseDirectory(params.replaceFile);

        //Should we remove everything in the HWDef file
        if (params.clear == true || replaceFile) {
            this.verbose(`Removing file ${this.paramDefaultsFile}`);
            if (fs.existsSync(this.hwDefFile)) { fs.unlinkSync(this.paramDefaultsFile); }
        }

        //Copy the desired hw def file into the directory
        if (replaceFile) {
            this.verbose(`Copied ${replaceFile} to ${this.paramDefaultsFile}`);
            fs.copyFileSync(replaceFile, this.paramDefaultsFile);
        }

        //Append any extra param values
        if (params.append) {
            fs.appendFileSync(this.paramDefaultsFile, Buffer.from(`\n`));
            for (const param in params.append) {
                const value = params.append[param];
                this.verbose(`Added "${param} ${value}" to the params file`);
                fs.appendFileSync(this.paramDefaultsFile, Buffer.from(`${param} ${value}\n`));
            }
        }
    }

    /**
     * Process the bootloader
     */
    async processBootloader() {
        const bootloader = this.buildFor.bootloader;
        if (!bootloader) { return; }
        this.info(`Processing the bootloader`);

        const replaceFile = this.parseDirectory(bootloader.replaceFile);

        //Replace the bootloader with a custom one
        if (replaceFile) {
            const bootloaderLocation = `${this.ardupilotDirectory}/Tools/bootloaders/${this.buildFor.board.board}_bl.bin`;
            this.verbose(`Copied ${replaceFile} to ${bootloaderLocation}`);
            fs.copyFileSync(replaceFile, bootloaderLocation);
        }
    }

    /**
     * Run the ArduPilot build process
     */
    async runBuild() {
        const process = new Process("bash", ["-e"], this.wafDirectory);
        return new Promise<void>(async (resolve, reject) => {
            this.info(`Begin building the firmware!`);
            process.on(ProcessEvent.data, (data: any) => {
                if (this.buildFor.buildOptions?.logEvents! != false) { this.info(data.toString()); }
                if (this.buildFor.buildOptions?.logConsole) { console.log(data.toString()); }
            });
            process.on(ProcessEvent.error, (error: any) => {
                if (this.buildFor.buildOptions?.logEvents! != false) { this.error(error.toString()); }
                if (this.buildFor.buildOptions?.logConsole) { console.log(error.toString()); }
            });
            process.on(ProcessEvent.close, (code: any) => {
                this.verbose(`Process exited with ${code}`);
                if (code == 0) {
                    resolve();
                }
                else {
                    reject(`Build process failed with code ${code} running ${process.lastWrite}`);
                }
            });

            //Waf dist clean
            if (this.buildFor?.buildOptions?.distClean) {
                this.info(`Running distclean`);
                await process?.executeWait(`./waf distclean`);
            }

            //Waf configure
            let configureParams = this.buildFor?.buildOptions?.extraWafConfigureArgs || [];
            configureParams.push(`--board ${this.buildFor.board.board}`);
            configureParams.push(`--target ${this.buildFor.target}`);
            if (this.buildFor?.buildOptions?.static) { configureParams.push("--static"); }
            if (this.buildFor?.buildOptions?.uploadDest) { configureParams.push(`--rsync-dest ${this.buildFor?.buildOptions?.uploadDest}`); }
            if (this.buildFor?.buildOptions?.debug) { configureParams.push("--debug"); }
            if (this.buildFor?.buildBootloader == true) { configureParams.push("--bootloader"); }
            this.info(`Running configure with params: ${configureParams.join(" ")}`);
            await process?.executeWait(`./waf configure ${configureParams.join(" ")}`);

            //Run any pre build commands
            if (this.buildFor?.buildOptions?.preBuildCommands) {
                for (let command of this.buildFor.buildOptions.preBuildCommands) {
                    this.info(`Running pre build command: ${command}`);
                    await process?.executeWait(command);
                }
            }

            let buildParams = this.buildFor?.buildOptions?.extraWafBuildArgs || [];
            if (this.buildFor?.buildOptions?.upload) { buildParams.push("--upload"); }

            //Ok build it!
            this.info(`Running build for ${this.buildFor.target} with params: ${buildParams.join(",")}`);
            await process?.executeWait(`./waf ${this.buildFor.buildBootloader ? "bootloader" : this.buildFor.target} ${buildParams.join(" ")}`);

            //Run any post build commands
            if (this.buildFor?.buildOptions?.postBuildCommands) {
                for (let command of this.buildFor.buildOptions.postBuildCommands) {
                    this.info(`Running post build command: ${command}`);
                    await process?.executeWait(command);
                }
            }

            process?.exit();
            this.info(`Build complete!`);
        });
    }

    async copyBinaries() {
        const copyTo = this.parseDirectory(this.buildFor.finalSteps?.copyBinaries);
        if (!copyTo) { return; }
        const cleanDirectory = this.buildFor.finalSteps?.cleanDirectory || false;

        this.info(`Copying binaries from ${this.binaryDirectory} to ${copyTo}`);

        if (cleanDirectory) {
            if (fs.existsSync(copyTo)) { fs.rmSync(copyTo, { recursive: true }); }
        }
        if (!fs.existsSync(copyTo)) { fs.mkdirSync(copyTo, { recursive: true }); }
        fs.cpSync(`${this.binaryDirectory}`, `${copyTo}`, { recursive: true });
    }

    async uploadToBoard() {
        return new Promise<void>(async (resolve, reject) => {
            if (!this.buildFor.finalSteps?.uploadToBoard) { return; }

            const file = this.parseDirectory(`${this.binaryDirectory}/${this.buildFor.finalSteps.uploadToBoard.binary}`);

            let args: string[] = this.buildFor.finalSteps.uploadToBoard.extraParams || [];
            if (this.buildFor.finalSteps.uploadToBoard.uploadDest) {
                args.push(`--port ${this.buildFor.finalSteps.uploadToBoard.uploadDest}`);
            }

            this.info(`Uploading ${file} to the board with arguments ${args.join(" ")}`);
            let process = new Process("bash");
            process.on(ProcessEvent.data, (data: any) => { this.info(data.toString()); });
            process.on(ProcessEvent.error, (error: any) => { this.error(error.toString()); });
            process.on(ProcessEvent.close, (code: any) => {
                this.verbose(`Exited with code: ${code}`);
                if (code == 0) { resolve(); } else { reject(`Upload failed with code ${code}`); }
            });
            process?.execute(`python ${this.ardupilotDirectory}/Tools/scripts/uploader.py ${args.join(" ")} ${file}`);
        });
    }

    async openMAVProxy() {
        return new Promise<void>(async (resolve, reject) => {
            if (!this.buildFor.finalSteps?.openMAVProxy) { return; }
            if (typeof this.buildFor.finalSteps.openMAVProxy == "boolean") { this.buildFor.finalSteps.openMAVProxy = {}; }

            let args: string[] = this.buildFor.finalSteps.openMAVProxy.extraParams || [];
            if (this.buildFor.finalSteps.openMAVProxy.master) {
                args.push(`--master ${this.buildFor.finalSteps.openMAVProxy.master}`);
            }
            if (this.buildFor.finalSteps.openMAVProxy.baudRate) {
                args.push(`--baudrate ${this.buildFor.finalSteps.openMAVProxy.baudRate}`);
            }

            this.info(`Opening MAVProxy to the board with arguments ${args.join(" ")}`);
            let process = new Process("bash");
            process.on(ProcessEvent.data, (data: any) => { this.info(data.toString()); });
            process.on(ProcessEvent.error, (error: any) => { this.error(error.toString()); });
            process.on(ProcessEvent.close, (code: any) => {
                this.verbose(`Exited with code: ${code}`);
                if (code == 0) { resolve(); } else { reject(`MAVProxy failed with code ${code}`); }
            });
            process?.execute(`mavproxy.py ${args.join(" ")}`);
        });
    }

    async build() {
        this.begin();
        this.info(`Begin building!`);
        try {
            //Get the repository ready
            await this.downloadRepo();
            await this.copyRepo();
            await this.processGit();

            //Get our Ardupilot SHA
            this._ardupilotSha = await Utility.getGitSha(this.ardupilotDirectory);

            //Modify the build
            await this.processLUABindings();
            await this.processLUA();
            await this.processHWDef();
            await this.processHWDefBootloader();
            await this.processParameters();
            await this.processBootloader();

            //Ok run the build!
            await this.runBuild();

            //Do any process build steps
            if (this.buildFor.finalSteps) {
                if (this.buildFor.finalSteps.copyBinaries) {
                    await this.copyBinaries();
                }
                if (this.buildFor.finalSteps.uploadToBoard) {
                    await this.uploadToBoard();
                }
                if (this.buildFor.finalSteps.openMAVProxy) {
                    if (this.buildFor.finalSteps.uploadToBoard) {
                        await new Promise((resolve) => { setTimeout(resolve, 5000); }); //Wait for the board to reboot
                    }
                    await this.openMAVProxy();
                }
            }

            //Done!
            this.complete(true);
        }
        catch (e) {
            this.error("Build failed!");
            this.complete(false, this.buildError = e as string);
            throw e;
        }
    }
}
