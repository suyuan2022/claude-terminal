import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { PtyManager } from './pty-manager';
import * as path from 'path';

import xtermCss from '@xterm/xterm/css/xterm.css';

export const TERMINAL_VIEW_TYPE = 'claude-terminal-view';

export class TerminalView extends ItemView {
    private terminal: Terminal | null = null;
    private fitAddon: FitAddon | null = null;
    private ptyManager: PtyManager | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private customCwd: string | null = null;
    private lastEscTime: number = 0;

    constructor(leaf: WorkspaceLeaf, private helperPath: string, cwd?: string) {
        super(leaf);
        this.customCwd = cwd || null;
    }

    getViewType(): string {
        return TERMINAL_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Claude Terminal';
    }

    getIcon(): string {
        return 'terminal';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('terminal-container');

        const terminalEl = container.createDiv({ cls: 'terminal-wrapper' });

        this.terminal = new Terminal({
            cursorBlink: true,
            minimumContrastRatio: 4.5,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            convertEol: true,
            windowsMode: false,
            macOptionIsMeta: true,
            macOptionClickForcesSelection: false,
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#d4d4d4',
                selectionBackground: '#264f78',
                black: '#4d4d4d',
                red: '#f44747',
                green: '#4ec9b0',
                yellow: '#ce9178',
                blue: '#569cd6',
                magenta: '#c586c0',
                cyan: '#9cdcfe',
                white: '#d4d4d4',
                brightBlack: '#9e9e9e',
                brightRed: '#f14c4c',
                brightGreen: '#73c991',
                brightYellow: '#dcb67a',
                brightBlue: '#4fc1ff',
                brightMagenta: '#d7aefb',
                brightCyan: '#b5e8ff',
                brightWhite: '#ffffff',
            },
            scrollback: 10000,
            allowProposedApi: true,
            allowTransparency: true,
        });

        this.fitAddon = new FitAddon();
        this.terminal.loadAddon(this.fitAddon);

        this.terminal.loadAddon(new SearchAddon());
        this.terminal.loadAddon(new WebLinksAddon());

        this.terminal.open(terminalEl);
        this.fitAddon.fit();

        this.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
            if (event.type !== 'keydown') return true;
            if (this.terminal?.buffer.active.type !== 'normal') return true;
            if (event.metaKey && event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                this.terminal?.scrollToBottom();
                return false;
            }
            if (event.metaKey && event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                this.terminal?.scrollToTop();
                return false;
            }
            return true;
        });

        this.ptyManager = new PtyManager(this.helperPath, {
            cwd: this.customCwd || (this.app.vault.adapter as any).basePath,
        });

        this.ptyManager.start(
            (data) => {
                if (this.terminal) {
                    this.terminal.write(data);
                }
            },
            (code) => {
                if (this.terminal) {
                    this.terminal.write(`\r\n\x1b[1;31mProcess exited with code ${code}\x1b[0m\r\n`);
                }
            }
        );

        this.terminal.onData((data) => {
            if (this.ptyManager) {
                this.ptyManager.write(data);
            }
        });

        this.terminal.onResize(({ cols, rows }) => {
            if (this.ptyManager) {
                this.ptyManager.resize(cols, rows);
            }
        });

        this.resizeObserver = new ResizeObserver(() => {
            if (this.fitAddon) {
                this.fitAddon.fit();
            }
        });
        this.resizeObserver.observe(terminalEl);

        this.setupDragAndDrop(terminalEl);
        this.setupKeyboardHandlers(terminalEl);

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf === this.leaf && this.terminal) {
                    setTimeout(() => {
                        if (this.terminal) {
                            this.terminal.focus();
                            console.log('[Terminal] Auto-focused on leaf activation');
                        }
                    }, 10);
                }
            })
        );

        this.addStyles();
    }

    private setupKeyboardHandlers(terminalEl: HTMLElement): void {
        this.registerDomEvent(
            document,
            'keydown',
            (evt: KeyboardEvent) => {
                if (evt.key === 'Escape') {
                    const now = Date.now();
                    const timeSinceLastEsc = now - this.lastEscTime;
                    this.lastEscTime = now;

                    if (timeSinceLastEsc < 400) {
                        console.log('[Terminal] Double ESC detected (interval:', timeSinceLastEsc, 'ms), will refocus after 250ms');
                        setTimeout(() => {
                            console.log('[Terminal] Refocusing after double ESC');
                            this.focusTerminal();
                        }, 250);
                    }
                }
            },
            { capture: true }
        );

        this.registerDomEvent(terminalEl, 'click', () => {
            if (this.app.workspace.activeLeaf === this.leaf) {
                console.log('[Terminal] Clicked, focusing');
                requestAnimationFrame(() => {
                    this.focusTerminal();
                });
            }
        });

        if (this.scope) {
            this.scope.register([], 'Tab', (evt: KeyboardEvent) => {
                if (this.app.workspace.activeLeaf !== this.leaf) {
                    return;
                }

                const activeEl = document.activeElement;
                const isInTerminal = this.containerEl.contains(activeEl);

                if (!isInTerminal) {
                    console.log('[Terminal] Tab pressed, focusing terminal');
                    evt.preventDefault();
                    this.focusTerminal();
                    return false;
                }
            });
        }
    }

    private setupDragAndDrop(terminalEl: HTMLElement): void {
        terminalEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        terminalEl.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const text = e.dataTransfer?.getData('text/plain');

            if (text && text.startsWith('obsidian://')) {
                const url = new URL(text);
                const file = url.searchParams.get('file');

                if (file) {
                    const decodedFile = decodeURIComponent(file);
                    const basePath = (this.app.vault.adapter as any).basePath;

                    let actualPath = decodedFile;
                    let abstractFile = this.app.vault.getAbstractFileByPath(decodedFile);

                    if (!abstractFile && !decodedFile.endsWith('.md')) {
                        const mdPath = decodedFile + '.md';
                        abstractFile = this.app.vault.getAbstractFileByPath(mdPath);
                        if (abstractFile) {
                            actualPath = mdPath;
                        }
                    }

                    const fullPath = path.join(basePath, actualPath);

                    if (this.ptyManager) {
                        this.ptyManager.write(`'${fullPath}' `);
                    }
                }
            } else if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                const files = Array.from(e.dataTransfer.files);
                const paths = files.map((f: File) => {
                    const filePath = (f as any).path || '';
                    return filePath ? `'${filePath}'` : '';
                }).filter(p => p !== '').join(' ');

                if (paths && this.ptyManager) {
                    this.ptyManager.write(paths + ' ');
                }
            }

            if (this.terminal) {
                this.terminal.focus();
            }
        });
    }

    public focusTerminal(): void {
        this.app.workspace.setActiveLeaf(this.leaf, { focus: true });

        if (this.terminal?.textarea) {
            requestAnimationFrame(() => {
                if (this.terminal?.textarea) {
                    this.terminal.textarea.focus({ preventScroll: true });
                    console.log('[Terminal] Textarea focused via direct access');

                    setTimeout(() => {
                        if (this.terminal?.textarea &&
                            document.activeElement !== this.terminal.textarea) {
                            this.terminal.textarea.focus({ preventScroll: true });
                            console.log('[Terminal] Textarea re-focused after delay');
                        }
                    }, 50);
                }
            });
        }

        if (this.terminal) {
            this.terminal.focus();
            console.log('[Terminal] Terminal.focus() called');
        }
    }

    executeCommand(command: string): void {
        if (this.ptyManager) {
            this.ptyManager.write(command + '\r');
        }
    }

    async onClose(): Promise<void> {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        if (this.ptyManager) {
            this.ptyManager.kill();
            this.ptyManager = null;
        }

        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = null;
        }

        this.fitAddon = null;
    }

    private addStyles(): void {
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            ${xtermCss}

            .terminal-container {
                height: 100%;
                width: 100%;
                padding: 0;
                overflow: hidden;
            }
            .terminal-wrapper {
                height: 100%;
                width: 100%;
                padding: 8px;
            }
            .xterm {
                height: 100%;
                width: 100%;
                font-kerning: normal;
                font-variant-ligatures: none;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                text-rendering: optimizeLegibility;
            }
            .xterm-screen {
                letter-spacing: 0;
                word-spacing: 0;
            }
            .xterm-viewport {
                overflow-y: auto !important;
            }
        `;
        document.head.appendChild(styleEl);
    }
}
