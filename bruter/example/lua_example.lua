local br = dofile("../bruter.lua"); -- using dofile because using require() would require the path to be in package.path
local br2 = dofile("../bruter.lua"); -- using dofile because using require() would require the path to be in package.path

-- local br = require("bruter"); -- also works
--br.vm.debug = true;
br.bruter.include("roguelike.br");
br.repl();