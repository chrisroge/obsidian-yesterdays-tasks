import { Plugin, PluginManifest, Notice, TFile } from 'obsidian';

export default class MyPlugin extends Plugin {
	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
	}

	onload() {
		super.onload();

		this.addCommand({
			id: 'replace-tasks',
			name: 'Replace Unchecked Tasks',
			callback: () => this.replaceTasks(),
		});

		this.addRibbonIcon('checkmark', 'Replace Unchecked Tasks', () => {
			this.replaceTasks();
			new Notice('Tasks have been replaced!');
		});

		this.addRibbonIcon('dice', 'Roll Up Linked Tasks', () => {
			this.rollUpTasks();
		});



	}


	async rollUpTasks() {
		const currentFile = this.app.workspace.getActiveFile();
		if (!currentFile) {
			console.log("No active file.");
			return;
		}

		let visitedNotes = new Set();
		let tasksByNote = new Map();

		const generateBlockId = () => `id-${Math.random().toString(36).substr(2, 9)}`;

		const processLinkedNotes = async (file, sourceTitle = null) => {
			let content = await this.app.vault.read(file);
			const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
			let match;

			while ((match = wikilinkRegex.exec(content)) !== null) {
				const linkedNoteTitle = match[1];
				const linkedFile = this.app.vault.getAbstractFileByPath(`${linkedNoteTitle}.md`);

				if (linkedFile instanceof TFile && !visitedNotes.has(linkedFile.path)) {
					visitedNotes.add(linkedFile.path);

					let linkedContent = await this.app.vault.read(linkedFile);
					let updatedContent = linkedContent;
					let blockId = generateBlockId();

					const tasks = (linkedContent.match(/- \[ \] .+/g) || []).map(task => {
						// Remove the "- [ ]" prefix and add a block ID for linking
						let taskText = task.slice(6).trim();
						updatedContent = updatedContent.replace(task, `- ${taskText} <span style="font-size: small; color: gray;">^${blockId}</span> #rolleduptask`);
						return `- [ ] ${taskText} [[${linkedNoteTitle}#^${blockId}|↩]]`;
					});

					await this.app.vault.modify(linkedFile, updatedContent);

					if (tasks.length > 0) {
						let currentTasks = tasksByNote.get(linkedNoteTitle) || [];
						currentTasks.push(...tasks);
						tasksByNote.set(linkedNoteTitle, currentTasks);
					}

					await processLinkedNotes(linkedFile, linkedNoteTitle);
				}
			}
		};

		await processLinkedNotes(currentFile);

		if (tasksByNote.size > 0) {
			let topLevelContent = await this.app.vault.read(currentFile);
			tasksByNote.forEach((tasks, noteTitle) => {
				topLevelContent += `\n\n### Rolled Up Tasks from [[${noteTitle}]]\n${tasks.join('\n')}`;
			});
			await this.app.vault.modify(currentFile, topLevelContent);
		}
	}












	async replaceTasks() {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf) return;

		const editor = activeLeaf.view.sourceMode.cmEditor;
		const doc = editor.getDoc();

		// Replace "- [ ]" with "-" and append the "#rolled-forward-task" tag
		const newContent = doc.getValue().replace(/- \[ \] /g, '- #rolled-forward-task ');

		doc.setValue(newContent);
	}

}
