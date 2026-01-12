import { Menu, Plugin, TAbstractFile, TFolder, WorkspaceLeaf } from 'obsidian';
import { TerminalView, TERMINAL_VIEW_TYPE } from './terminal-view';
import * as path from 'path';

export default class ClaudeTerminalPlugin extends Plugin {
    private helperPath: string = '';
    private customCwd: string | null = null;

    async onload() {
        this.helperPath = path.join(
            (this.app.vault.adapter as any).basePath,
            '.obsidian',
            'plugins',
            'claude-terminal',
            'resources',
            'pty-helper.py'
        );

        this.registerView(
            TERMINAL_VIEW_TYPE,
            (leaf) => new TerminalView(leaf, this.helperPath, this.customCwd || undefined)
        );

        this.addRibbonIcon('terminal', 'Open Terminal', (evt) => {
            const menu = new Menu();

            menu.addItem((item) => {
                item.setTitle('Open Claude Code')
                    .setIcon('bot')
                    .onClick(() => {
                        this.activateView('claude --dangerously-skip-permissions');
                    });
            });

            menu.addItem((item) => {
                item.setTitle('Open Terminal')
                    .setIcon('terminal')
                    .onClick(() => {
                        this.activateView();
                    });
            });

            menu.showAtMouseEvent(evt);
        });

        this.addCommand({
            id: 'open-zsh-terminal',
            name: 'Open Terminal',
            callback: () => {
                this.activateView();
            },
        });

        this.addCommand({
            id: 'focus-terminal',
            name: 'Focus Terminal',
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
                    this.activateView();
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
                                const folderPath = path.join(
                                    (this.app.vault.adapter as any).basePath,
                                    file.path
                                );
                                this.activateView('claude --dangerously-skip-permissions', folderPath);
                            });
                    });
                }
            })
        );
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(TERMINAL_VIEW_TYPE);
    }

    async activateView(initialCommand?: string, cwd?: string) {
        const { workspace } = this.app;

        this.customCwd = cwd || null;

        const leaf = workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: TERMINAL_VIEW_TYPE,
                active: true,
            });
            workspace.revealLeaf(leaf);

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
