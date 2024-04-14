local array = {}

array.slice = function(arr, start, final)
    local sliced_array = {}
    for i = start, final do
        table.insert(sliced_array, arr[i])
    end
    return sliced_array
end

array.organize = function(arr, parts)
    local columns, rows = parts, parts
    local matrix = {}
    for i = 1, rows do
        matrix[i] = {}
        for j = 1, columns do
            local index = (i - 1) * columns + j
            matrix[i][j] = arr[index]
        end
    end

    return matrix
end

array.expand = function(matrix)
    local nSubMatrices = #matrix
    local subMatrixSize = #matrix[1]

    local result = {}

    for i = 1, nSubMatrices * subMatrixSize do
        result[i] = {}
        for j = 1, nSubMatrices * subMatrixSize do
            local subMatrixIndexI = math.ceil(i / subMatrixSize)
            local subMatrixIndexJ = math.ceil(j / subMatrixSize)
            local subMatrix = matrix[subMatrixIndexI][subMatrixIndexJ]
            local subMatrixRow = (i - 1) % subMatrixSize + 1
            local subMatrixCol = (j - 1) % subMatrixSize + 1
            result[i][j] = subMatrix[subMatrixRow][subMatrixCol]
        end
    end

    return result
end

array.new = function(size, value)
    local result = {}
    value = value or 0
    for i = 1, size do
        result[i] = value
    end
    return result
end

array.random = function(start, fim, size)
    local result = {}
    local range = fim - start + 1
    for i = 0, size do
        local randomInt = math.floor(math.random() * range) + start
        result.push(randomInt)
    end
    return result
end

array.minmax = function(arr)
    local min = arr[1]
    local max = arr[1]
    for y = 1, #arr do
        if (arr[y] > max) then
            max = arr[y]
        elseif (arr[y] < min) then
            min = arr[y]
        end
    end
    return {
        min = min,
        max = max
    }
end

array.sum = function(arr)
    local sum = 0
    for i = 1, #arr, 1 do
        sum = sum + arr[i]
    end
    return sum
end


array.tostring = function(arr)
    local result = ''
    for i, v in ipairs(arr) do
        result = result .. ' ' .. v
    end
    return result
end

return array