terralib.includepath = terralib.includepath .. ";" .. terralib.terrahome .. "/include/terra";

capi = terralib.includecstring [[
    #include <lua.h>
    #include <lauxlib.h>
    #include <lualib.h>

    // wrappers to import the functions that are macros
    int lua_dostring(lua_State *L, const char *s) { return luaL_dostring(L, s); }
]];

struct lua_session
{
    L: &capi.lua_State,
}

terra lua_session:eval(code: &int8)
    capi.lua_dostring(self.L, code)
end

terra lua_session:close()
    capi.lua_close(self.L)
end

br.luapi = terra():lua_session
    var L = capi.luaL_newstate()
    capi.luaL_openlibs(L)
    var result:lua_session;
    result.L = L;
    return(result);
end