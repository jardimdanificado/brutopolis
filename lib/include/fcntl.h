// Minimal fcntl.h for wasm32 -nostdlib builds.
// gifdec.c includes this for O_RDONLY (we ignore the real open()).

#ifndef _FCNTL_H
#define _FCNTL_H
#include "posix_types.h"
int open(const char* pathname, int flags);
#endif
