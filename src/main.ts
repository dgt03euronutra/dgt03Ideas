import './styles.scss';
import { IndexedDbIdeasRepository } from './database';
import { cleanText, PANEL_COLORS } from './models';
import type { IdeaPanel, IdeaProject, IdeasRepository } from './models';

const app = document.querySelector<HTMLDivElement>('#app');
const MAX_PROJECT_NAME = 80;
const MAX_PANEL_TITLE = 80;
const MAX_PANEL_TEXT = 20000;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function renderPanelText(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function serializeEditorNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return [...node.childNodes].map(serializeEditorNode).join('');
  if (node.tagName === 'BR') return '\n';
  const contents = [...node.childNodes].map(serializeEditorNode).join('');
  if (node.tagName === 'STRONG' || node.tagName === 'B') return `**${contents}**`;
  if ((node.tagName === 'DIV' || node.tagName === 'P') && node.parentElement && node.getAttribute('contenteditable') !== 'true') {
    return `${contents}\n`;
  }
  return contents;
}

function insertPlainTextAtSelection(editor: HTMLElement, text: string): void {
  const selection = window.getSelection();
  if (!selection) return;
  let range: Range;
  if (selection.rangeCount && editor.contains(selection.anchorNode)) {
    range = selection.getRangeAt(0);
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, index) => {
    if (index > 0) fragment.append(document.createElement('br'));
    if (line) fragment.append(document.createTextNode(line));
  });
  const lastNode = fragment.lastChild;
  if (lastNode) {
    range.insertNode(fragment);
    range.setStartAfter(lastNode);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function createProjectText(project: IdeaProject): string {
  const panels = project.panels.map((panel) => {
    const title = panel.title.trim() || 'Panel sin título';
    const text = panel.text.replace(/\*\*([\s\S]+?)\*\*/g, '$1');
    return `- ${title}\n${text}`;
  });
  return [project.name, ...panels].join('\n') + '\n';
}

function downloadProject(project: IdeaProject): void {
  const blob = new Blob([createProjectText(project)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filename = project.name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim() || 'proyecto';
  link.href = url;
  link.download = `${filename}.txt`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createId(): string {
  return crypto.randomUUID();
}

function createPanel(): IdeaPanel {
  return {
    id: createId(),
    title: '',
    text: '',
    color: PANEL_COLORS[0].value,
    columns: 5,
  };
}

export function initIdeas(container: HTMLElement, repository: IdeasRepository): void {
  let projects: IdeaProject[] = [];
  let activeProjectId: string | null = null;
  let draggedPanelId: string | null = null;
  let dropAfter = false;
  let saveTimer: number | undefined;
  let feedback = '';
  let savedBoldRange: Range | null = null;

  const activeProject = (): IdeaProject | undefined =>
    projects.find((project) => project.id === activeProjectId);

  const persist = async (project: IdeaProject): Promise<void> => {
    project.updatedAt = Date.now();
    try {
      await repository.saveProject(project);
      feedback = 'Guardado';
      window.setTimeout(() => {
        if (feedback === 'Guardado') feedback = '';
        container.querySelector('.ideas__save-state')?.replaceChildren(feedback);
      }, 1600);
    } catch {
      feedback = 'No se pudo guardar';
      container.querySelector('.ideas__save-state')?.replaceChildren(feedback);
    }
  };

  const scheduleSave = (project: IdeaProject): void => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void persist(project), 250);
  };

  const fitEditor = (editor: HTMLElement): void => {
    const visibleText = serializeEditorNode(editor).replace(/\*\*/g, '').replace(/\u200B/g, '');
    if (!visibleText.trim()) {
      editor.style.height = '';
      return;
    }
    editor.style.height = 'auto';
    editor.style.height = `${editor.scrollHeight}px`;
  };

  const renderHome = (): void => {
    const rows = projects.map((project) => `
      <article class="project-row">
        <button class="project-row__open" type="button" data-action="open-project" data-id="${escapeHtml(project.id)}">
          <span class="project-row__icon" aria-hidden="true">${escapeHtml(project.name.slice(0, 1).toUpperCase() || 'I')}</span>
          <span class="project-row__details">
            <span class="project-row__name">${escapeHtml(project.name)}</span>
            <span class="project-row__meta">${project.panels.length} ${project.panels.length === 1 ? 'panel' : 'paneles'} · Actualizado ${new Date(project.updatedAt).toLocaleDateString('es-ES')}</span>
          </span>
          <span class="project-row__arrow" aria-hidden="true">↗</span>
        </button>
        <div class="project-row__actions">
          <button class="icon-button" type="button" title="Cambiar nombre" aria-label="Cambiar nombre de ${escapeHtml(project.name)}" data-action="rename-project" data-id="${escapeHtml(project.id)}">···</button>
          <button class="icon-button icon-button--danger" type="button" title="Eliminar proyecto" aria-label="Eliminar ${escapeHtml(project.name)}" data-action="delete-project" data-id="${escapeHtml(project.id)}">×</button>
        </div>
      </article>`).join('');

    container.innerHTML = `
      <main class="ideas-shell">
        <header class="topbar">
          <a class="brand" href="#" data-action="home"><span class="brand__mark" aria-hidden="true">i</span><span>ideas<span class="brand__period">.</span></span></a>
          <span class="topbar__caption">ESPACIO PERSONAL</span>
          <span class="topbar__local"><span></span> Almacenamiento local</span>
        </header>
        <section class="home-view">
          <div class="home-heading">
            <div><p class="eyebrow">TU ESPACIO DE TRABAJO</p><h1>Ideas en marcha<span>.</span></h1><p class="home-heading__description">Cada proyecto empieza con una página en blanco.</p></div>
            <form class="create-project" data-form="create-project">
              <label class="visually-hidden" for="new-project-name">Nombre del proyecto</label>
              <input id="new-project-name" name="name" maxlength="${MAX_PROJECT_NAME}" placeholder="Nombre del proyecto" required autocomplete="off">
              <button class="button button--dark" type="submit"><span aria-hidden="true">+</span> Crear proyecto</button>
            </form>
          </div>
          <div class="section-label"><h2>Proyectos</h2><span>${projects.length.toString().padStart(2, '0')}</span></div>
          <div class="project-list">${rows || '<div class="empty-state"><span class="empty-state__glyph" aria-hidden="true">✳</span><p>Aún no hay proyectos</p><span>Crea uno para empezar a reunir tus ideas.</span></div>'}</div>
          <footer class="home-footer"><span>IDEAS · ESPACIO PRIVADO</span><span>Los cambios se guardan en este dispositivo</span></footer>
        </section>
      </main>`;
  };

  const renderProject = (): void => {
    const project = activeProject();
    if (!project) {
      activeProjectId = null;
      renderHome();
      return;
    }

    const panels = project.panels.map((panel, index) => `
      <article class="idea-panel" data-panel-id="${escapeHtml(panel.id)}" data-columns="${Math.max(3, Math.min(9, panel.columns))}" style="--panel-color:${panel.color}">
        <header class="idea-panel__header">
          <span class="idea-panel__index" draggable="true" title="Arrastra para ordenar" aria-label="Arrastra para ordenar">${String(index + 1).padStart(2, '0')}</span>
          <input class="idea-panel__title" data-field="title" value="${escapeHtml(panel.title)}" maxlength="${MAX_PANEL_TITLE}" placeholder="Título del panel" aria-label="Título del panel">
          <label class="panel-width-control" title="Ancho del panel">
            <span class="visually-hidden">Ancho del panel</span>
            <input data-field="columns" type="range" min="3" max="9" value="${Math.max(3, Math.min(9, panel.columns))}" aria-label="Ancho del panel">
            <span class="panel-width-control__value">${Math.max(3, Math.min(9, panel.columns))}/12</span>
          </label>
          <div class="color-picker">
            <button class="color-picker__current" type="button" data-action="toggle-colors" title="Cambiar color" aria-label="Color del panel" aria-expanded="false" style="--swatch-color:${panel.color}"></button>
            <div class="color-picker__options" role="group" aria-label="Colores del panel" hidden>${PANEL_COLORS.map((color) => `<button class="color-swatch${panel.color === color.value ? ' color-swatch--selected' : ''}" type="button" data-action="set-color" data-color="${color.value}" title="${color.name}" aria-label="Color ${color.name}" aria-pressed="${panel.color === color.value}" style="--swatch-color:${color.value}"></button>`).join('')}</div>
          </div>
          <button class="format-button" type="button" data-action="toggle-bold" title="Negrita" aria-label="Alternar negrita" aria-pressed="false">N</button>
          <button class="icon-button icon-button--danger idea-panel__delete" type="button" data-action="delete-panel" data-id="${escapeHtml(panel.id)}" title="Eliminar panel" aria-label="Eliminar panel">×</button>
        </header>
        <div class="idea-panel__text" data-field="text" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Texto de la idea" data-placeholder="Escribe una idea, una pregunta o cualquier nota...">${renderPanelText(panel.text)}</div>
      </article>`).join('');

    container.innerHTML = `
      <main class="ideas-shell ideas-shell--board">
        <header class="topbar">
          <a class="brand" href="#" data-action="home"><span class="brand__mark" aria-hidden="true">i</span><span>ideas<span class="brand__period">.</span></span></a>
          <span class="topbar__caption">ESPACIO PERSONAL</span>
          <span class="topbar__local"><span></span> Almacenamiento local</span>
        </header>
        <section class="board-view">
          <nav class="breadcrumbs" aria-label="Ruta"><button type="button" data-action="home">Proyectos</button><span>/</span><span>${escapeHtml(project.name)}</span></nav>
          <div class="board-heading">
            <div><p class="eyebrow">PROYECTO</p><h1>${escapeHtml(project.name)}</h1><p class="board-heading__meta">${project.panels.length} ${project.panels.length === 1 ? 'panel de ideas' : 'paneles de ideas'}</p></div>
            <div class="board-heading__actions"><span class="ideas__save-state" aria-live="polite">${feedback}</span><button class="button button--outline" type="button" data-action="export-project"><span aria-hidden="true">↓</span> Exportar .txt</button><button class="button button--lime" type="button" data-action="add-panel"><span aria-hidden="true">+</span> Nuevo panel</button></div>
          </div>
          <div class="board-grid">${panels || '<div class="board-empty"><span aria-hidden="true">✳</span><p>Tu tablero está listo</p><span>Añade un panel para capturar la primera idea.</span><button class="button button--dark" type="button" data-action="add-panel">+ Añadir primer panel</button></div>'}</div>
          <footer class="board-footer"><span>ORDENA TUS IDEAS</span><span>Arrastra el número del encabezado · El panel crece con el texto</span></footer>
        </section>
      </main>`;
    container.querySelectorAll<HTMLElement>('.idea-panel__text').forEach(fitEditor);
  };

  const render = (): void => activeProject() ? renderProject() : renderHome();

  container.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.form !== 'create-project') return;
    event.preventDefault();
    const data = new FormData(form);
    const name = cleanText(String(data.get('name') ?? '').trim(), MAX_PROJECT_NAME);
    if (!name) return;
    const now = Date.now();
    const project: IdeaProject = { id: createId(), name, panels: [], createdAt: now, updatedAt: now };
    projects.unshift(project);
    void persist(project).then(() => {
      activeProjectId = project.id;
      feedback = '';
      renderProject();
    });
  });

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.color-picker')) {
      container.querySelectorAll<HTMLButtonElement>('[data-action="toggle-colors"]').forEach((toggle) => {
        toggle.setAttribute('aria-expanded', 'false');
        const options = toggle.closest('.color-picker')?.querySelector<HTMLElement>('.color-picker__options');
        if (options) options.hidden = true;
      });
    }
    const button = target.closest<HTMLButtonElement | HTMLAnchorElement>('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'home') {
      event.preventDefault();
      activeProjectId = null;
      feedback = '';
      renderHome();
    } else if (action === 'open-project' && id) {
      activeProjectId = id;
      feedback = '';
      renderProject();
    } else if (action === 'add-panel') {
      const project = activeProject();
      if (!project) return;
      project.panels.push(createPanel());
      void persist(project).then(renderProject);
    } else if (action === 'export-project') {
      const project = activeProject();
      if (project) downloadProject(project);
    } else if (action === 'delete-panel' && id) {
      const project = activeProject();
      if (!project || !window.confirm('¿Eliminar este panel? Esta acción no se puede deshacer.')) return;
      project.panels = project.panels.filter((panel) => panel.id !== id);
      void persist(project).then(renderProject);
    } else if (action === 'toggle-colors') {
      const picker = button.closest('.color-picker');
      const options = picker?.querySelector<HTMLElement>('.color-picker__options');
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      container.querySelectorAll<HTMLButtonElement>('[data-action="toggle-colors"]').forEach((toggle) => {
        toggle.setAttribute('aria-expanded', 'false');
        const list = toggle.closest('.color-picker')?.querySelector<HTMLElement>('.color-picker__options');
        if (list) list.hidden = true;
      });
      if (!isExpanded && options) {
        options.hidden = false;
        button.setAttribute('aria-expanded', 'true');
      }
    } else if (action === 'toggle-bold') {
      const panelElement = button.closest<HTMLElement>('[data-panel-id]');
      const editor = panelElement?.querySelector<HTMLElement>('[data-field="text"]');
      if (!editor || !savedBoldRange) return;
      editor.focus();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedBoldRange);
      const wasBold = button.getAttribute('aria-pressed') === 'true';
      document.execCommand('bold');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      button.classList.toggle('format-button--active', !wasBold);
      button.setAttribute('aria-pressed', String(!wasBold));
    } else if (action === 'set-color') {
      const project = activeProject();
      const panel = project?.panels.find((item) => item.id === target.closest<HTMLElement>('[data-panel-id]')?.dataset.panelId);
      if (!project || !panel || !PANEL_COLORS.some((color) => color.value === button.dataset.color)) return;
      panel.color = button.dataset.color!;
      scheduleSave(project);
      renderProject();
    } else if (action === 'rename-project' && id) {
      const project = projects.find((item) => item.id === id);
      if (!project) return;
      const nextName = window.prompt('Nombre del proyecto', project.name);
      if (nextName === null) return;
      project.name = cleanText(nextName.trim(), MAX_PROJECT_NAME);
      if (!project.name) return;
      void persist(project).then(renderHome);
    } else if (action === 'delete-project' && id) {
      const project = projects.find((item) => item.id === id);
      if (!project || !window.confirm(`¿Eliminar el proyecto «${project.name}» y todos sus paneles?`)) return;
      void repository.deleteProject(id).then(() => {
        projects = projects.filter((item) => item.id !== id);
        renderHome();
      });
    }
  });

  container.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLElement)) return;
    const project = activeProject();
    const panel = project?.panels.find((item) => item.id === target.closest<HTMLElement>('[data-panel-id]')?.dataset.panelId);
    if (!project || !panel) return;
    if (target.dataset.field === 'title') panel.title = cleanText(target.value, MAX_PANEL_TITLE);
    if (target.dataset.field === 'text' && target instanceof HTMLElement) {
      panel.text = cleanText(serializeEditorNode(target), MAX_PANEL_TEXT);
      updateBoldButton(target);
      fitEditor(target);
    }
    if (target.dataset.field === 'columns' && target instanceof HTMLInputElement) {
      panel.columns = Math.max(3, Math.min(9, Number(target.value)));
      target.value = String(panel.columns);
      const panelElement = target.closest<HTMLElement>('.idea-panel');
      if (panelElement) panelElement.dataset.columns = String(panel.columns);
      target.closest('.panel-width-control')?.querySelector('.panel-width-control__value')?.replaceChildren(`${panel.columns}/12`);
    }
    scheduleSave(project);
  });

  container.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.field !== 'text' || event.key !== 'Enter') return;
    event.preventDefault();
    insertPlainTextAtSelection(target, '\n');
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const updateBoldButton = (editor: HTMLElement): void => {
    const selection = window.getSelection();
    const isInsideEditor = !!selection?.anchorNode && editor.contains(selection.anchorNode);
    const isBold = isInsideEditor && (typeof document.queryCommandState === 'function'
      ? document.queryCommandState('bold')
      : !!(selection?.anchorNode instanceof Element
        ? selection.anchorNode.closest('strong, b')
        : selection?.anchorNode?.parentElement?.closest('strong, b')));
    const button = editor.closest<HTMLElement>('.idea-panel')?.querySelector<HTMLButtonElement>('[data-action="toggle-bold"]');
    button?.classList.toggle('format-button--active', !!isBold);
    button?.setAttribute('aria-pressed', String(!!isBold));
  };

  container.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-action="toggle-bold"]')) return;
    const selection = window.getSelection();
    const editor = container.querySelector<HTMLElement>('[data-field="text"]:focus');
    if (editor && selection?.rangeCount && editor.contains(selection.anchorNode)) {
      savedBoldRange = selection.getRangeAt(0).cloneRange();
    }
    event.preventDefault();
  });

  container.addEventListener('paste', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-field="text"]')) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const editor = target.closest<HTMLElement>('[data-field="text"]');
    if (!editor) return;
    insertPlainTextAtSelection(editor, text);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });

  container.addEventListener('drop', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-field="text"]')) return;
    event.preventDefault();
  });

  container.addEventListener('select', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.field !== 'text') return;
    const selection = window.getSelection();
    if (selection?.rangeCount && target.contains(selection.anchorNode)) {
      savedBoldRange = selection.getRangeAt(0).cloneRange();
      updateBoldButton(target);
    }
  });

  document.addEventListener('selectionchange', () => {
    const activeEditor = container.querySelector<HTMLElement>('[data-field="text"]:focus');
    const selection = window.getSelection();
    if (activeEditor && selection?.rangeCount && activeEditor.contains(selection.anchorNode)) {
      savedBoldRange = selection.getRangeAt(0).cloneRange();
      updateBoldButton(activeEditor);
    }
  });

  container.addEventListener('dragstart', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.idea-panel__index')) return;
    const panel = target.closest<HTMLElement>('[data-panel-id]');
    if (!panel) return;
    draggedPanelId = panel.dataset.panelId ?? null;
    dropAfter = false;
    container.querySelectorAll('.idea-panel--drop-before, .idea-panel--drop-after').forEach((item) => {
      item.classList.remove('idea-panel--drop-before', 'idea-panel--drop-after');
    });
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedPanelId ?? '');
    }
    panel.classList.add('idea-panel--dragging');
  });

  container.addEventListener('dragover', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const destinationPanel = target.closest<HTMLElement>('[data-panel-id]');
    if (!destinationPanel || destinationPanel.dataset.panelId === draggedPanelId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    container.querySelectorAll('.idea-panel--drop-before, .idea-panel--drop-after').forEach((item) => {
      item.classList.remove('idea-panel--drop-before', 'idea-panel--drop-after');
    });
    const bounds = destinationPanel.getBoundingClientRect();
    dropAfter = event.clientX >= bounds.left + bounds.width / 2;
    destinationPanel.classList.add(dropAfter ? 'idea-panel--drop-after' : 'idea-panel--drop-before');
  });

  container.addEventListener('drop', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const destinationPanel = target.closest<HTMLElement>('[data-panel-id]');
    const destination = destinationPanel?.dataset.panelId;
    const project = activeProject();
    if (!project || !draggedPanelId || !destination || draggedPanelId === destination) return;
    event.preventDefault();
    const sourceIndex = project.panels.findIndex((panel) => panel.id === draggedPanelId);
    const destinationIndex = project.panels.findIndex((panel) => panel.id === destination);
    if (sourceIndex < 0 || destinationIndex < 0) return;
    const [moved] = project.panels.splice(sourceIndex, 1);
    const adjustedDestination = sourceIndex < destinationIndex ? destinationIndex - 1 : destinationIndex;
    project.panels.splice(adjustedDestination + Number(dropAfter), 0, moved);
    draggedPanelId = null;
    dropAfter = false;
    void persist(project).then(renderProject);
  });

  container.addEventListener('dragend', () => {
    draggedPanelId = null;
    dropAfter = false;
    container.querySelector('.idea-panel--dragging')?.classList.remove('idea-panel--dragging');
    container.querySelectorAll('.idea-panel--drop-before, .idea-panel--drop-after').forEach((item) => {
      item.classList.remove('idea-panel--drop-before', 'idea-panel--drop-after');
    });
  });

  void repository.listProjects().then((storedProjects) => {
    projects = storedProjects;
    render();
  }).catch(() => {
    feedback = 'No se pudo abrir el almacenamiento local';
    renderHome();
  });
}

if (app) initIdeas(app, new IndexedDbIdeasRepository());