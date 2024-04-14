local _table = {}

_table.assign = function(obj1, obj2)
    for k, v in pairs(obj2) do
        obj1[k] = obj2[k]
    end
end

_table.len = function(obj)
    local count = 0
    for k, v in pairs(obj) do
        count = count + 1
    end
    return count
end

_table.add = function(arr1, arr2)
    for k, v in pairs(arr2) do
        arr1[k] = arr2[k] + arr2[k]
    end
end

_table.sub = function(arr1, arr2)
    for k, v in pairs(arr2) do
        arr1[k] = arr2[k] - arr2[k]
    end
end

_table.mul = function(arr1, arr2)
    for k, v in pairs(arr2) do
        arr1[k] = arr2[k] * arr2[k]
    end
end

_table.div = function(arr1, arr2)
    for k, v in pairs(arr2) do
        arr1[k] = arr2[k] / arr2[k]
    end
end

_table.mod = function(arr1, arr2)
    for k, v in pairs(arr2) do
        arr1[k] = arr2[k] % arr2[k]
    end
end

_table.merge = function(arr1,arr2)
    for k, v in pairs(arr2) do
        arr1[k] = arr2[k]
    end
end

_table.recurse = function (arr,subname)
    return tonumber(arr[subname]) or arr[subname]
end

_table.keys = function(arr)
    local result = {
        insert = table.insert
    }
    for key, value in pairs(arr) do
        result:insert(key)
    end
    return result
end

_table.move = function(tbl, fromIndex, toIndex)
    fromIndex = fromIndex or 0
    toIndex = toIndex or 0
    if type(tbl) ~= "table" then
        error("The provided argument is not a table.")
    end

    if fromIndex == toIndex or fromIndex < 1 or toIndex < 1 or fromIndex > #tbl + 1 or toIndex > #tbl + 1 then
        -- No need to move if the indices are the same or out of range.
        return
    end

    local valueToMove = table.remove(tbl, fromIndex)
    table.insert(tbl, toIndex, valueToMove)
end

_table.find = function(tbl, value)
    if type(tbl) ~= "table" then
        error("The provided argument is not a table.")
    end

    for i, v in ipairs(tbl) do
        if v == value then
            return i
        end
    end

    return nil  -- Return nil if the element is not found
end

_table.sort = function(_obj)
    table.sort(_obj,function(a,b) 
        if type(a) == "string" and type(b) == "string" then
            return a < b;
        elseif type(a) == "number" and type(b) == "number" then
            return a < b;
        end
     end);
end

_table.unpack = unpack or table.unpack

_table.clone = function(obj)
    if type(obj) ~= "table" then
      return obj
    end
  
    local clone = {}
    for key, value in pairs(obj) do
      clone[key] = _table.clone(value)
    end

    return clone
end

_table.map = function(arr, callback)
    local result = {}
    for i = 1, #arr do
        result[i] = callback(arr[i], i)
    end
    return result
end

_table.filter = function(arr, callback)
    local result = {}
    local names = {}
    for k, v in pairs(arr) do
        if callback(v, k) then
            table.insert(result, v)
            table.insert(names, k)
        end
    end
    return result, names
end

_table.reduce = function(arr, callback, initial)
    local accumulator = initial
    for i = 1, #arr do
        accumulator = callback(accumulator, arr[i])
    end
    return accumulator
end

_table.includes = function(arr, value)
    if not arr then
        return false
    end
    for k, v in pairs(arr) do
        if (value == v) then
            return true,k
        end
    end
    return false
end


_table.clear = function(arr)
    local result = {}
    local index = 1
  
    for i = 1, #arr do
      if arr[i] ~= nil then
        result[index] = arr[i]
        index = index + 1
      end
    end
  
    return result
end

_table.selfclear = function(arr)
    local index = 1
    for i = 1, #arr do
      if arr[i] ~= nil then
        arr[index] = arr[i]
        index = index + 1
      end
    end
end

return _table