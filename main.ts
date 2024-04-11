import { Plugin, PluginManifest, Notice, TFile, WorkspaceLeaf, MarkdownView } from 'obsidian';

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
		const activeLeaf: WorkspaceLeaf = this.app.workspace.activeLeaf;
		if (!activeLeaf) return;

		if (activeLeaf.view instanceof MarkdownView) {
			const editor = activeLeaf.view.sourceMode.cmEditor;
			const doc = editor.getDoc();
			const newContent = doc.getValue().replace(/- \[ \] /g, '- #rolled-forward-task ');
			doc.setValue(newContent);
		} else {
			new Notice('Active view is not a markdown editor.');
		}
	}

	async rollUpTasks() {
		const currentFile = this.app.workspace.getActiveFile() as TFile | null;
		if (!currentFile) {
			console.log("No active file.");
			return;
		}

		let visitedNotes = new Set<string>();
		let tasksByNote = new Map<string, string[]>();

		const generateBlockId = () => `id-${Math.random().toString(36).substr(2, 9)}`;

		const processLinkedNotes = async (file: TFile, sourceTitle: string | null = null) => {
			let content = await this.app.vault.read(file);
			const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
			let match;

			while ((match = wikilinkRegex.exec(content)) !== null) {
				const linkedNoteTitle = match[1];
				const linkedFile = this.app.vault.getAbstractFileByPath(`${linkedNoteTitle}.md`) as TFile | null;

				if (linkedFile && !visitedNotes.has(linkedFile.path)) {
					visitedNotes.add(linkedFile.path);

					let linkedContent = await this.app.vault.read(linkedFile);
					let tasks = (linkedContent.match(/- \[ \] .+/g) || []).map(task => {
						return `- [ ] ${task.slice(6).trim()} [[${linkedNoteTitle}#^${generateBlockId()}|↩]]`;
					});

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
}
