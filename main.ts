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
		let modifiedContent = content; // Clone content for modification
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
				const modifiedLine = `${taskMatch[1]}- ${taskMatch[2]} [[${file.basename}#${blockId}|↩]]`;
				currentList.push(modifiedLine); // Collect modified task for the top-level file
				modifiedContent = modifiedContent.replace(line, `${taskMatch[1]}- ${taskMatch[2]}`); // Replace in content for the linked file
			} else {
				lastLineWasTask = false;
				if (listMatch) {
					currentList.push(line);
				}
			}

			if (!collecting && (listMatch || emptyOrHeader)) {
				currentList = []; // Reset current list if it's not collecting
			}
		}

		// Save modifications back to the file
		if (file !== topLevelFile) { // Only modify content if it's not the top-level file
			await this.app.vault.modify(file, modifiedContent);
		}

		// Collect tasks for top-level summary
		let tasks = collectedTasks.get(file.basename);
		if (!tasks) {
			tasks = [];
			collectedTasks.set(file.basename, tasks);
		}
		tasks.push(...currentList);

		// Recursively process linked notes
		while ((match = wikilinkRegex.exec(content)) !== null) {
			const linkedNoteTitle = match[1];
			const linkedFile = this.app.vault.getAbstractFileByPath(`${linkedNoteTitle}.md`) as TFile | null;

			if (linkedFile && linkedFile instanceof TFile && linkedFile.stat.ctime > currentFileCtime && !collectedTasks.has(linkedFile.basename)) {
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