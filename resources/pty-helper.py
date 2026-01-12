#!/usr/bin/env python3
import os
import sys
import pty
import select
import fcntl
import termios
import struct
import errno

def main():
    shell = os.environ.get('SHELL', '/bin/zsh')

    if len(sys.argv) > 1:
        shell = sys.argv[1]

    # 启动登录 shell，确保加载所有环境配置
    argv = [shell, '-l', '-i']

    # 完整的环境变量，确保 PATH 正确
    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'

    # 确保 PATH 包含 Claude 的路径
    required_paths = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
        '/Users/suyuan/.npm-global/bin',
        '/Library/Apple/usr/bin',
        '/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin',
        '/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin',
    ]

    if 'PATH' in env:
        existing_paths = env['PATH'].split(':')
        # 合并路径，去重
        all_paths = list(dict.fromkeys(required_paths + existing_paths))
        env['PATH'] = ':'.join(all_paths)

    pid, fd = pty.fork()

    if pid == 0:
        # 子进程：启动登录 shell
        os.execve(shell, argv, env)

    fds = [fd, sys.stdin.fileno(), 3]

    stdout = sys.stdout.buffer

    while True:
        try:
            rfds, _, _ = select.select(fds, [], [])
        except select.error as e:
            if e.args[0] == errno.EINTR:
                continue
            break

        if fd in rfds:
            try:
                data = os.read(fd, 32768)
                if len(data) == 0:
                    break
                stdout.write(data)
                stdout.flush()
            except OSError as e:
                if e.errno in (errno.EINTR, errno.EAGAIN):
                    continue
                if e.errno == errno.EIO:
                    break
                raise

        if sys.stdin.fileno() in rfds:
            try:
                data = os.read(sys.stdin.fileno(), 32768)
                if len(data) == 0:
                    break
                os.write(fd, data)
            except OSError as e:
                if e.errno in (errno.EINTR, errno.EAGAIN):
                    continue
                raise

        if 3 in rfds:
            try:
                winsize = os.read(3, 8)
                if len(winsize) == 0:
                    fds.remove(3)
                elif len(winsize) == 8:
                    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
            except OSError as e:
                if e.errno in (errno.EINTR, errno.EAGAIN):
                    continue
                fds.remove(3)

if __name__ == '__main__':
    main()
