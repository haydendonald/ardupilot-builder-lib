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

export function DefaultBinaries(target: Target): { elf: string, bin: string, apj: string } {
    function generateBinaries(name: string): { elf: string, bin: string, apj: string } {
        return {
            elf: `${name}.elf`,
            bin: `${name}.bin`,
            apj: `${name}.apj`
        };
    }

    switch (target) {
        case Target.copter: return generateBinaries("arducopter");
        case Target.heli: return generateBinaries("arducopter_heli");
        case Target.plane: return generateBinaries("ardupilot_plane");
        case Target.rover: return generateBinaries("ardurover");
        case Target.sub: return generateBinaries("ardusub");
        case Target.antennatracker: return generateBinaries("antennatracker");
        case Target.AP_Periph: return generateBinaries("AP_Periph");
    }
}