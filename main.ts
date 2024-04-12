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

	async rollUpTasks(file: TFile, topLevelFile: TFile, collectedTasks: Map<string, string[]> = new Map()) {
		const content = await this.app.vault.read(file);
		const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
		let match;
		let updatedContent = content;

		updatedContent = updatedContent.replace(/- \[ \] (.+)/g, (match, taskText) => {
			const blockId = `id-${Math.random().toString(36).substr(2, 9)}`;
			const newTask = `- ${taskText} {{${blockId}}}`;
			const taskWithLink = `- [ ] ${taskText} [[${file.basename}#${blockId}|↩]]`;

			// Safely update the map
			let tasks = collectedTasks.get(file.basename);
			if (!tasks) {
				tasks = [];
				collectedTasks.set(file.basename, tasks);
			}
			tasks.push(taskWithLink);

			return newTask;
		});

		await this.app.vault.modify(file, updatedContent);

		// Recursively process linked notes
		while ((match = wikilinkRegex.exec(content)) !== null) {
			const linkedNoteTitle = match[1];
			const linkedFile = this.app.vault.getAbstractFileByPath(`${linkedNoteTitle}.md`) as TFile | null;

			if (linkedFile && !collectedTasks.has(linkedFile.basename)) {
				await this.rollUpTasks(linkedFile, topLevelFile, collectedTasks);
			}
		}

		// Only update the top-level note once at the end of recursion
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
