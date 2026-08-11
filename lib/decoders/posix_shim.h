#ifndef POSIX_SHIM_H
#define POSIX_SHIM_H

// Minimal POSIX shim for wasm32 -nostdlib builds. Redirects open/read/
// lseek/close/fprintf to a global memory buffer so file-based libraries
// (like gifdec) can read from embedded data without modification.
//
// Globals and POSIX functions are `extern` and defined in posix_shim.c —
// shared across translation units (main.c and gifdec.c) so the user's
// buffer setting in main.c is visible to gifdec.c's read/lseek/close.

#include <stdint.h>
#include <string.h>
#include "posix_types.h"

extern const uint8_t* _shim_data;
extern size_t         _shim_size;
extern size_t         _shim_pos;

void _shim_reset(const uint8_t* data, size_t size);
ssize_t _shim_read(void* buf, size_t count);
off_t   _shim_lseek(off_t offset, int whence);
void    _shim_close(void);

// POSIX function declarations — definitions in posix_shim.c
int     open(const char* pathname, int flags);
ssize_t read(int fd, void* buf, size_t count);
off_t   lseek(int fd, off_t offset, int whence);
int     close(int fd);

#define fprintf(file, ...) ((void)0)

#endif
