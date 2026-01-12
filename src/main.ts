import { FileSystemAdapter, Menu, Plugin, TAbstractFile, TFolder } from 'obsidian';
import { TerminalView, TERMINAL_VIEW_TYPE } from './terminal-view';
import * as path from 'path';

export default class ClaudeTerminalPlugin extends Plugin {
    private helperPath: string = '';
    private customCwd: string | null = null;

    onload(): void {
        const adapter = this.app.vault.adapter as FileSystemAdapter;
        const basePath = adapter.getBasePath();

        this.helperPath = path.join(
            basePath,
            this.app.vault.configDir,
            'plugins',
            'claude-terminal',
            'resources',
            'pty-helper.py'
        );

        this.registerView(
            TERMINAL_VIEW_TYPE,
            (leaf) => new TerminalView(leaf, this.helperPath, this.customCwd || undefined)
        );

        this.addRibbonIcon('terminal', 'Open terminal', (evt) => {
            const menu = new Menu();

            menu.addItem((item) => {
                item.setTitle('Open Claude Code')
                    .setIcon('bot')
                    .onClick(() => {
                        void this.activateView('claude --dangerously-skip-permissions');
                    });
            });

            menu.addItem((item) => {
                item.setTitle('Open terminal')
                    .setIcon('terminal')
                    .onClick(() => {
                        void this.activateView();
                    });
            });

            menu.showAtMouseEvent(evt);
        });

        this.addCommand({
            id: 'open-zsh-terminal',
            name: 'Open terminal',
            callback: () => {
                void this.activateView();
            },
        });

        this.addCommand({
            id: 'focus-terminal',
            name: 'Focus terminal',
            callback: () => {
                const leaves = this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE);
                if (leaves.length > 0) {
                    const leaf = leaves[0];
                    this.app.workspace.setActiveLeaf(leaf, { focus: true });
                    const view = leaf.view as TerminalView;
                    if (view && view.focusTerminal) {
                        view.focusTerminal();
                    }
                } else {
                    void this.activateView();
                }
            },
        });

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file: TAbstractFile) => {
                if (file instanceof TFolder) {
                    menu.addItem((item) => {
                        item.setTitle('Open in Claude Code')
                            .setIcon('bot')
                            .onClick(() => {
                                const adapter = this.app.vault.adapter as FileSystemAdapter;
                                const folderPath = path.join(
                                    adapter.getBasePath(),
                                    file.path
                                );
                                void this.activateView('claude --dangerously-skip-permissions', folderPath);
                            });
                    });
                }
            })
        );
    }

    onunload(): void {
        // Don't detach leaves - Obsidian handles this automatically
    }

    async activateView(initialCommand?: string, cwd?: string): Promise<void> {
        const { workspace } = this.app;

        this.customCwd = cwd || null;

        const leaf = workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: TERMINAL_VIEW_TYPE,
                active: true,
            });
            await workspace.revealLeaf(leaf);

            if (initialCommand) {
                const view = leaf.view as TerminalView;
                if (view && view.executeCommand) {
                    setTimeout(() => {
                        view.executeCommand(initialCommand);
                    }, 500);
                }
            }
        }
    }
}
