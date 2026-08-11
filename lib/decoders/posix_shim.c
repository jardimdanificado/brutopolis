// posix_shim.c — definitions for the extern globals in posix_shim.h

#include "posix_shim.h"

const uint8_t* _shim_data = 0;
size_t         _shim_size = 0;
size_t         _shim_pos  = 0;

void _shim_reset(const uint8_t* data, size_t size) {
    _shim_data = data;
    _shim_size = size;
    _shim_pos  = 0;
}

ssize_t _shim_read(void* buf, size_t count) {
    if (!_shim_data) return -1;
    if (_shim_pos + count > _shim_size) {
        count = _shim_size - _shim_pos;
    }
    memcpy(buf, _shim_data + _shim_pos, count);
    _shim_pos += count;
    return (ssize_t)count;
}

off_t _shim_lseek(off_t offset, int whence) {
    switch (whence) {
        case SEEK_SET: _shim_pos = (size_t)offset; break;
        case SEEK_CUR: _shim_pos = (size_t)(_shim_pos + offset); break;
        case SEEK_END: _shim_pos = (size_t)(_shim_size + offset); break;
    }
    return (off_t)_shim_pos;
}

void _shim_close(void) {
    _shim_data = 0;
    _shim_size = 0;
    _shim_pos  = 0;
}

int open(const char* pathname, int flags) {
    (void)pathname; (void)flags;
    _shim_pos = 0;
    return 1;
}

ssize_t read(int fd, void* buf, size_t count) {
    (void)fd;
    return _shim_read(buf, count);
}

off_t lseek(int fd, off_t offset, int whence) {
    (void)fd;
    return _shim_lseek(offset, whence);
}

int close(int fd) {
    (void)fd;
    _shim_close();
    return 0;
}
