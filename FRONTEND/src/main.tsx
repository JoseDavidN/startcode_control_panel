import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TokenManager } from '@utils/tokenManager';
import { installOverlayScrollbars } from '@utils/overlayScrollbars';
import { App } from './App.tsx';

async function bootstrap() {
	// Cargar tokens desde el store persistente antes de renderizar
	// para que el interceptor de Axios los tenga disponibles de inmediato.
	await TokenManager.init();

	/* Barras de desplazamiento propias en toda la app (manito para agarrar). */
	installOverlayScrollbars();

	createRoot(document.getElementById('root')!).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

void bootstrap();
