import { BoardBuilder } from "./boardBuilder";
import { Process } from "./process";
import { Build } from "./types/build";
import { BuildArguments } from "./types/buildArguments";
import EventEmitter from "events";

export class MultiBuilder extends EventEmitter {
    /**
     * Info log message event
     * @param message The message
     * @param scope What board builder this message came from. Undefined for this multi builder
     * @event
     */
    static info = "info";
    /**
     * Error log message event
     * @param message The message
     * @param scope What board builder this message came from. Undefined for this multi builder
     * @event
     */
    static error = "error";
    /**
     * Warning log message event
     * @param message The message
     * @param scope What board builder this message came from. Undefined for this multi builder
     * @event
     */
    static warn = "warn";
    /**
     * Verbose log message event
     * @param message The message
     * @param scope What board builder this message came from. Undefined for this multi builder
     * @event
     */
    static verbose = "verbose";
    /**
     * Emitted when the build begins
     * @param scope What board builder this message came from. Undefined for this multi builder
     * @event
     */
    static begin = "begin";
    /**
     * Emitted when a board completes it's build
     * @param success If the build was successful or not
     * @param failureReason Why the build failed
     * @param scope What board builder this message came from. Undefined for this multi builder
     * @event
     */
    static complete = "complete";
    /**
     * Emitted when all build(s) complete
     * @param success If the build was successful or not
     * @param failure Why the build failed
     * @event
     */
    static allComplete = "allComplete";

    private builders: BoardBuilder[];
    private process: Process | undefined;

    get builds(): BoardBuilder[] {
        return this.builders;
    }

    /**
     * Constructor
     * @param builders The builders to use
     * @param args The arguments to pass to the build
     * @param consoleChannel The console channel to use. Default is verbose
     */
    constructor(builders: BoardBuilder[] | Build[], args?: BuildArguments, consoleChannel: "disabled" | "error" | "info" | "verbose" = "verbose") {
        super();

        //If we were passed boards, create builders from them
        //@ts-ignore
        if (!builders[0].build) {
            this.builders = builders.map((board) => new BoardBuilder(board as Build, args));
        }
        else {
            this.builders = builders as BoardBuilder[];
        }

        //Setup the events to pass through
        this.builders.forEach((builder) => {
            builder.on(BoardBuilder.begin, () => this.begin(builder));
            builder.on(BoardBuilder.complete, (success, reason) => this.complete(success, reason, builder));
            builder.on(BoardBuilder.error, (error) => this.error(error, builder));
            builder.on(BoardBuilder.warn, (warning) => this.warning(warning, builder));
            builder.on(BoardBuilder.info, (info) => this.info(info, builder));
            builder.on(BoardBuilder.verbose, (info) => this.verbose(info, builder));
        });

        //Print to console if enabled
        if (consoleChannel != "disabled") {
            function printToConsole(channel: string, color: string, message: string) {
                console.log(`\x1b[${color}m[${channel}][${new Date().toISOString()}] ${message}\x1b[0m`);
            }

            if (consoleChannel == "info" || consoleChannel == "verbose") {
                this.on(BoardBuilder.begin, (builder) => {
                    if (builder) { return; }
                    printToConsole("INFO", "34", "Begin building");
                });
                this.on(BoardBuilder.complete, (success, failureReason, builder) => {
                    if (builder) { return; }
                    printToConsole("INFO", "32", `Build ${success ? "successful" : "failed"}`);
                    console.log({ success, failureReason, builder });
                });
                this.on(BoardBuilder.info, (info, builder) => {
                    if (builder) { return; }
                    printToConsole("INFO", "36", info);
                });
            }

            if (consoleChannel == "error" || consoleChannel == "info" || consoleChannel == "verbose") {
                this.on(BoardBuilder.error, (error, builder) => {
                    if (builder) { return; }
                    printToConsole("ERROR", "31", error);
                });
                this.on(BoardBuilder.warn, (warning, builder) => {
                    if (builder) { return; }
                    printToConsole("WARN", "33", warning);
                });
            }

            if (consoleChannel == "verbose") {
                this.on(BoardBuilder.verbose, (info, builder) => {
                    if (builder) { return; }
                    printToConsole("VERBOSE", "35", info);
                });
            }
        }
    }

    /**
     * Emit an info message
     * @param message The message
     * @param scope The board builder this message came from. Leave undefined for this
     */
    private info(message: string, scope?: BoardBuilder): void {
        this.emit(MultiBuilder.info, message, scope);
    }

    /**
     * Emit an error message
     * @param message The message
     * @param scope The board builder this message came from. Leave undefined for this
     */
    private error(message: string, scope?: BoardBuilder): void {
        this.emit(MultiBuilder.error, message, scope);
    }

    /**
     * Emit a warning message
     * @param message The message
     * @param scope The board builder this message came from. Leave undefined for this
     */
    private warning(message: string, scope?: BoardBuilder): void {
        this.emit(MultiBuilder.warn, scope, message);
    }

    /**
     * Emit an verbose message
     * @param message The message
     * @param scope The board builder this message came from. Leave undefined for this
     */
    private verbose(message: string, scope?: BoardBuilder): void {
        this.emit(MultiBuilder.verbose, message, scope);
    }

    /**
     * The test has begun
     * @param scope The board builder this message came from. Leave undefined for this
     */
    private begin(scope?: BoardBuilder): void {
        this.emit(MultiBuilder.begin, scope);
    }

    /**
     * Emit a complete event for a specific build
     * @param success Was the build successful
     * @param buildError Set the build error if required
     * @param scope The board builder this message came from. Leave undefined for this
     */
    private complete(success: boolean, buildError?: string, scope?: BoardBuilder): void {
        this.emit(MultiBuilder.complete, success, buildError, scope);
    }

    /**
     * Emit an all complete event
     * @param success Successful build(s)
     * @param failure Failed build(s)
     */
    private allComplete(success: BoardBuilder[], failure: BoardBuilder[]): void {
        this.emit(MultiBuilder.allComplete, success, failure);
    }

    /**
     * Download all the repos we need to build
     * @returns A promise
     */
    private async downloadRepos() {
        //Store a list of repos we need to download
        let downloaders: BoardBuilder[] = [];
        let commands: string[] = [];
        for (let builder of this.builders) {
            if (commands.includes(builder.cloneRepoCommand)) { continue; }
            commands.push(builder.cloneRepoCommand);
            downloaders.push(builder);
        }

        //Ok run through and download them asynchronously
        this.info(`Downloading ${downloaders.length} repo(s) required by ${this.builders.length} builder(s)`);
        await Promise.all(downloaders.map((builder) => builder.downloadRepo()));
    }

    async build(runAsync: boolean = true) {
        this.info("Begin build!");
        await this.downloadRepos();
        if (runAsync) {
            await Promise.all(this.builders.map((builder => {
                return new Promise<void>(async (resolve) => {
                    try { await builder.build(); }
                    catch (e) { }
                    resolve();
                });
            })));
        }
        else {
            for (let builder of this.builders) {
                try { await builder.build(); }
                catch (e) { }
            }
        }

        //Print our results
        let success = [];
        let failed = [];
        for (let build of this.builders) {
            if (!build.buildError) { success.push(build); }
            else { failed.push(build); }
        }

        if (failed.length == 0) {
            this.info(`All ${this.builders.length} board(s) built successfully!`);
        }
        else {
            this.info(`${success.length}/${this.builders.length} board(s) were built successfully`);
            this.error(`${failed.length}/${this.builders.length} failed building`);
            for (let build of failed) {
                this.error(`${build.name} failed: ${build.buildError ?? "unknown"}`);
            }
        }

        this.allComplete(success, failed);

        //Destroy our process at the end
        this.process?.destroy();
    }
}