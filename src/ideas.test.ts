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
    expect(container.querySelector<HTMLElement>('.idea-panel__resize-handle')?.getAttribute('role')).toBe('separator');
    expect(container.querySelector<HTMLElement>('.idea-panel__resize-handle')?.getAttribute('aria-valuemin')).toBe('3');
    expect(container.querySelector<HTMLElement>('.idea-panel__resize-handle')?.getAttribute('aria-valuemax')).toBe('9');
    expect(container.querySelector('.idea-panel__index')?.getAttribute('draggable')).toBe('true');
  });

  it('conserva los saltos de línea escritos y los inserta explícitamente con Enter', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Saltos';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();

    const editor = container.querySelector<HTMLElement>('[data-field="text"]')!;
    editor.textContent = 'PrimeraSegunda';
    const range = document.createRange();
    range.setStart(editor.firstChild!, 'Primera'.length);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(editor.innerHTML).toBe('Primera<br>Segunda');
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    expect(repository.projects[0].panels[0].text).toBe('Primera\nSegunda');
    editor.innerHTML = 'Primera<br><br>Segunda<br>';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    expect(repository.projects[0].panels[0].text).toBe('Primera\n\nSegunda\n');
  });

  it('mantiene la altura mínima cuando el editor solo contiene saltos vacíos', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Panel vacío';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();

    const editor = container.querySelector<HTMLElement>('[data-field="text"]')!;
    Object.defineProperty(editor, 'scrollHeight', { configurable: true, value: 1200 });
    editor.innerHTML = '<br><br><br><br>';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    expect(editor.style.height).toBe('');
    expect(editor.closest('.idea-panel')?.style.minHeight).toBe('');
  });

  it('ajusta el ancho dentro de los límites de la rejilla', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Ancho';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();
    container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();

    const handle = container.querySelector<HTMLElement>('.idea-panel__resize-handle')!;
    const board = container.querySelector<HTMLElement>('.board-grid')!;
    Object.defineProperty(board, 'getBoundingClientRect', { value: () => ({ width: 1200 }) });
    const panel = handle.closest<HTMLElement>('.idea-panel')!;
    const sibling = container.querySelectorAll<HTMLElement>('.idea-panel')[1];
    const initialSiblingColumns = sibling.dataset.columns;
    const pointerEvent = (type: string, values: { pointerId: number; clientX: number; button?: number }): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.entries(values).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
      return event;
    };

    handle.dispatchEvent(pointerEvent('pointerdown', { pointerId: 4, clientX: 100, button: 0 }));
    container.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, clientX: 500 }));

    expect(panel.dataset.columns).toBe('5');
    expect(panel.dataset.previewColumns).toBe('9');
    expect(panel.style.getPropertyValue('--resize-preview-offset')).toBe('400px');
    expect(sibling.dataset.columns).toBe(initialSiblingColumns);

    container.dispatchEvent(pointerEvent('pointerup', { pointerId: 4, clientX: 500 }));
    expect(panel.dataset.columns).toBe('9');
    expect(panel.dataset.previewColumns).toBeUndefined();
  });

  it('incluye ocho colores disponibles para los paneles', async () => {
    const input = container.querySelector<HTMLInputElement>('#new-project-name')!;
    input.value = 'Paleta';
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForUi();
    container.querySelector('[data-action="add-panel"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitForUi();

    container.querySelector('[data-action="toggle-colors"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(container.querySelectorAll('.color-swatch')).toHaveLength(8);
    expect(container.querySelector('[data-color="#efa0b8"]')).toBeTruthy();
    expect(container.querySelector('[data-color="#73c9be"]')).toBeTruthy();
    expect(container.querySelector('[data-color="#f0ce68"]')).toBeTruthy();
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

  it('exporta el proyecto como texto plano en orden de paneles', async () => {
    const project: IdeaProject = {
      id: 'export-project',
      name: 'Proyecto compartido',
      panels: [
        { id: 'panel-1', title: 'Primera idea', text: 'Texto **importante**', color: '#d9f17c', columns: 5 },
        { id: 'panel-2', title: '', text: 'Segunda nota', color: '#ffb795', columns: 5 },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    await repository.saveProject(project);
    initIdeas(container, repository);
    await waitForUi();
    container.querySelector('[data-action="open-project"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    let downloadedBlob: Blob | undefined;
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      downloadedBlob = blob;
      return 'blob:test';
    });
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('Proyecto compartido.txt');
      expect(this.href).toBe('blob:test');
    });

    container.querySelector('[data-action="export-project"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(downloadedBlob?.type).toBe('text/plain;charset=utf-8');
    const exportedText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(downloadedBlob!);
    });
    expect(exportedText).toBe(
      'Proyecto compartido\n- Primera idea\nTexto importante\n- Panel sin título\nSegunda nota\n',
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    await waitForUi();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });
});