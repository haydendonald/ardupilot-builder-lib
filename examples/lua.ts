/**
 * This is an example of building a board with LUA scripts
 * 
 * It wil build a CubeOrange with plane and include a hello world LUA script
 */

import { Target } from "../types/target";
import { Boards } from "../types/boards";
import { Build } from "../types/build";
import { BoardBuilder } from "../boardBuilder";

const username = require("os").userInfo().username;
const build: Build = {
    board: Boards.CubeOrange,
    target: Target.plane,
    gitRepo: { remote: BoardBuilder.ardupilotRepo },

    //Define our LUA files to include
    lua: {
        luaFiles: [
            {
                helperFunctions: [
                    //Programmatically generate "hello, <username>" to print
                    (() => {
                        return `local text = Hello, ${username}`
                    })()
                ],
                file: `./examples/include/hello_world.lua`,
                outputName: 'hello_world_generated.lua',
                validateSyntax: true
            }
        ]
    },

    //As a final step copy the binaries to an output folder
    finalSteps: {
        copyBinaries: `./output`
    }
}
const builder = new BoardBuilder(build);

//Run the build
async function run() {
    //Setup some event listeners to log out the progress
    builder.on(BoardBuilder.begin, () => {
        console.log(`Begin building`);
    });
    builder.on(BoardBuilder.complete, (success, failureReason) => {
        console.log(`Finished building`);
        console.log({ success, failureReason });
    });

    builder.on(BoardBuilder.error, (error) => {
        console.log(`error -> ${error}`);
    });

    builder.on(BoardBuilder.info, (info) => {
        console.log(`info -> ${info}`);
    });

    builder.on(BoardBuilder.verbose, (info) => {
        console.log(`verbose -> ${info}`);
    });

    //Start the build
    await builder.build();
}
run();