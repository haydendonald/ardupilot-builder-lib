import { Process, ProcessEvent } from "./process";
export class Utility {
    static get randomString(): string {
        return Math.random().toString(36).substring(2);
    }

    /**
     * Get the git sha of a git repository
     * @param directory The directory to get the git sha from
     * @returns The git sha
     */
    static getGitSha(directory: string): Promise<string> {
        const process = new Process("bash", undefined, directory);
        return new Promise<string>((resolve, reject) => {
            let exited = false;
            process.on(ProcessEvent.data, (data: any) => { exited = true; resolve(data.toString().trim().substring(0, 6)); });
            process.on(ProcessEvent.error, (error: any) => { exited = true; reject(error); });
            process.on(ProcessEvent.close, (code: any) => {
                if (!exited) { reject(`Exited with code ${code}`); }
            });
            process?.execute(`git rev-parse HEAD`, true);
        });
    }

    /**
     * Remove special characters from a string
     * @param input The input string
     * @returns The output string
     */
    static removeSpecialCharacters(input: string): string {
        return input.replace(/[/\\?\/%*:|"<>]/g, "").replace(/ /g, "_");
    }

    /**
     * Get a process argument from the command line as --argument=value
     * @param argument The argument to get
     * @returns The value of the argument or undefined if it doesn't exist
     */
    static getProcessArgument(argument: string): string | undefined {
        const args = process.argv.filter((val) => { return val.includes(`--${argument}`) });
        if (args.length > 0) {
            const splitArg = args[0].split("=");
            return splitArg.length > 1 ? splitArg[1] : undefined;
        }
        return undefined;
    }

    /**
     * If the configuration file has --argument=true or --argument is passed in the command line, return true
     * @param argument
     * @return true if the argument is set to true or if the argument is passed in the command line, false is set to false, and undefined if not passed
     */
    static booleanProcessArgument(argument: string): boolean | undefined {
        if (process.argv.includes(`--${argument}=false`)) { return false; }
        return process.argv.includes(`--${argument}`) || process.argv.includes(`--${argument}=true`) ? true : undefined;
    }
}