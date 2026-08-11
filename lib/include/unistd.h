// Minimal unistd.h for wasm32 -nostdlib builds.
// gifdec.c includes this for read/lseek/close — posix_shim.h provides
// them as static inline.

#ifndef _UNISTD_H
#define _UNISTD_H
#include "posix_types.h"
ssize_t read(int fd, void* buf, size_t count);
off_t   lseek(int fd, off_t offset, int whence);
int     close(int fd);
#endif
