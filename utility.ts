import * as path from "path";
import { Process, ProcessEvent } from "./process";
export class Utility {
    static get baseDirectory(): string {
        return process.cwd();
    }

    static get repoDirectory(): string {
        return path.join(Utility.baseDirectory, "repos");
    }

    static get buildDirectory(): string {
        return path.join(Utility.baseDirectory, "build");
    }

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
}