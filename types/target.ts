//TODO: Generate this on the fly from the ardupilot repo ./waf list
export enum Target {
    copter = "copter",
    heli = "heli",
    plane = "plane",
    rover = "rover",
    sub = "sub",
    antennatracker = "antennatracker",
    AP_Periph = "AP_Periph"
}

export const targets = [Target.copter, Target.heli, Target.plane, Target.rover, Target.sub, Target.antennatracker, Target.AP_Periph];