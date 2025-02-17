import { Board } from "./board";
export class Boards {
    static CubeOrange: Board = {
        friendlyName: "CubeOrange",
        board: "CubeOrange",
        hwDefDirectory: `/libraries/AP_HAL_ChibiOS/hwdef/CubeOrange`
    };
    static CubeOrangePlus: Board = {
        friendlyName: "CubeOrangePlus",
        board: "CubeOrangePlus",
        hwDefDirectory: `/libraries/AP_HAL_ChibiOS/hwdef/CubeOrangePlus`
    };
    static CubeNode: Board = {
        friendlyName: "CubeNode",
        board: "CubeNode",
        hwDefDirectory: `/libraries/AP_HAL_ChibiOS/hwdef/CubeNode`
    };
    static CubeNodeETH: Board = {
        friendlyName: "CubeNode ETH",
        board: "CubeNode-ETH",
        hwDefDirectory: `/libraries/AP_HAL_ChibiOS/hwdef/CubeNode-ETH`
    };



    // CubeBlack = "CubeBlack",
    // CubePurple = "CubePurple",
    // CubeYellow = "CubeYellow",
    // CubeBlue = "CubeBlue",
    // CubeGreen = "CubeGreen",
    // CubeRed = "CubeRed",
    // Cube = "Cube",
}