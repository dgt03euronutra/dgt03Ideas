import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initIdeas } from './main';
import type { IdeaProject, IdeasRepository } from './models';

class MemoryRepository implements IdeasRepository {
  projects: IdeaProject[] = [];

  async listProjects(): Promise<IdeaProject[]> {
    return structuredClone(this.projects);
  }

  async saveProject(project: IdeaProject): Promise<void> {
    const index = this.projects.findIndex((item) => item.id === project.id);
    if (index < 0) this.projects.push(structuredClone(project));
    else this.projects[index] = structuredClone(project);
  }

  async deleteProject(id: string): Promise<void> {
    this.projects = this.projects.filter((project) => project.id !== id);
  }
}

describe('tableros de ideas', () => {
  let repository: MemoryRepository;
  let container: HTMLElement;

  beforeEach(async () => {
    repository = new MemoryRepository();
    document.body.innerHTML = '<div id="app"></div>';
    container = document.querySelector('#app') as HTMLElement;
    initIdeas(container, repository);
    await Promise.resolve();
  });

  const waitForUi = async (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

  it('crea un proyecto y abre su tablero', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Cuaderno de viaje';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();

    expect(repository.projects[0].name).toBe('Cuaderno de viaje');
    expect(container.querySelector('.board-view')?.textContent).toContain('Cuaderno de viaje');
  });

  it('mantiene las entradas como texto y no interpreta etiquetas HTML', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Pruebas';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();

    const editor = container.querySelector<HTMLElement>('[data-field="text"]')!;
    editor.textContent = '<img src=x onerror=alert(1)> idea';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    expect(container.querySelector('img')).toBeNull();
    expect(editor.textContent).toBe('<img src=x onerror=alert(1)> idea');
  });

  it('autoajusta el texto y deja los controles en el encabezado', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Notas';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();

    const editor = container.querySelector<HTMLElement>('[data-field="text"]')!;
    Object.defineProperty(editor, 'scrollHeight', { configurable: true, value: 196 });
    editor.textContent = 'Una idea con varias líneas';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    expect(editor.style.height).toBe('196px');
    expect(editor.closest('.idea-panel')?.querySelector('.idea-panel__header .color-picker__current')).toBeTruthy();
    expect(container.querySelector('[data-field="columns"]')).toBeNull();
    expect(container.querySelector('.idea-panel__index')?.getAttribute('draggable')).toBe('true');
  });

  it('muestra un único color actual y permite abrir sus opciones', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Colores';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();

    expect(container.querySelectorAll('.color-picker__current')).toHaveLength(1);
    expect(container.querySelector('.color-picker__options')?.hasAttribute('hidden')).toBe(true);
    container.querySelector('[data-action="toggle-colors"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(container.querySelector('.color-picker__options')?.hasAttribute('hidden')).toBe(false);
    container.querySelector('[data-color="#ffb795"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();
    expect(container.querySelector('.color-picker__current')?.getAttribute('style')).toContain('#ffb795');
    expect(container.querySelector('.color-picker__options')?.hasAttribute('hidden')).toBe(true);
  });

  it('aplica negrita real al texto seleccionado con el botón N', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Formato';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();

    const editor = container.querySelector<HTMLElement>('[data-field="text"]')!;
    editor.textContent = 'Idea destacada';
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const originalExecCommand = document.execCommand;
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: (command: string) => {
        if (command !== 'bold') return false;
        const selection = window.getSelection()!;
        const selected = selection.getRangeAt(0).extractContents();
        const strong = document.createElement('strong');
        strong.append(selected);
        selection.getRangeAt(0).insertNode(strong);
        return true;
      },
    });
    try {
      container.querySelector('[data-action="toggle-bold"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      container.querySelector('[data-action="toggle-bold"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(editor.querySelector('strong')?.textContent).toBe('Idea destacada');
      expect(container.querySelector('[data-action="toggle-bold"]')?.getAttribute('aria-pressed')).toBe('true');
    } finally {
      Object.defineProperty(document, 'execCommand', { configurable: true, value: originalExecCommand });
    }
  });

  it('previsualiza el lado de inserción y reordena al soltar', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Orden';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    for (let index = 0; index < 3; index += 1) {
      container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitForUi();
    }

    const panelsBefore = repository.projects[0].panels.map((panel) => panel.id);
    const sourceHandle = container.querySelectorAll<HTMLElement>('.idea-panel__index')[0];
    const destination = container.querySelectorAll<HTMLElement>('.idea-panel')[1];
    const dragStart = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStart, 'dataTransfer', { value: { effectAllowed: '', setData: vi.fn() } });
    sourceHandle.dispatchEvent(dragStart);
    const dragOver = new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 10 });
    Object.defineProperty(dragOver, 'dataTransfer', { value: { dropEffect: '' } });
    destination.dispatchEvent(dragOver);

    expect(destination.classList.contains('idea-panel--drop-after')).toBe(true);
    destination.dispatchEvent(new MouseEvent('drop', { bubbles: true, cancelable: true }));
    await waitForUi();
    expect(repository.projects[0].panels.map((panel) => panel.id)).toEqual([
      panelsBefore[1], panelsBefore[0], panelsBefore[2],
    ]);
  });

  it('mantiene el proyecto cuando se cancela la confirmación de borrado', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Proyecto protegido';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    container.querySelector('[data-action="home"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    container.querySelector('[data-action="delete-project"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(confirm).toHaveBeenCalledWith('¿Eliminar el proyecto «Proyecto protegido» y todos sus paneles?');
    expect(repository.projects).toHaveLength(1);
    confirm.mockRestore();
  });
});