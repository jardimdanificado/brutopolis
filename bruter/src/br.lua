-- bruter module
-- bruter module
-- bruter module
local _bruterPath = debug.getinfo(1).source;

if not terralib then
    --package.terrapath = package.path;
    terralib = {
        loadfile = loadfile,
        loadstring = loadstring,
    }
end

local br = 
{
    global = _G,
    -- compiled objects exports
    exports = {},

    -- other
    ["//"] = function()end,
    utils = require("lib.luatils"),
    -- preprocessors
    -- preprocessors
    -- preprocessors
    vm = 
    {
        -- version
        version = "0.2.6s",
        -- source and outputs
        source = "",
        outputpath = "",
        -- current path
        bruterpath = string.sub(_bruterPath, 2, #_bruterPath-8),
        -- debug mode
        debug = false,
        funcdata = {},
        preprocessors = {}
    },
}

br.this = br;

br.vm.safe = function()
    local function safeMessage()
        print(br.utils.console.colorstring("[SAFE MODE]", "green") .. ": this is safe bruter!");
    end
    br.lua.eval = safeMessage;
    br.lua.include = safeMessage;
    br.lua.require = safeMessage;
    if br.C then
        br.C.include = safeMessage;
        br.C.eval = safeMessage;
    end
    br.global = nil;
    br.this = nil;
    br.using = safeMessage;
    br.bruter.eval = safeMessage;
    br.bruter.include = safeMessage;
    for k,v in pairs(br.utils.file.load) do
        br.utils.file.load[k] = safeMessage;
    end
    br.utils.file.exist = safeMessage;
    br.utils.file.check = safeMessage;
    br.utils.load = safeMessage;
    print(br.utils.console.colorstring("[SAFE MODE]","green") .. ": bruter safe mode enabled!");
end

br.vm.preprocessors.sugar = function(source)
    local nstr = br.utils.string.replace3(source, "%s+"," ")
    
    nstr = br.utils.string.replace(nstr, "%}", "%} ")
    nstr = br.utils.string.replace(nstr, "%{", " %{")
    nstr = br.utils.string.replace(nstr, "%( ", "%(")
    nstr = br.utils.string.replace(nstr, " %)", "%)")
    nstr = br.utils.string.replace(nstr, "%(", " %(")
    nstr = br.utils.string.replace3(nstr, "//", "// ")
    
    
    --if the first two chars are " (" remove the space
    if string.byte(nstr,1) == 32 and string.byte(nstr,2) == 40 then
        nstr = string.sub(nstr, 2, #nstr);
    end
    
    nstr = br.utils.string.replace3(nstr, "\t", " ")
    nstr = br.utils.string.replace3(nstr, "\n", " ")
    nstr = br.utils.string.replace3(nstr, "  ", "")


    nstr = br.utils.string.replace3(nstr, ":$", ": $")
    
    nstr = br.utils.string.replace(nstr, "; ", ";")
    nstr = br.utils.string.replace(nstr, " ;", ";")
    nstr = br.utils.string.replace(nstr, " ; ", ";")
    
    -- if last char not ; add it
    if string.byte(nstr, #nstr) ~= 59 then
        nstr = nstr .. ";";
    end
    
    return nstr
end

-- math and logic functions
-- math and logic functions
-- math and logic functions

br.math = {};

br["+"] = function(a,b) return a + b; end
br["-"] = function(a,b) return a - b; end
br["*"] = function(a,b) return a * b; end

br["/"] = function(a,b) return a / b; end
br["^"] = function(a,b) return a ^ b; end
br["%"] = function(a,b) return a % b; end

br["<"] = function(a,b) return a < b; end
br["<="] = function(a,b) return a <= b; end
br[">"] = function(a,b) return a > b; end
br[">="] = function(a,b) return a >= b; end

br["=="] = function(a, b)
    return (a == b) and true or false;
end

br["!="] = function(a,b) return a ~= b; end

br["includes"] = function(a,b) 
    return br.utils.table.includes(a,b); 
end

br["exists"] = function(...)
    for k,v in pairs({...}) do
        if not v then
            return false;
        end
    end
    return true;
end

-- parse the arguments
-- parse the arguments
-- parse the arguments
br.vm.parsearg = function(larg)
    local result = larg;

    if larg == nil or larg == "" then
        return nil;
    end

    -- if a variable, get it
    if string.byte(larg,1) == 36 then -- variable
        local name = br.utils.string.replace(larg, "%$", '');
        name = br.vm.parsearg(name);
        result = br.vm.recursiveget(name);

    -- if a sentence enclose by parentesis, remove them and parse it
    elseif string.byte(larg,1) == 40 then -- sentence
        result = br.vm.parse(string.sub(larg, 2, #larg - 1),true);
    
    -- if enclose by keys {} or backticks remove them
    elseif string.byte(larg,1) == 96 or string.byte(larg,1) == 123 then
        result = string.sub(larg, 2, #larg - 1);
        
    -- if a number
    elseif (string.byte(larg,1) > 47 and string.byte(larg,1) < 58) or (string.byte(larg,1) == 45 and (#larg > 1 and string.byte(larg,2) > 47 and string.byte(larg,2) < 58)) then -- number
        result = tonumber(larg);

    elseif larg == "true" then
        result = true;

    elseif larg == "false" then
        result = false;

    elseif larg == "nil" then
        result = nil;
    end
    
    return result;
end

br.vm.parseargs = function(args)
    local newargs = args;
    for i = 1, #args do
        newargs[i] = br.vm.parsearg(args[i]);
    end
    return newargs;
end

-- preprocess the source
-- preprocess the source
-- preprocess the source
br.vm.preprocess = function(_src)
    local result = _src .. '';
    for k, v in pairs(br.vm.preprocessors) do
        result = v(result);
    end
    return result;
end

br.vm.debugprint = function(...)
    if br.vm.debug then
        print(...);
    end
end

-- parse the source file
-- parse the source file
-- parse the source file
br.vm.parse = function(src, isSentence)
    if isSentence then 
        src = "vm.fakeset " .. src;
    end
    src = br.vm.preprocess(src);
    local splited = br.utils.string.split3(src, ";");
    local func = "";
    for i = 1, #splited - 1 do
        br.vm.debugprint(br.utils.console.colorstring("[DEBUG CODE]", "cyan") .. ": " .. splited[i]);
        local splited_args = br.utils.string.split3(splited[i], " ");

        local func = splited_args[1];
        table.remove(splited_args, 1);

        if func == "" or func == nil or splited[i] == "" or splited[i] == "%s+" then
            br.vm.debugprint(br.utils.console.colorstring("[DEBUG FAIL]", "red") .. ": empty command, skipping");
        else 
            -- first char is a variable or or a sentence it parse it as arg first, else, its a funcion name
            if string.byte(func,1) == 36 or string.byte(func,1) == 40 or string.byte(func,1) == 96 or string.byte(func,1) == 123 or (string.byte(func,1) > 47 and string.byte(func,1) < 58) or (string.byte(func,1) == 45 and (#func > 1 and string.byte(func,2) > 47 and string.byte(func,2) < 58)) then
                func = br.vm.parsearg(func);
            end

            if func == "//" then
                --br.vm.debugprint(br.utils.console.colorstring("[DEBUG INFO]", "yellow") .. ": command is a commentary, skipping");
            else
                local args = br.vm.parseargs(splited_args);
                local _function = type(func) == "function" and func or br.vm.recursiveget(func);

                if _function and isSentence then
                    
                    -- command debbuger
                    if br.vm.debug then
                        br.vm.debugprint(func .. "{")
                        for k,v in pairs(splited_args) do
                            br.vm.debugprint("    " .. k .. " =",v);
                        end
                        br.vm.debugprint("}");
                    end
                    
                    -- in a sentence the code execution stops on the first return it gets
                    local result = _function(br.utils.table.unpack(args or {}));
                    
                    if result then
                        return result;
                    end

                elseif _function then
                    if br.vm.debug then
                        -- command debbuger
                        br.vm.debugprint(func .. "{")
                        for k,v in pairs(splited_args) do
                            br.vm.debugprint("    " .. k .. " =",v);
                        end
                        br.vm.debugprint("}");
                    end
                    
                    _function(br.utils.table.unpack(args or {}));
                elseif br.exit then -- if on repl
                    if br.vm.debug then
                        br.vm.debugprint(br.utils.console.colorstring("Error", "red") .. " parsing the following code:");
                        br.vm.debugprint(src);
                    end
                    br.vm.debugprint(br.utils.console.colorstring("[DEBUG FAIL]", "red") .. ": function " .. func .. " not found\n");
                else
                    if br.vm.debug then
                        br.vm.debugprint(br.utils.console.colorstring("Error", "red") .. " parsing the following code:");
                        br.vm.debugprint(splited[i]);
                    end
                    br.vm.debugprint("unamed function, ignoring command " .. i);
                end
            end
        end
    end
end

br.repl = function(message, inputFunction)
    message = message or "bruter v" .. br.vm.version.. " (" .. ((terralib.version and ("Terra " .. terralib.version .. " + " .. _VERSION)) or _VERSION) .. ")";
    inputFunction = inputFunction or io.read;
    
    --exit function
    br.vm._replExit = false;
    
    br.exit = function()
        br.vm._replExit = true;
    end
    
    -- version, only print if not in a breakpoint repl
    print(message);

    local line = "";
    local count = 0;
    while not br.vm._replExit do
        io.write("br> ");
        local buffer = inputFunction();
        local clearbuffer = br.utils.string.replace(buffer, "%s+", "");
        local ok = true;

        if br.utils.string.includes(buffer, "`") then
            for i = 1, #buffer do
                if buffer:sub(i, i) == "`" then
                    count = count + 1;
                end
            end

            if count % 2 ~= 0 then
                ok = false;
            else
                count = 0;
            end
        end

        if string.byte(clearbuffer,#clearbuffer) == 59 and ok then
            br.vm.parse(line .. buffer);
            line = "";
        else
            line = line .. buffer;
        end
    end
end

br.breakpoint = function(inputFunction)
    if not br.vm.debug then
        print(br.utils.console.colorstring("[WARNING]", "red") .. ": a breakpoint been ignored because debug mode is not enabled.");
        return;
    end
    br.vm._inBreakpoint = true;

    br.repl(br.utils.console.colorstring("[BREAKPOINT]", "red") .. ": entering breakpoint repl, type 'exit' to continue", inputFunction);
    if br.vm.debug then
        print(br.utils.console.colorstring("[BREAKPOINT DONE]", "green") .. ": continuing execution");
    else
        print("\n" .. br.utils.console.colorstring("[BREAKPOINT DONE]", "yellow") .. ": continuing execution, but debug mode is not enabled anymore, so breakpoints will be ignored.\n");
    end

    br.vm._inBreakpoint = false;
end

-- module functions
-- module functions
-- module functions

-- export
br.export = function(name, as, other)
    if as == "as" then
        br.exports[other] = br[name];
    elseif as then
        br.exports[as] = br[name];
    else
        br.exports[name] = br[name];
    end
end

br.using = function(name)
    -- new 
    if br.utils.file.exist(br.vm.bruterpath .. "libr/" .. name .. "/" .. name .. ".br") then
        br.bruter.include(br.vm.bruterpath .. "libr/" .. name .. "/" .. name .. ".br");
    elseif br.utils.file.exist(br.vm.bruterpath .. "libr/" .. name .. "/" .. name .. ".lua") then
        terralib.loadfile(br.vm.bruterpath .. "libr/" .. name .. "/" .. name .. ".lua")();
    elseif br.utils.file.exist(br.vm.bruterpath .. "libr/" .. name .. "/" .. name .. ".t") then
        terralib.loadfile(br.vm.bruterpath .. "libr/" .. name .. "/" .. name .. ".t")();
    elseif br.utils.file.exist(br.vm.bruterpath .. "libr/" .. name .. ".br") then
        br.bruter.include(br.vm.bruterpath .. "libr/" .. name .. ".br");
    elseif br.utils.file.exist(br.vm.bruterpath .. "libr/" .. name .. ".lua") then
        terralib.loadfile(br.vm.bruterpath .. "libr/" .. name .. ".lua")();
    elseif br.utils.file.exist(br.vm.bruterpath .. "libr/" .. name .. ".t") then
        terralib.loadfile(br.vm.bruterpath .. "libr/" .. name .. ".t")();
    else
        br.vm.debugprint(br.utils.console.colorstring("[ERROR]", "red") .. ": library not found: " .. name);
    end
end

br.bruter = {};

br.bruter.include = function(path)
    local c = br.utils.file.load.text(path);
    br.vm.parse(c);
end

br.bruter.eval = function(str)
    br.vm.parse(str);
end



br["lua"] = {};

-- loadstring (lua/terra)
br["lua"].eval = function(str)
    br.vm.debugprint(br.utils.console.colorstring("[DEBUG INFO]", "magenta") .. ": loading string: " .. str)
    return ((terralib.loadstring(str))());
end

-- loadfile (lua/terra)
br["lua"].include = function(path)
    return(terralib.loadfile(path)());
end

-- require lua/terra file
br["lua"].require = function(path)
    return require(path);
end



br.C = {};

-- include C code
br.C.include = function(path)
    return terralib.includec(path);
end

-- include C string
br.C.eval = function(txt)
    return terralib.includecstring(txt);
end

-- setter
-- setter
-- setter
br.vm.recursiveset = function(argname, value)
    if br.utils.string.includes(argname, ".") then
        local result = br
        local splited = br.utils.string.split2(argname, ".")
        local lastKey = table.remove(splited)  -- Remove the last key to set its value later
        
        for i, key in ipairs(splited) do
            if key ~= "" then
                key = br.vm.parsearg(key)
                if result[key] == nil then
                    -- Create nested table if key doesn't exist
                    result[key] = {}
                elseif type(result[key]) ~= "table" then
                    -- If a non-table value exists in the middle of the path, cannot proceed
                    return
                end
                result = result[key]
            end
        end
        
        -- Set the value of the last key
        result[br.vm.parsearg(lastKey)] = value
        
        return
    else
        br[argname] = value
    end
end


-- getter
-- getter
-- getter
br.vm.recursiveget = function(argname)
    if br.utils.string.includes(argname, ".") then
        local result = br
        local splited = br.utils.string.split2(argname, ".")
        
        for _, key in ipairs(splited) do
            if key ~= "" then
                key = br.vm.parsearg(key);
                result = result[key]
                if result == nil then
                    return nil  -- Key not found, return nil
                end
            end
        end
        
        return result
    else
        return br[argname]
    end
end


-- set
br.vm.setvalue = function(varname, value, ...)
    br.vm.recursiveset(varname,value);
    return value;
end

br.vm.setfrom = function(varname, funcname, ...)
    local args = {...};
    local result;
    if type(funcname) == "string" then
        result = br.vm.recursiveget(funcname);
        if type(result) == "function" then
            result = result(br.utils.table.unpack(args or {}));
        else
            print(br.utils.console.colorstring("[WARN]", "magenta") .. ": setfrom: " .. funcname .. " is not a function");
        end
    elseif type(funcname) == "function" then
        result = funcname(br.utils.table.unpack(args or {}));
    end
    br.vm.recursiveset(varname, result);
    return result;
end

br.vm.fakesetfrom = function(funcname, ...)
    local args = {...};
    local result;
    if type(funcname) == "string" then
        result = br.vm.recursiveget(funcname);
        if type(result) == "function" then
            result = result(br.utils.table.unpack(args or {}));
        else
            print(br.utils.console.colorstring("[WARN]", "magenta") .. ": fakesetfrom: " .. funcname .. " is not a function");
        end
    elseif type(funcname) == "function" then
        result = funcname(br.utils.table.unpack(args or {}));
    end
    return result;
end

br.vm.fakeset = function(value, ...)
    if #({...}) > 0 then
        return br.vm.fakesetfrom(value, ...);
    elseif type(value) == "function" then
        return br.vm.fakesetfrom(value, ...);
    else
        local target = br.vm.recursiveget(value);
        if target then
            if type(target) == "function" then
                return br.vm.fakesetfrom(value, ...);
            end
        end
    end
    return value;
end

-- set
br.set = function(varname, value, ...)
    if value == "from" then
        br.vm.setfrom(varname, ...);
    else
        br.vm.recursiveset(varname,value);
    end
end

br.obj = function(...)
    local args = {...};
    local obj = {};
    for i = 1, #args, 2 do
        obj[args[i]] = args[i + 1];
    end
    return obj;
end

br["return"] = function(value)
    return value;
end

br[":"] = function(value)
    return value;
end

--string functions
--string functions
--string functions

br.string = function(...)
    local str = "";
    for i,v in pairs({...}) do
        str = str .. v;
    end
    return str;
end

-- data list functions
-- data list functions
-- data list functions

br.help = function(target)

    local organize = {tables = {}, functions = {}, numbers = {}, strings = {}, booleans = {}, userdata = {}, other = {}};
    
    if type(target) == "string" then
        target = br.vm.recursiveget(target);

    elseif type(target) == "nil" then
        target = br;
    end

    br.vm.debugprint(br.utils.console.colorstring("[HELP INFO]", "magenta") .. ": help for (" .. type(target) .. ")", target);
    
    if type(target) == "table" then
        for k,v in pairs(target) do 
            local color = "blue";
            if type(v) == "function" then
                color = "green";
                table.insert(organize.functions, k);
            elseif type(v) == "table" then
                color = "magenta";
                table.insert(organize.tables, k);
            elseif type(v) == "number" then
                color = "white";
                table.insert(organize.numbers, k);
            elseif type(v) == "string" then
                color = "yellow";
                table.insert(organize.strings, k);
            elseif type(v) == "boolean" then
                color = "cyan";
                table.insert(organize.booleans, k);
            elseif type(v) == "userdata" then
                color = "red";
                table.insert(organize.userdata, k);
            end
        end
        
        for k,v in pairs(organize) do
            br.utils.table.sort(v);
        end

        if #organize.tables > 0 then
            print(br.utils.console.colorstring("[", "magenta") .. "tables" .. br.utils.console.colorstring("]", "magenta") .. ":");
            for k,v in pairs(organize.tables) do
                print(br.utils.console.colorstring(v, "magenta"), target[v]);  
            end
        end

        if #organize.functions > 0 then
            print(br.utils.console.colorstring("[", "green") .. "functions" .. br.utils.console.colorstring("]", "green") .. ":");
            for k,v in pairs(organize.functions) do
                print(br.utils.console.colorstring(v, "green"), target[v]);  
            end
        end

        if #organize.numbers > 0 then
            print(br.utils.console.colorstring("[", "white") .. "numbers" .. br.utils.console.colorstring("]", "white") .. ":");
            for k,v in pairs(organize.numbers) do
                print(br.utils.console.colorstring(v, "white"), target[v]);  
            end
        end

        if #organize.strings > 0 then
            print(br.utils.console.colorstring("[", "yellow") .. "strings" .. br.utils.console.colorstring("]", "yellow") .. ":");
            for k,v in pairs(organize.strings) do
                --print(#v)
                if #target[v] > 32 then
                    print(br.utils.console.colorstring(v, "yellow"), string.sub(target[v], 1, 32) .. "...");
                else
                    print(br.utils.console.colorstring(v, "yellow"), target[v]);  
                end
                --print(br.utils.console.colorstring(v, "yellow"), target[v]);  
            end
        end

        if #organize.booleans > 0 then
            print(br.utils.console.colorstring("[", "cyan") .. "booleans" .. br.utils.console.colorstring("]", "cyan") .. ":");
            for k,v in pairs(organize.booleans) do
                print(br.utils.console.colorstring(v, "cyan"), target[v]);  
            end
        end

        if #organize.userdata > 0 then
            print(br.utils.console.colorstring("[", "red") .. "userdata" .. br.utils.console.colorstring("]", "red") .. ":");
            for k,v in pairs(organize.userdata) do
                print(br.utils.console.colorstring(v, "red"), target[v]);  
            end
        end

        if #organize.other > 0 then
            print(br.utils.console.colorstring("[", "blue") .. "other" .. br.utils.console.colorstring("]", "blue") .. ":");
            for k,v in pairs(organize.other) do
                print(br.utils.console.colorstring(v, "blue"), target[v]);  
            end
        end

        br.vm.debugprint(br.utils.console.colorstring("[HELP DONE]", "green") .. ": help for (" .. type(target) .. ")", target);

    else
        br.vm.debugprint(br.utils.console.colorstring("[HELP ERROR]", "red") .. ": invalid target for help function, target has type " .. type(target));    
    end
end

br.print = print;

br["[]"] = function(...)
    return {...};
end

br["if"] = function(condition, codestr, _else, codestr2)
    if type(condition) == "string" then
        condition = br.vm.parse(condition, true);
    end
    if condition then
        if type(codestr) == "string" then
            return br.vm.parse(codestr, true);
        elseif type(codestr) == "function" then
            return codestr();
        end
    else
        if _else then
            if type(_else) == "function" then
                return _else();
            elseif type(_else) == "string" and _else == "else" then
                if _else == "else" then
                    if type(codestr2) == "string" then
                        return br.vm.parse(codestr2, true);
                    elseif type(codestr2) == "function" then
                        return codestr2();
                    end
                else
                    return br.vm.parse(_else, true);
                end
            end
        end
    end
end

br["!"] = function(value)
    return not value;
end

br["while"] = function(condition, codestr)
    --print (condition, br.vm.parse(condition))
    local _cond = br.vm.parse(condition, true);
    
    while _cond do
        if type(codestr) == "string" then
            br.vm.parse(codestr, true);
        elseif type(codestr) == "function" then
            codestr();
        end
        _cond = br.vm.parse(condition, true);
    end
end

br["for"] = function(...)
    local args = {...};
    local init = args[1];
    local condition = args[2];
    local increment = args[3];
    local codestr = args[4];
    local other = args[5];

    if type(condition == "string") and condition == "in" then
        local target = increment;
        for k,v in pairs(target) do
            br.set(init, v);
            if type(codestr) == "string" then
                br.vm.parse(codestr, true);
            elseif type(codestr) == "function" then
                codestr();
            end
        end
        return;
    elseif type(increment == "string") and increment == "in" then
        local target = codestr;
        for k,v in pairs(target) do
            br.set(init, k);
            br.set(condition, v);
            if type(other) == "string" then
                br.vm.parse(other, true);
            elseif type(other) == "function" then
                other();
            end
        end
        return;
    end
    
    if type(init) == "string" then
        br.vm.parse(init, true);
    elseif type(init) == "function" then
        init();
    end

    local _cond = br.vm.parse(condition, true);
    while _cond do
        if type(codestr) == "string" then
            br.vm.parse(codestr, true);
        elseif type(codestr) == "function" then
            codestr();
        end

        if type(increment) == "string" then
            br.vm.parse(increment, true);
        elseif type(increment) == "function" then
            increment();
        end

        _cond = br.vm.parse(condition, true);
    end
end

br["function"] = function(...)

    local __args = {...};
    local name, argstr, codestr;
    
    if #__args == 2 then
        argstr = __args[1];
        codestr = __args[2];
    elseif #__args == 3 then
        name = __args[1];
        argstr = __args[2];
        codestr = __args[3];
    end
    
    local args = br.utils.string.split2(argstr, " ");

    local _func;

    if type(codestr) == "string" then
        _func = function()
            local result = br.vm.parse(codestr, true);
            return result;
        end;
    
    elseif type(codestr) == "function" then
        _func = function(...)
            return codestr(br.utils.table.unpack({...}));
        end;
    end

    local result = function(...)
        local globalbakcup = {}
        local _args = {...};
        
        for i,v in pairs(args) do
            globalbakcup[v] = br[v];
            br[v] = _args[i];
        end

        local result = _func();
        
        for i,v in pairs(args) do
            br[v] = globalbakcup[v];
        end
        
        return result;
    end

    if name then
        br.set(name, result);
    else  -- this is note working because
        return result;
    end
end

br["and"] = function(a,b)
    return(a and b);
end

br["or"] = function(a,b)
    return(a or b);
end

br["len"] = function(a)
    return #a;
end

if not package.terrapath then
    br.C = nil; -- removes the C api if running on lua
    br.exports = nil;
end

return br;
