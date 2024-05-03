local bruterPath = package.cpath and (debug.getinfo(1).source:match("@?(.*/)")) or "";

-- if already not in the path add it
if (package.terrapath and not (string.find(package.terrapath, bruterPath .. "lib/?/?.t", 1, true))) or (not (string.find(package.path, bruterPath .. "lib/?/?.t", 1, true))) then
    if package.terrapath then
        package.terrapath = package.terrapath .. bruterPath .. "?.t;" .. bruterPath .. "src/?.t;" .. bruterPath .. "src/?/?.t;"
        package.terrapath = package.terrapath .. bruterPath .. "?.lua;" .. bruterPath .. "src/?.lua;" .. bruterPath .. "src/?/?.lua;"
        package.terrapath = package.terrapath .. bruterPath .. "lib/?.lua;" .. bruterPath .. "lib/?/?.lua;"
        package.terrapath = package.terrapath .. bruterPath .. "lib/?.t;" .. bruterPath .. "lib/?/?.t;"
    else 
        package.path = package.path .. bruterPath .. "?.t;" .. bruterPath .. "src/?.t;" .. bruterPath .. "src/?/?.t;"
        package.path = package.path .. bruterPath .. "?.lua;" .. bruterPath .. "src/?.lua;" .. bruterPath .. "src/?/?.lua;"
        package.path = package.path .. bruterPath .. "lib/?.lua;" .. bruterPath .. "lib/?/?.lua;"
        package.path = package.path .. bruterPath .. "lib/?.t;" .. bruterPath .. "lib/?/?.t;"
    end
end

local br = require("br");

return br