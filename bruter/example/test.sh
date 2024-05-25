#bruter --debug test.br -o test # Compile the test.br file into a executable
#bruter -c test.br -o test.br.o # Compile the test.br as a static library
#bruter -c test.br -o test.br.so # Compile the test.br as a shared library
bruter txt.br # just interpret the txt.br file
bruter scopes.br --debug # interpret the scopes.br file in debug mode
bruter --debug luapi.br # the order of the arguments doesn't matter when using flags, except for the -o flag
bruter -o test compiling.br --debug # Compile the compiling.br file into a executable called test
bruter --debug conditions.br
bruter types.br
bruter --debug fakemodules.br
bruter --debug loop.br
bruter --debug roguelike.br
bruter --debug functions.br
bruter --debug img.br
./test # Run the test executable