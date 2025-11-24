# A NodeJS library for building ArduPilot firmware
This is a NodeJS library written to programmatically build the ArduPilot firmware using the [waf](https://github.com/ArduPilot/waf) tool (see [building](https://ardupilot.org/dev/docs/building-the-code.html) for more information on the ArduPilot build system).

# Builder Features
### Multiple builds
Through the use of the `MultiBuilder` class multiple `BoardBuilder` can be specified, the `MultiBuilder` will only download the required repositories, and build all the boards with their own processes and event outputs.
### Custom default parameters 
The default parameter file can be modified, adding/removing them, replacing it entirely. This results in default parameters being baked into the firmware.
### Baked in LUA files
LUA files can be generated/added in the @ROMFS directory. This results in scripts that are baked into the firmware, no need for copying files to the device!
### Custom LUA bindings
The LUA bindings file can be modified. This is an advanced usage but it allows for custom bindings to exist without having to push them to master
### Custom HWDef
The boards HWDef file can be modified. This is an advanced usage but it allows for each build to have a different HWDef using the same board for example
### Event emitter outputs for the builds
Events can be used to get the current output of a build, useful when using an external tool to build firmware on the fly for example
### Copying binaries to a folder
When the build is finished the binaries can be copied automatically to a given directory.
### Uploading to the board (only supported for singular board builds)
When the build has completed, a given binary can be automatically flashed to the board
### Opening MAVProxy to the board
When the build has completed, MAVProxy can be automatically opened to the board
### Specific GIT repository
A specific git repository and branch can be given to the builder. This will be downloaded and used for the build
### Local GIT repository
A local git repository folder can be specified and this will be used for the build
### Temporary build folder
The repository will be copied into a temporary location where the build will occur. This allows for multiple builds to not interact with each other, using the same repository

# Examples
The following are examples of using this project to do some very handy things.
### [Build multiple board types](./examples/multipleBoardTypes.ts)
`npm run examples:multipleBoardTypes`

This example builds 4 firmware files as follows and copies them into the `output/<board>/<target>` directory.
1. `CubeOrange:plane`
2. `CubeOrange:Copter`
3. `CubeOrangePlus:plane`
4. `CubeOrangePlus:copter`

### [LUA builds](./examples/lua.ts)
`npm run examples:lua`

This example will build firmware for a Cube Orange and will include a hello world lua script with the username of the machine that built the firmware

# Dependencies
1. In general follow the requirements for building ArduPilot at [Building the Code](https://ardupilot.org/dev/docs/building-the-code.html)
2. [luacheck](https://github.com/mpeterv/luacheck)

# Future Goals
1. LUA compiler only include global functions that are actually used
2. Alert on duplicate global functions/variables
3. Proper require system -- Use require "file" to tell the compiler to include a LUA file
