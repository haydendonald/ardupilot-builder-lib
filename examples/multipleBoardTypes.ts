/**
 * This is an example of using the MultiBoard builder to build multiple boards at once.
 * 
 * It wil build a CubeOrange and CubeOrangePlus board for the plane and copter targets
 * 
 */

import { Board } from "../types/board";
import { Target } from "../types/target";
import { Boards } from "../types/boards";
import { Build } from "../types/build";
import { BoardBuilder } from "../boardBuilder";
import { MultiBuilder } from "../multiBuilder";

const boardTypes: { board: Board, target: Target }[] = [
    {
        board: Boards.CubeOrange,
        target: Target.plane
    },
    {
        board: Boards.CubeOrangePlus,
        target: Target.plane
    },
    {
        board: Boards.CubeOrange,
        target: Target.copter
    },
    {
        board: Boards.CubeOrangePlus,
        target: Target.copter
    }
];

async function run() {
    //Generate our list of board builder to build based on the boardTypes above
    const boards: Build[] = boardTypes.map((boardType) => {
        return {
            board: boardType.board,
            target: boardType.target,
            gitRepo: { remote: BoardBuilder.ardupilotRepo },

            //As a final step copy the binaries to an output folder
            finalSteps: {
                copyBinaries: `./output/${boardType.board.friendlyName}/${boardType.target}`
            }
        }
    });

    const multiBuilder = new MultiBuilder(boards)

    //Setup some event listeners to log out the progress
    multiBuilder.on(MultiBuilder.begin, (scope: BoardBuilder) => {
        console.log(`Begin building ${scope ? 'on ' + scope.name : ''}`);
    });
    multiBuilder.on(MultiBuilder.complete, (success, failureReason, scope) => {
        console.log(`Finished building ${scope ? 'on ' + scope.name : ''}`);
        console.log({ success, failureReason, name: scope?.name });
    });

    multiBuilder.on(MultiBuilder.error, (error, scope) => {
        console.log(`error ${scope ? '[' + scope.name + ']' : ''} -> ${error}`);
    });

    multiBuilder.on(MultiBuilder.info, (info, scope) => {
        console.log(`info ${scope ? '[' + scope.name + ']' : ''} -> ${info}`);
    });

    multiBuilder.on(MultiBuilder.verbose, (info, scope) => {
        console.log(`verbose ${scope ? '[' + scope.name + ']' : ''} -> ${info}`);
    });

    multiBuilder.on(MultiBuilder.allComplete, (success, failure) => {
        console.log(`All builds complete: ${success.length} successful, ${failure.length} failed`);
        console.log({ success, failure });
    });

    //Start the build
    await multiBuilder.build();
}
run();