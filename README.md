# Ideas

Aplicación web para organizar ideas en paneles agrupados por proyecto. Está construida con TypeScript, Vite y Sass; los proyectos se guardan en IndexedDB en el navegador.

## Requisitos

- Node.js 22 o posterior
- npm

## Desarrollo

```bash
npm ci
npm run dev
```

## Comprobaciones

```bash
npm run test -- --run --pool=vmThreads --maxWorkers=1
npm run build
```

## Publicar en GitHub Pages

El workflow de GitHub Actions de este repositorio ejecuta las pruebas y genera la aplicación cuando se actualiza la rama `main`; después publica `dist/` en GitHub Pages. Un owner debe habilitar Pages una vez desde los ajustes del repositorio; no se almacena un token personal para activar esta opción.

1. En GitHub, abre **Settings > Pages** y selecciona **GitHub Actions** como origen de publicación.
2. Sube los cambios a `main` o ejecuta manualmente el workflow **Deploy to GitHub Pages** en la pestaña **Actions**.
3. La dirección del sitio aparecerá en el resultado del despliegue y en **Settings > Pages**.

Para desplegar una copia, haz un fork y activa GitHub Actions y Pages en ese repositorio. La aplicación usa rutas relativas para los recursos y funciona tanto en sitios de proyecto como en dominios propios.

## Datos y privacidad

Los datos se guardan en IndexedDB y permanecen en el navegador y origen donde se creó cada proyecto. No se envían a un servidor ni se sincronizan entre dispositivos. El repositorio no necesita claves de API ni archivos `.env` para funcionar. No incluyas credenciales en cambios futuros; los archivos `.env` están excluidos por Git.

La interfaz almacena texto y formato de negrita. El contenido se escapa al mostrarse y el pegado en el editor se trata como texto plano.