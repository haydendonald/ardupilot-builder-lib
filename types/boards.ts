import { Board } from "./board";
import { BuildLocation } from "./buildLocation";
export class Boards {
    static CubeOrange: Board = {
        friendlyName: "CubeOrange",
        board: "CubeOrange",
        hwDefDirectory: `${BuildLocation.buildFolder}/libraries/AP_HAL_ChibiOS/hwdef/CubeOrange`
    };
    static CubeOrangePlus: Board = {
        friendlyName: "CubeOrangePlus",
        board: "CubeOrangePlus",
        hwDefDirectory: `${BuildLocation.buildFolder}/libraries/AP_HAL_ChibiOS/hwdef/CubeOrangePlus`
    };
    static CubeNode: Board = {
        friendlyName: "CubeNode",
        board: "CubeNode",
        hwDefDirectory: `${BuildLocation.buildFolder}/libraries/AP_HAL_ChibiOS/hwdef/CubeNode`
    };
    static CubeNodeETH: Board = {
        friendlyName: "CubeNode ETH",
        board: "CubeNode-ETH",
        hwDefDirectory: `${BuildLocation.buildFolder}/libraries/AP_HAL_ChibiOS/hwdef/CubeNode-ETH`
    };



    // CubeBlack = "CubeBlack",
    // CubePurple = "CubePurple",
    // CubeYellow = "CubeYellow",
    // CubeBlue = "CubeBlue",
    // CubeGreen = "CubeGreen",
    // CubeRed = "CubeRed",
    // Cube = "Cube",
}