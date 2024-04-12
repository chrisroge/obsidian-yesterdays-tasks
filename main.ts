import { Plugin, PluginManifest, TFile, Notice, App } from 'obsidian';

export default class MyPlugin extends Plugin {
	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
	}

	onload() {
		this.addRibbonIcon('dice', 'Roll Up Linked Tasks', () => {
			const currentFile = this.app.workspace.getActiveFile();
			if (currentFile) {
				this.rollUpTasks(currentFile, currentFile);
			} else {
				new Notice("No active file.");
			}
		});
	}

	async rollUpTasks(file: TFile, topLevelFile: TFile, collectedTasks: Map<string, string[]> = new Map(), currentFileCtime?: number) {
		const content = await this.app.vault.read(file);
		const fileStats = file.stat;
		const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
		let match;

		if (currentFileCtime === undefined) {
			currentFileCtime = fileStats.ctime;
		}

		const lines = content.split('\n');
		let currentList = [];
		let collecting = false;
		let lastLineWasTask = false;

		for (let line of lines) {
			const taskMatch = /^(\s*)- \[ \] (.+)/.exec(line);
			const listMatch = /^(\s*)- /.exec(line);
			const emptyOrHeader = /^(\s*|\s*#+\s*[^#].*)$/.test(line);

			if (taskMatch) {
				collecting = true;
				lastLineWasTask = true;
				const blockId = `id-${Math.random().toString(36).substr(2, 9)}`;
				line = line.replace(taskMatch[0], `${taskMatch[1]}- [ ] ${taskMatch[2]} [[${file.basename}#${blockId}|↩]]`);
				console.log(`Task found and modified with block ID: ${blockId} in file: ${file.basename}`);
			} else {
				lastLineWasTask = false;
			}

			if (listMatch) {
				currentList.push(line);
				console.log(`Collecting line: ${line}`);
			} else if (collecting && (emptyOrHeader || !lastLineWasTask && line.trim() !== '')) {
				// Only end collecting if a header or non-empty non-list line follows a non-task line
				if (currentList.length > 0) {
					let tasks = collectedTasks.get(file.basename);
					if (!tasks) {
						tasks = [];
						collectedTasks.set(file.basename, tasks);
					}
					tasks.push(currentList.join('\n'));
					console.log(`List collected from ${file.basename}: ${currentList.join('\\n')}`);
					currentList = [];
					collecting = false;
				}
			} else if (collecting) {
				// Continue collecting if the line is part of a task list context
				currentList.push(line);
			}
		}

		// Handle any remaining collected list
		if (collecting) {
			let tasks = collectedTasks.get(file.basename);
			if (!tasks) {
				tasks = [];
				collectedTasks.set(file.basename, tasks);
			}
			tasks.push(currentList.join('\n'));
			console.log(`Remaining list collected from ${file.basename}: ${currentList.join('\\n')}`);
		}

		await this.app.vault.modify(file, content);

		// Recursively process linked notes
		while ((match = wikilinkRegex.exec(content)) !== null) {
			const linkedNoteTitle = match[1];
			const linkedFile = this.app.vault.getAbstractFileByPath(`${linkedNoteTitle}.md`) as TFile | null;

			if (linkedFile && linkedFile instanceof TFile && linkedFile.stat.ctime > currentFileCtime && !collectedTasks.has(linkedFile.basename)) {
				console.log(`Processing linked file: ${linkedNoteTitle}`);
				await this.rollUpTasks(linkedFile, topLevelFile, collectedTasks, currentFileCtime);
			}
		}

		if (file.path === topLevelFile.path) {
			this.updateTopLevelFile(topLevelFile, collectedTasks);
		}
	}





	async updateTopLevelFile(topLevelFile: TFile, collectedTasks: Map<string, string[]>) {
		let topLevelContent = await this.app.vault.read(topLevelFile);

		collectedTasks.forEach((tasks, noteTitle) => {
			topLevelContent += `\n\n### Tasks from [[${noteTitle}]]\n${tasks.join('\n')}`;
		});

		await this.app.vault.modify(topLevelFile, topLevelContent);
		new Notice('Tasks have been rolled up.');
	}
}