rm -rf build/*
cp -r lib build/

RLPATH=./lib/libraylib.a

if [ -n "$WEB" ]; then
	RLPATH=./lib/web/libraylib.a
fi

if [ -n "$SETUP" ]; then
	rm -rf raylib lib include
	mkdir lib include
	mkdir lib/web
	git clone https://github.com/raysan5/raylib --depth=1
	cd raylib/src

	if [ -n "$WEB" ]; then
		emcc -c rcore.c -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2
		emcc -c rshapes.c -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2
		emcc -c rtextures.c -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2
		emcc -c rtext.c -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2
		emcc -c rmodels.c -Os -Wall -DPLATFORM_WEB -DGRAPHICS_API_OPENGL_ES2
		emcc -c utils.c -Os -Wall -DPLATFORM_WEB
		emcc -c raudio.c -Os -Wall -DPLATFORM_WEB

		emar rcs libraylib.a rcore.o rshapes.o rtextures.o rtext.o rmodels.o utils.o raudio.o
		mv libraylib.a ../../lib/web/
		rm *.o
	fi

	make clean
	make PLATFORM=PLATFORM_DESKTOP RAYLIB_LIBTYPE=STATIC

	mv libraylib.a ../../lib/
	mv raylib.h ../../include/
	mv raymath.h ../../include/
	mv rlgl.h ../../include/
	mv rcamera.h ../../include/
	mv rgestures.h ../../include/

	cd ../..
	rm -rf raylib



	rm -rf bruter
	rm include/bruter.h
	git clone https://github.com/jardimdanificado/bruter -b experimental
	cd bruter
	EMCC=emcc ./build.sh
	cd ..
	rm lib/bruter.js lib/bruter.wasm lib/bruter.o
	cp bruter/build/web/bruter.js lib/
	cp bruter/build/web/bruter.wasm lib/
	cp bruter/build/include/bruter.h include/
	cd bruter
	rm -rf build
	EMCC=emcc WOUT='bruter.o -r' ./build.sh
	cd ..
	cp bruter/build/web/bruter.o lib/
	rm -rf bruter
fi

emcc -o build/bruter.html src/main.c lib/bruter.o -Llib -Iinclude $RLPATH -s USE_GLFW=3 -s ASYNCIFY --shell-file src/minshell.html
mv build/bruter.html build/index.html