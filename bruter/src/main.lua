-- gets the bruter path
-- gets the bruter path
-- gets the bruter path
local bruterPath = debug.getinfo(1).source:match("@?(.*/)");
--remove the "src/"
bruterPath = string.sub(bruterPath, 1, #bruterPath-4);

-- add the path to the terralib
-- add the path to the terralib
-- add the path to the terralib
if package.terrapath then
    package.terrapath = package.terrapath .. bruterPath .. "?.t;" .. bruterPath .. "src/?.t;" .. bruterPath .. "src/?/?.t;"
    package.terrapath = package.terrapath .. bruterPath .. "?.lua;" .. bruterPath .. "lib/?.lua;" .. bruterPath .. "lib/?/?.lua;"
else 
    package.path = package.path .. bruterPath .. "?.t;" .. bruterPath .. "src/?.t;" .. bruterPath .. "src/?/?.t;"
    package.path = package.path .. bruterPath .. "?.lua;" .. bruterPath .. "lib/?.lua;" .. bruterPath .. "lib/?/?.lua;"
end

-- brutevm
-- brutevm
-- brutevm
br = require "br"

-- parse the compiler/interpreter arguments
-- parse the compiler/interpreter arguments
-- parse the compiler/interpreter arguments
if br.utils.table.includes(arg, "--debug") then
    br.vm.debug = true;
    local position = br.utils.table.find(arg, "--debug");
    print(br.utils.console.colorstring("[WARNING]", "magenta") .. ": Debug mode enabled");
    table.remove(arg, position);
end

-- set the output path if specified
-- set the output path if specified
-- set the output path if specified
if br.utils.table.includes(arg, "-o") or br.utils.table.includes(arg, "--output") then
    local temp = br.utils.table.find(arg, "-o") or br.utils.table.find(arg, "--output")
    br.vm.outputpath = arg[temp + 1]
    table.remove(arg, temp)
    table.remove(arg, temp)
end

-- check for help and version flags
-- check for help and version flags
-- check for help and version flags
if br.utils.table.includes(arg, "-v") or br.utils.table.includes(arg, "--version") then
    print("bruter version " .. br.vm.version)
    os.exit(0)
elseif br.utils.table.includes(arg, "--help") or br.utils.table.includes(arg,"-h") then
    print("Usage: bruter <source file> [-o <output file>] [-h] [-v] [--help] [--version] [--debug]")
    print("Options:")
    print("  --help    Display this information")
    print("  -h        Display this information")
    print("  --version Display the version")
    print("  -v        Display the version")
    print("  --output  Output the compiled file to the specified path")
    print("  -o        Output the compiled file to the specified path")
    print("  --debug   Enable debug mode")
    print("  --debug-code   Enable debug code mode")
    print("  --debug-command   Enable debug command mode")
    os.exit(0)
elseif arg[1] == nil then
    --print("No source file specified, starting in REPL instead...")
    br.repl()
    os.exit(0)
end

-- read and clean the source file
-- read and clean the source file
-- read and clean the source file
br.vm.source = br.utils.file.load.text(arg[1]);

-- run the parser
-- run the parser
-- run the parser
br.vm.parse(br.vm.source);

-- save the output if specified
-- save the output if specified
-- save the output if specified
if br.vm.outputpath ~= "" and terralib.saveobj then
    terralib.saveobj(br.vm.outputpath, br.exports, nil, nil, true);
end