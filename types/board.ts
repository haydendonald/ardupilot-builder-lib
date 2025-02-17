export interface Board {
    board: string; //The --board option during waf configure
    friendlyName: string; //The friendly name of the board
    hwDefDirectory: string; //The directory where the HWDef file is located, relative to the ardupilot directory
}