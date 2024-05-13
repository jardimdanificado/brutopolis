
# bruter

## Description

Bruter is a metaprogramable console language that in extremely simple to interpret, it can run using Lua or Terra, it can also be loaded as a module;

*`UNDER HEAVY DEVELOPMENT` - api should change a lot*

Lua(5.1+) and Terra compatible;

## Table of Contents

- [Types](#types)
- [Usage](#usage)
- [License](#license)

## Operators and such


- `$` = indicates a variable, used to get the value of a variables, but not to set.

- `;` = indicates the end of a command.

- `.` = indicates recursion.

## Types


- `$variable` = args that starts with $, can be anything, everything in bruter is stored as a variable and can be modified.

- `number` = args that starts with 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 or -

- `boolean` = args that are true or false

- `string` = args delimited by backticks(`) or curly brackets({}) and anything else that doesnt match the other types

- `sentence` = code that is enclosed by parenthesis, it is executed in order then the result is put in place of the sentence.

- `nil` = nil;

## Usage


argless functions:

    function;


returnless function:

    function $variable_1 $variable_2 ...;


function which return goes to $target_variable:

    set target_variable from function;
    set target_variable (function ...);
    set target_variable (from function ...);
    set target_variable (value);


argless function which return goes to $target_variable:

    set target_variable from function;
    set target_variable (function);
    set target_variable (from function);
    set target_variable (value);

variables always starts with $:

    function $variable_1 $variable_2 ...;


enclosed sentences are executed in order:

    function (function (function ...));


## Libraries

bruter libraries can be loaded by the `using` command like so:

    using library_name;

it will look for the library in the following paths:

    libr_path/library_name/library_name.br
    libr_path/library_name/library_name.lua
    libr_path/library_name/library_name.t
    libr_path/library_name.br
    libr_path/library_name.lua
    libr_path/library_name.t
if none of the paths are found it will throw an error.    

if you really want a library that work as a module you can create a "fake module" see `examples/fake_module/main.br` for an example in vanilla bruter. 

you can also use the `require` function:

    set module from require `module_name`;
    set module (require `module_name`);

    
lua and terra packages are handled with loadfile not require, so they are not cached and can be reloaded, this is done to behave like brute packages, but you can use require to load lua and terra packages.

## License

not licensed at all, do whatever you want with it, i just ask you to give me the proper credits if you use it in your project :)