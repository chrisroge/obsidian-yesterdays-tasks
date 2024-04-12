import { Plugin, PluginManifest, Notice, TFile, WorkspaceLeaf, MarkdownView, App } from 'obsidian';

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

	async replaceTasks() {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf || !(activeLeaf.view instanceof MarkdownView)) {
			new Notice('Active view is not a markdown editor.');
			return;
		}

		// At this point, it's confirmed that activeLeaf.view is a MarkdownView
		const editor = activeLeaf.view.editor;
		if (!editor) {
			new Notice('No editor available.');
			return;
		}

		const doc = editor.getDoc();
		const newContent = doc.getValue().replace(/- \[ \] /g, '- #rolled-forward-task ');
		doc.setValue(newContent);

		new Notice('Tasks have been replaced!');
	}


	async rollUpTasks() {
		const currentFile = this.app.workspace.getActiveFile();
		if (!currentFile) {
			console.log("No active file.");
			return;
		}

		let visitedNotes = new Set(); // To keep track of visited notes
		let tasksByNote = new Map(); // To accumulate tasks by their source note with block IDs

		// Generate a simple unique ID
		const generateBlockId = () => `id-${Math.random().toString(36).substr(2, 9)}`;

		// Recursive function to process tasks in linked notes
		const processLinkedNotes = async (file, sourceTitle = null) => {
			let content = await this.app.vault.read(file);
			const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
			let match;

			while ((match = wikilinkRegex.exec(content)) !== null) {
				const linkedNoteTitle = match[1];
				// Attempt to resolve the linked note file
				const linkedFile = this.app.vault.getAbstractFileByPath(`${linkedNoteTitle}.md`);

				if (linkedFile instanceof TFile && !visitedNotes.has(linkedFile.path)) {
					visitedNotes.add(linkedFile.path); // Mark as visited

					let linkedContent = await this.app.vault.read(linkedFile);
					// Find incomplete tasks
					const tasks = linkedContent.match(/- \[ \] .+/g) || [];

					if (tasks.length > 0) {
						let blockId = generateBlockId(); // Generate one block ID per task for simplicity

						// Update the original task in the linked note content
						const updatedContent = linkedContent.replace(/- \[ \] (.+)/g, (match, taskText) => {
							return `- ${taskText} ^${blockId}`; // Removed the double task prefix and added the block ID
						});

						await this.app.vault.modify(linkedFile, updatedContent.replace(/- \[ \] /g, "- #rolled-forward-task "));

						// Extract tasks again, this time for linking
						tasks.forEach(task => {
							let modifiedTask = `- [ ] ${task.slice(6)} [[${linkedNoteTitle}#^${blockId}|↩]]`; // Correct task formatting for the top-level note
							let currentTasks = tasksByNote.get(linkedNoteTitle) || [];
							currentTasks.push(modifiedTask);
							tasksByNote.set(linkedNoteTitle, currentTasks);
						});
					}

					// Recursively process the linked note
					await processLinkedNotes(linkedFile, linkedNoteTitle);
				}
			}
		};

		// Start processing from the current file
		await processLinkedNotes(currentFile);

		// Append rolled-up tasks under headings for each note with backlinks
		if (tasksByNote.size > 0) {
			let topLevelContent = await this.app.vault.read(currentFile);
			tasksByNote.forEach((tasks, noteTitle) => {
				topLevelContent += `\n\n### ${noteTitle} Rolled Up Tasks\n${tasks.join('\n')}`;
			});
			await this.app.vault.modify(currentFile, topLevelContent);
		}
	}

}
