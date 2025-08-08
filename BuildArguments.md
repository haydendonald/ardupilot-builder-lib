# BuildArguments
The build arguments type can be used to override build options during compilation

One can either pass the `BuildArguments` type manually or use the `BuildArgumentsFromArgs()` function to generate the `BuildArguments` object from process arguments passed though `node process -- --argument1 --argument2` which will be as follows:

* `--help`: Get a list of available parameters
* `--buildBootloader=[true|false]`: Should the bootloader be built
* `--resetRepo=[true|false]`: Should the repository be reset when it's copied to the build folder. Set to false if you are editing files within the repo directory
* `--enableLUA=[true|false]`: Should LUA be enabled
* `--hwDef="hwdef1,hwdef2"`: Add extra HWDef lines to the build
* `--parameters=param1,value,param2,value...`: Add baked default parameters to the build
* `--uploadToBoard=true|false or --uploadToBoard=dest,binary,uploadParam1,uploadParam2,...`: Upload to the board
* `--openMAVProxy=true|false or --openMAVProxy=master,baudRate,extraParams`: Open MAVProxy to the board after flashing