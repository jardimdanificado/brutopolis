// Shared POSIX type/macro definitions for wasm32 -nostdlib builds.
// Included by the fake <unistd.h>, <fcntl.h>, <sys/types.h> so
// libraries like gifdec that include standard POSIX headers get
// the right declarations.

#ifndef _POSIX_TYPES_H
#define _POSIX_TYPES_H

#include <stdint.h>

typedef int64_t off_t;
typedef int64_t ssize_t;

#define O_RDONLY 0
#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2

#endif
