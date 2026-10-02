export interface IdeaPanel {
  id: string;
  title: string;
  text: string;
  color: string;
  columns: number;
}

export interface IdeaProject {
  id: string;
  name: string;
  panels: IdeaPanel[];
  createdAt: number;
  updatedAt: number;
}

export interface IdeasRepository {
  listProjects(): Promise<IdeaProject[]>;
  saveProject(project: IdeaProject): Promise<void>;
  deleteProject(id: string): Promise<void>;
}

export const PANEL_COLORS = [
  { name: 'Lima', value: '#d9f17c' },
  { name: 'Melocotón', value: '#ffb795' },
  { name: 'Cielo', value: '#a9d9ef' },
  { name: 'Lavanda', value: '#c8b9f2' },
  { name: 'Menta', value: '#a9dfc4' },
  { name: 'Rosa', value: '#efa0b8' },
  { name: 'Turquesa', value: '#73c9be' },
  { name: 'Amarillo', value: '#f0ce68' },
] as const;

export function cleanText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}