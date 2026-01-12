import { spawn, ChildProcess } from 'child_process';
import { Writable } from 'stream';
import { StringDecoder } from 'string_decoder';

export interface PtyOptions {
    shell?: string;
    cwd?: string;
}

export class PtyManager {
    private process: ChildProcess | null = null;
    private resizeStream: Writable | null = null;
    private decoder: StringDecoder;

    constructor(
        private helperPath: string,
        private options: PtyOptions = {}
    ) {
        this.decoder = new StringDecoder('utf8');
    }

    start(onData: (data: string) => void, onExit: (code: number) => void): void {
        const shell = this.options.shell || process.env.SHELL || '/bin/zsh';
        const cwd = this.options.cwd || process.env.HOME || process.cwd();

        const shellEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (value !== undefined) {
                shellEnv[key] = value;
            }
        }

        if (process.env.PATH) {
            const additionalPaths = [
                '/usr/local/bin',
                '/opt/homebrew/bin',
                '/usr/bin',
                '/bin',
                '/usr/sbin',
                '/sbin',
            ];

            const homePath = process.env.HOME;
            if (homePath) {
                additionalPaths.push(`${homePath}/.npm-global/bin`);
                additionalPaths.push(`${homePath}/.yarn/bin`);
            }

            shellEnv.PATH = [
                ...additionalPaths,
                process.env.PATH
            ].filter(Boolean).join(':');
        }

        const env: Record<string, string> = {
            ...shellEnv,
            TERM: 'xterm-256color',
            TERM_PROGRAM: 'xterm.js',
            COLORTERM: 'truecolor',
            SHELL: shell,
            LANG: process.env.LANG || 'en_US.UTF-8',
            LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
            LC_CTYPE: 'en_US.UTF-8',
            NCURSES_NO_UTF8_ACS: '1',
            FORCE_COLOR: '3',
        };

        if (process.env.HOME) {
            env.HOME = process.env.HOME;
        }
        if (process.env.USER) {
            env.USER = process.env.USER;
        }
        if (process.env.LOGNAME) {
            env.LOGNAME = process.env.LOGNAME;
        }

        this.process = spawn('python3', [this.helperPath, shell], {
            cwd,
            env,
            stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        });

        if (!this.process.stdout || !this.process.stdin || !this.process.stdio[3]) {
            throw new Error('Failed to create PTY process');
        }

        this.resizeStream = this.process.stdio[3] as Writable;

        this.process.stdout.on('data', (data: Buffer) => {
            const text = this.decoder.write(data);
            onData(text);
        });

        this.process.on('exit', (code) => {
            onExit(code || 0);
        });

        this.process.on('error', (err) => {
            console.error('PTY process error:', err);
        });
    }

    write(data: string): void {
        if (this.process && this.process.stdin) {
            this.process.stdin.write(data);
        }
    }

    resize(cols: number, rows: number): void {
        if (this.resizeStream) {
            const buffer = Buffer.alloc(8);
            buffer.writeUInt16LE(rows, 0);
            buffer.writeUInt16LE(cols, 2);
            this.resizeStream.write(buffer);
        }
    }

    kill(): void {
        if (this.process) {
            this.process.kill();
            this.process = null;
            this.resizeStream = null;
        }
    }
}
