import { FileSystemAdapter, ItemView, WorkspaceLeaf } from 'obsidian';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { PtyManager } from './pty-manager';
import * as path from 'path';

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

    onOpen(): Promise<void> {
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

        const adapter = this.app.vault.adapter as FileSystemAdapter;
        this.ptyManager = new PtyManager(this.helperPath, {
            cwd: this.customCwd || adapter.getBasePath(),
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
        this.setupKeyboardHandlers();

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf === this.leaf && this.terminal) {
                    setTimeout(() => {
                        if (this.terminal) {
                            this.terminal.focus();
                        }
                    }, 10);
                }
            })
        );

        return Promise.resolve();
    }

    private setupKeyboardHandlers(): void {
        this.registerDomEvent(
            document,
            'keydown',
            (evt: KeyboardEvent) => {
                if (evt.key === 'Escape') {
                    const now = Date.now();
                    const timeSinceLastEsc = now - this.lastEscTime;
                    this.lastEscTime = now;

                    if (timeSinceLastEsc < 400) {
                        setTimeout(() => {
                            this.focusTerminal();
                        }, 250);
                    }
                }
            },
            { capture: true }
        );

        this.registerDomEvent(this.containerEl, 'click', () => {
            const activeView = this.app.workspace.getActiveViewOfType(TerminalView);
            if (activeView === this) {
                requestAnimationFrame(() => {
                    this.focusTerminal();
                });
            }
        });

        if (this.scope) {
            this.scope.register([], 'Tab', (evt: KeyboardEvent) => {
                const activeView = this.app.workspace.getActiveViewOfType(TerminalView);
                if (activeView !== this) {
                    return;
                }

                const activeEl = document.activeElement;
                const isInTerminal = this.containerEl.contains(activeEl);

                if (!isInTerminal) {
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

        terminalEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const text = e.dataTransfer?.getData('text/plain');

            if (text && text.startsWith('obsidian://')) {
                const url = new URL(text);
                const file = url.searchParams.get('file');

                if (file) {
                    const decodedFile = decodeURIComponent(file);
                    const adapter = this.app.vault.adapter as FileSystemAdapter;
                    const basePath = adapter.getBasePath();

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
                    const fileWithPath = f as File & { path?: string };
                    const filePath = fileWithPath.path || '';
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

                    setTimeout(() => {
                        if (this.terminal?.textarea &&
                            document.activeElement !== this.terminal.textarea) {
                            this.terminal.textarea.focus({ preventScroll: true });
                        }
                    }, 50);
                }
            });
        }

        if (this.terminal) {
            this.terminal.focus();
        }
    }

    executeCommand(command: string): void {
        if (this.ptyManager) {
            this.ptyManager.write(command + '\r');
        }
    }

    onClose(): Promise<void> {
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

        return Promise.resolve();
    }
}
