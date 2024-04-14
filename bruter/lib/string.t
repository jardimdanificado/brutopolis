local list = require("lib.list")
local c = terralib.includecstring([[
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
]])

local String = list(int8)
local StringList = list(String)

terra String.methods.fromString(str: rawstring)
    var result:String = String.new();
    for i = 0, c.strlen(str) do
        result:push(str[i]);
    end
    return result;
end

local print0 = terra(self: String)
    for i = 0, self:size() do
        c.printf("%c", self:get(i));
    end
    c.printf("\n");
end

local print1 = terra(self: String, prefix: rawstring)
    if prefix ~= nil then
        c.printf("%s", prefix);
    end
    for i = 0, self:size() do
        c.printf("%c", self:get(i));
    end
    c.printf("\n");
end

local print2 = terra(self: String, prefix: rawstring, suffix: rawstring)
    if prefix ~= nil then
        c.printf("%s", prefix);
    end
    for i = 0, self:size() do
        c.printf("%c", self:get(i));
    end
    if suffix ~= nil then
        c.printf("%s", suffix);
    end
    c.printf("\n");
end

String.methods.print = terralib.overloadedfunction("strprint",{print0, print1, print2})

terra String:charAt(index: int)
    return self:get(index);
end

terra String:getCString()
    return self.array;
end

terra String:replace(target: String, replacement: String)
    var result:String = String.new();
    var targetSize = target:size();
    var sourceSize = self:size();

    var i = 0;
    while i < sourceSize do
        if self:get(i) == target:get(0) then
            var match = true;
            for j = 1, targetSize - 1 do
                if self:get(i + j) ~= target:get(j) then
                    match = false;
                    break;
                end
            end
            if match then
                result:concat(replacement);
                i = i + targetSize - 1;
            else
                result:push(self:get(i));
            end
        else
            result:push(self:get(i));
        end
        i = i + 1;
    end
    self.array = result.array;
end

terra String:split(delimiter: String)
    var result:StringList = StringList.new();
    var sourceSize = self:size();
    var delimiterSize = delimiter:size();
    var current:String = String.new();
    var i = 0;
    while i < sourceSize do
        if self:get(i) == delimiter:get(0) then
            var match = true;
            for j = 1, delimiterSize - 1 do
                if self:get(i + j) ~= delimiter:get(j) then
                    match = false;
                    break;
                end
            end
            if match then
                result:push(current);
                current = String.new();
                i = i + delimiterSize - 1;
            else
                current:push(self:get(i));
            end
        else
            current:push(self:get(i));
        end
        i = i + 1;
    end
    result:push(current);
    return result;
end

return String